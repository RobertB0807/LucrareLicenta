from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime
from math import ceil
from threading import Lock
from time import monotonic
from typing import Annotated

from fastapi import FastAPI, HTTPException, Path, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, NonNegativeInt, StringConstraints
from jwt import InvalidTokenError
from sqlalchemy.exc import SQLAlchemyError

from assistant_service import build_assistant_answer
from auth_service import (
    AuthenticatedUser,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from db import init_db
from firebase_auth_service import verify_firebase_id_token
from persistence_repository import (
    create_or_update_firebase_user,
    create_user,
    ensure_session_owner,
    fetch_scenario_session_owner,
    fetch_user_by_email,
    fetch_user_by_id,
)
from scenario_models import AttackType, DifficultyLevel
from training_service import (
    EvaluateScenarioResponse,
    GenerateScenarioResponse,
    LearningProfileResponse,
    ScenarioCatalogResponse,
    SessionEventsResponse,
    SessionSnapshotResponse,
    SessionTrendAggregatesResponse,
    SessionTrendsResponse,
    get_learning_profile as get_training_learning_profile,
    get_scenario_catalog as get_training_scenario_catalog,
    evaluate_scenario as evaluate_training_scenario,
    generate_scenario as generate_training_scenario,
    get_session_events as get_training_session_events,
    get_session_snapshot as get_training_session_snapshot,
    get_session_trend_aggregates as get_training_session_trend_aggregates,
    get_session_trends as get_training_session_trends,
)

app = FastAPI(title="CyberSecurity Training API", version="0.2.0")

ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
OptionId = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=64, pattern=ID_PATTERN),
]
ScenarioId = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=128, pattern=ID_PATTERN),
]
SessionId = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=128, pattern=ID_PATTERN),
]
UserEmail = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        min_length=3,
        max_length=254,
        pattern=EMAIL_PATTERN,
    ),
]
UserPassword = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=8, max_length=128),
]
DisplayName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=2, max_length=64),
]


class SlidingWindowRateLimiter:
    def __init__(self, limits: dict[str, tuple[int, int]]) -> None:
        self._limits = limits.copy()
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _resolve_client_key(self, request: Request) -> str:
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            first_hop = forwarded_for.split(",", maxsplit=1)[0].strip()
            if first_hop:
                return first_hop
        if request.client and request.client.host:
            return request.client.host
        return "anonymous"

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def configure_limits(self, limits: dict[str, tuple[int, int]]) -> None:
        with self._lock:
            self._limits = limits.copy()
            self._hits.clear()

    def snapshot_limits(self) -> dict[str, tuple[int, int]]:
        with self._lock:
            return self._limits.copy()

    def retry_after_seconds(self, request: Request) -> int | None:
        path = request.url.path
        limit_cfg = self._limits.get(path)
        if limit_cfg is None:
            return None

        max_requests, window_seconds = limit_cfg
        now = monotonic()
        window_start = now - window_seconds
        client_key = f"{path}:{self._resolve_client_key(request)}"

        with self._lock:
            hits = self._hits[client_key]
            while hits and hits[0] <= window_start:
                hits.popleft()

            if len(hits) >= max_requests:
                retry_after = max(1, ceil(window_seconds - (now - hits[0])))
                return retry_after

            hits.append(now)
            return None


rate_limiter = SlidingWindowRateLimiter(
    limits={
        "/scenario/generate": (30, 60),
        "/scenario/evaluate": (60, 60),
        "/assistant/ask": (60, 60),
    }
)

class GenerateScenarioRequest(BaseModel):
    attack_type: AttackType = "phishing"
    difficulty: DifficultyLevel = "easy"
    session_id: SessionId | None = None


class EvaluateScenarioRequest(BaseModel):
    scenario_id: ScenarioId
    selected_option_id: OptionId


AssistantMessage = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=1000),
]


class AssistantAskRequest(BaseModel):
    message: AssistantMessage
    session_id: SessionId | None = None
    attack_type: AttackType | None = None
    difficulty: DifficultyLevel | None = None


class AssistantAskResponse(BaseModel):
    answer: str
    quick_tips: list[str]


class AuthRegisterRequest(BaseModel):
    email: UserEmail
    password: UserPassword
    display_name: DisplayName


class AuthLoginRequest(BaseModel):
    email: UserEmail
    password: UserPassword


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    is_active: bool


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


def is_public_path(path: str) -> bool:
    if path in {"/health", "/auth/register", "/auth/login"}:
        return True
    if path.startswith("/docs") or path.startswith("/openapi") or path.startswith("/redoc"):
        return True
    return False


def require_authenticated_user(request: Request) -> AuthenticatedUser:
    user = getattr(request.state, "current_user", None)
    if not isinstance(user, AuthenticatedUser):
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def cors_headers_for(request: Request) -> dict[str, str]:
    origin = request.headers.get("origin") or "*"
    requested_headers = request.headers.get("access-control-request-headers") or "*"
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": requested_headers,
    }


@app.middleware("http")
async def enforce_rate_limits(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    retry_after = rate_limiter.retry_after_seconds(request)
    if retry_after is not None:
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Try again later."},
            headers={
                "Retry-After": str(retry_after),
                **cors_headers_for(request),
            },
        )
    return await call_next(request)


@app.middleware("http")
async def enforce_authentication(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    if is_public_path(request.url.path):
        return await call_next(request)

    authorization = request.headers.get("authorization", "")
    if not authorization.startswith("Bearer "):
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
            headers=cors_headers_for(request),
        )

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
            headers=cors_headers_for(request),
        )

    try:
        user_data = None
        firebase_identity = None
        try:
            firebase_identity = verify_firebase_id_token(token)
        except InvalidTokenError:
            firebase_identity = None

        if firebase_identity is not None:
            user_data = create_or_update_firebase_user(
                firebase_uid=firebase_identity.uid,
                email=firebase_identity.email,
                display_name=firebase_identity.display_name,
            )
        else:
            payload = decode_access_token(token)
            subject = payload.get("sub")
            if not isinstance(subject, str) or not subject:
                raise InvalidTokenError("Missing token subject")
            user_data = fetch_user_by_id(subject)

        if user_data is None or not user_data.get("is_active", False):
            raise InvalidTokenError("User not found")

        request.state.current_user = AuthenticatedUser(
            id=user_data["id"],
            email=user_data["email"],
            display_name=user_data["display_name"],
            is_active=bool(user_data["is_active"]),
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=409,
            content={"detail": str(exc)},
            headers=cors_headers_for(request),
        )
    except (InvalidTokenError, SQLAlchemyError):
        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid authentication token"},
            headers=cors_headers_for(request),
        )

    return await call_next(request)


# Keep CORS open for local MVP development.
# It must wrap auth/rate-limit middleware so even early 401/429 responses include CORS headers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/register", response_model=AuthTokenResponse)
def register(payload: AuthRegisterRequest) -> AuthTokenResponse:
    try:
        user = create_user(
            email=payload.email,
            password_hash=hash_password(payload.password),
            display_name=payload.display_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    token = create_access_token(user_id=user["id"], email=user["email"])
    return AuthTokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            display_name=user["display_name"],
            is_active=bool(user["is_active"]),
        ),
    )


@app.post("/auth/login", response_model=AuthTokenResponse)
def login(payload: AuthLoginRequest) -> AuthTokenResponse:
    user = fetch_user_by_email(payload.email)
    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("is_active", False):
        raise HTTPException(status_code=403, detail="User account is inactive")

    token = create_access_token(user_id=user["id"], email=user["email"])
    return AuthTokenResponse(
        access_token=token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            display_name=user["display_name"],
            is_active=bool(user["is_active"]),
        ),
    )


@app.post("/auth/refresh", response_model=AuthTokenResponse)
def refresh_token(request: Request) -> AuthTokenResponse:
    current_user = require_authenticated_user(request)
    token = create_access_token(user_id=current_user.id, email=current_user.email)
    return AuthTokenResponse(
        access_token=token,
        user=UserResponse.model_validate(current_user.model_dump()),
    )


@app.get("/auth/me", response_model=UserResponse)
def get_me(request: Request) -> UserResponse:
    current_user = require_authenticated_user(request)
    return UserResponse.model_validate(current_user.model_dump())


@app.get("/learning/profile", response_model=LearningProfileResponse)
def get_learning_profile(request: Request = None) -> LearningProfileResponse:
    current_user = require_authenticated_user(request)
    return get_training_learning_profile(current_user.id)


@app.post("/scenario/generate", response_model=GenerateScenarioResponse)
def generate_scenario(
    payload: GenerateScenarioRequest,
    request: Request = None,
) -> GenerateScenarioResponse:
    owner_user_id: str | None = None
    if request is not None:
        current_user = require_authenticated_user(request)
        owner_user_id = current_user.id
        if payload.session_id and not ensure_session_owner(payload.session_id, current_user.id):
            raise HTTPException(status_code=404, detail="Session not found")

    return generate_training_scenario(
        attack_type=payload.attack_type,
        difficulty=payload.difficulty,
        session_id=payload.session_id,
        owner_user_id=owner_user_id,
    )


@app.post("/scenario/evaluate", response_model=EvaluateScenarioResponse)
def evaluate_scenario(
    payload: EvaluateScenarioRequest,
    request: Request = None,
) -> EvaluateScenarioResponse:
    if request is not None:
        current_user = require_authenticated_user(request)
        context = fetch_scenario_session_owner(payload.scenario_id)
        if context is not None and not ensure_session_owner(context["session_id"], current_user.id):
            raise HTTPException(status_code=404, detail="Scenario not found")

    try:
        return evaluate_training_scenario(
            scenario_id=payload.scenario_id,
            selected_option_id=payload.selected_option_id,
            owner_user_id=current_user.id if request is not None else None,
        )
    except KeyError as exc:
        detail = exc.args[0] if exc.args else "Scenario not found"
        raise HTTPException(status_code=404, detail=detail) from exc


@app.get("/scenario/catalog", response_model=ScenarioCatalogResponse)
def get_scenario_catalog(request: Request = None) -> ScenarioCatalogResponse:
    if request is not None:
        require_authenticated_user(request)
    return get_training_scenario_catalog()


@app.post("/assistant/ask", response_model=AssistantAskResponse)
def assistant_ask(
    payload: AssistantAskRequest,
    request: Request = None,
) -> AssistantAskResponse:
    if request is not None:
        current_user = require_authenticated_user(request)
        if payload.session_id and not ensure_session_owner(payload.session_id, current_user.id):
            raise HTTPException(status_code=404, detail="Session not found")

    answer, quick_tips = build_assistant_answer(
        message=payload.message,
        attack_type=payload.attack_type,
        difficulty=payload.difficulty,
    )
    return AssistantAskResponse(answer=answer, quick_tips=quick_tips)


@app.get("/session/{session_id}", response_model=SessionSnapshotResponse)
def get_session_snapshot(
    session_id: Annotated[str, Path(min_length=1, max_length=128, pattern=ID_PATTERN)],
    request: Request = None,
) -> SessionSnapshotResponse:
    if request is not None:
        current_user = require_authenticated_user(request)
        if not ensure_session_owner(session_id, current_user.id):
            raise HTTPException(status_code=404, detail="Session not found")

    snapshot = get_training_session_snapshot(session_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return snapshot


@app.get("/session/{session_id}/events", response_model=SessionEventsResponse)
def get_session_events(
    session_id: Annotated[str, Path(min_length=1, max_length=128, pattern=ID_PATTERN)],
    limit: int = Query(default=20, gt=0, le=100),
    offset: NonNegativeInt = 0,
    since: datetime | None = None,
    until: datetime | None = None,
    request: Request = None,
) -> SessionEventsResponse:
    if request is not None:
        current_user = require_authenticated_user(request)
        if not ensure_session_owner(session_id, current_user.id):
            raise HTTPException(status_code=404, detail="Session not found")

    events = get_training_session_events(
        session_id,
        limit=limit,
        offset=offset,
        since=since,
        until=until,
    )
    if events is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return events


@app.get("/session/{session_id}/trends", response_model=SessionTrendsResponse)
def get_session_trends(
    session_id: Annotated[str, Path(min_length=1, max_length=128, pattern=ID_PATTERN)],
    limit: int = Query(default=30, gt=0, le=200),
    offset: NonNegativeInt = 0,
    attack_type: AttackType | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    request: Request = None,
) -> SessionTrendsResponse:
    if request is not None:
        current_user = require_authenticated_user(request)
        if not ensure_session_owner(session_id, current_user.id):
            raise HTTPException(status_code=404, detail="Session not found")

    trends = get_training_session_trends(
        session_id,
        limit=limit,
        offset=offset,
        attack_type=attack_type,
        since=since,
        until=until,
    )
    if trends is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return trends


@app.get("/session/{session_id}/trends/aggregate", response_model=SessionTrendAggregatesResponse)
def get_session_trend_aggregates(
    session_id: Annotated[str, Path(min_length=1, max_length=128, pattern=ID_PATTERN)],
    attack_type: AttackType | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    request: Request = None,
) -> SessionTrendAggregatesResponse:
    if request is not None:
        current_user = require_authenticated_user(request)
        if not ensure_session_owner(session_id, current_user.id):
            raise HTTPException(status_code=404, detail="Session not found")

    aggregates = get_training_session_trend_aggregates(
        session_id,
        attack_type=attack_type,
        since=since,
        until=until,
    )
    if aggregates is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return aggregates
