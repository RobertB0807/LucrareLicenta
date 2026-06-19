from __future__ import annotations

from datetime import datetime
import logging
import secrets
from time import monotonic
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Path, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, NonNegativeInt, StringConstraints
from jwt import InvalidTokenError
from redis.exceptions import RedisError
from sqlalchemy.exc import SQLAlchemyError

from app_config import load_runtime_settings, validate_runtime_config
from assistant_service import answer_assistant
from auth_service import (
    AuthenticatedUser,
    JWT_ACCESS_EXPIRATION_MINUTES,
    JWT_SECRET_KEY,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
import db
from firebase_auth_service import (
    delete_firebase_user,
    update_firebase_user_display_name,
    verify_firebase_id_token,
)
from learning_path_service import (
    LearningAssessmentRequiredError,
    LearningPathLessonCompletionResponse,
    LearningPathLockedError,
    LearningPathResponse,
    build_learning_path,
    complete_lesson,
)
from learning_content_service import (
    LearningLessonCatalogResponse,
    LearningLessonDetailResponse,
    LearningQuizAttemptsResponse,
    LearningQuizSubmitRequest,
    LearningQuizSubmitResponse,
    get_learning_lesson as get_learning_lesson_content,
    get_learning_lessons as get_learning_lessons_content,
    get_learning_quiz_attempts as get_learning_attempt_history,
    submit_learning_quiz,
)
from persistence_repository import (
    create_or_update_firebase_user,
    create_user,
    delete_user_account,
    ensure_session_owner,
    fetch_scenario_session_owner,
    fetch_user_by_email,
    fetch_user_by_id,
    update_user_display_name,
)
from observability import (
    configure_logging,
    initialize_error_tracking,
    observe_request,
    prometheus_payload,
)
from onboarding_service import (
    OnboardingCompleteRequest,
    OnboardingCompleteResponse,
    OnboardingStatusResponse,
    complete_onboarding,
    get_onboarding_status,
)
from rate_limit import DistributedRateLimiter, RateLimiterUnavailableError
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
    UserSessionsResponse,
    ScenarioEvaluationConflictError,
    get_learning_profile as get_training_learning_profile,
    get_generated_scenario as get_training_generated_scenario,
    get_scenario_catalog as get_training_scenario_catalog,
    evaluate_scenario as evaluate_training_scenario,
    generate_scenario as generate_training_scenario,
    get_session_events as get_training_session_events,
    get_session_snapshot as get_training_session_snapshot,
    get_session_trend_aggregates as get_training_session_trend_aggregates,
    get_session_trends as get_training_session_trends,
    get_user_sessions as get_training_user_sessions,
)

runtime_settings = load_runtime_settings()
configure_logging(runtime_settings)
initialize_error_tracking(runtime_settings)
logger = logging.getLogger(__name__)
app = FastAPI(
    title="CyberSecurity Training API",
    version="1.0.0",
    docs_url="/docs" if runtime_settings.api_docs_enabled else None,
    redoc_url="/redoc" if runtime_settings.api_docs_enabled else None,
    openapi_url="/openapi.json" if runtime_settings.api_docs_enabled else None,
)

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
TemplateId = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=128, pattern=ID_PATTERN),
]
LessonId = Annotated[
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


rate_limiter = DistributedRateLimiter(
    limits={
        "/scenario/generate": (30, 60),
        "/scenario/evaluate": (60, 60),
        "/assistant/ask": (60, 60),
    },
    redis_url=runtime_settings.redis_url,
    fail_open=runtime_settings.rate_limit_fail_open,
)

class GenerateScenarioRequest(BaseModel):
    attack_type: AttackType = "phishing"
    difficulty: DifficultyLevel = "easy"
    session_id: SessionId | None = None
    template_id: TemplateId | None = None


class EvaluateScenarioRequest(BaseModel):
    scenario_id: ScenarioId
    selected_option_id: OptionId


AssistantMessage = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=1000),
]


class AssistantConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=600),
    ]


class AssistantAskRequest(BaseModel):
    message: AssistantMessage
    history: list[AssistantConversationMessage] = Field(
        default_factory=list,
        max_length=8,
    )
    session_id: SessionId | None = None
    scenario_id: ScenarioId | None = None
    attack_type: AttackType | None = None
    difficulty: DifficultyLevel | None = None
    context_title: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=160),
    ] | None = None
    context_summary: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=700),
    ] | None = None


class AssistantAskResponse(BaseModel):
    answer: str
    quick_tips: list[str]
    safety_status: Literal["answered", "refused"]
    content_source: Literal["ollama", "rule_based"]
    llm_model: str | None = None
    generation_ms: int | None = None
    fallback_reason: str | None = None


class AuthRegisterRequest(BaseModel):
    email: UserEmail
    password: UserPassword
    display_name: DisplayName


class AuthLoginRequest(BaseModel):
    email: UserEmail
    password: UserPassword


class AuthRefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=4096)


class AuthProfileUpdateRequest(BaseModel):
    display_name: DisplayName


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    is_active: bool
    onboarding_completed: bool
    onboarding_experience: str | None = None
    learning_goal: str | None = None
    assessment_score: int | None = None
    assessment_level: str | None = None


class AuthTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int = JWT_ACCESS_EXPIRATION_MINUTES * 60
    token_type: str = "bearer"
    user: UserResponse


def build_user_response(user: dict[str, object]) -> UserResponse:
    return UserResponse(
        id=str(user["id"]),
        email=str(user["email"]),
        display_name=str(user["display_name"]),
        is_active=bool(user["is_active"]),
        onboarding_completed=bool(user.get("onboarding_completed", False)),
        onboarding_experience=user.get("onboarding_experience"),  # type: ignore[arg-type]
        learning_goal=user.get("learning_goal"),  # type: ignore[arg-type]
        assessment_score=user.get("assessment_score"),  # type: ignore[arg-type]
        assessment_level=user.get("assessment_level"),  # type: ignore[arg-type]
    )


def is_public_path(path: str) -> bool:
    if path in {
        "/health",
        "/health/ready",
        "/metrics",
        "/auth/register",
        "/auth/login",
        "/auth/refresh",
    }:
        return True
    if runtime_settings.api_docs_enabled and (
        path.startswith("/docs")
        or path.startswith("/openapi")
        or path.startswith("/redoc")
    ):
        return True
    return False


def require_authenticated_user(request: Request) -> AuthenticatedUser:
    user = getattr(request.state, "current_user", None)
    if not isinstance(user, AuthenticatedUser):
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def cors_headers_for(request: Request) -> dict[str, str]:
    origin = request.headers.get("origin")
    if not origin or origin.rstrip("/") not in runtime_settings.cors_origins:
        return {}
    requested_headers = request.headers.get("access-control-request-headers") or "*"
    return {
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": requested_headers,
    }


def resolve_client_key(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if runtime_settings.trust_proxy_headers and forwarded_for:
        first_hop = forwarded_for.split(",", maxsplit=1)[0].strip()
        if first_hop:
            return first_hop
    if request.client and request.client.host:
        return request.client.host
    return "anonymous"


def request_metric_path(request: Request) -> str:
    route = request.scope.get("route")
    route_path = getattr(route, "path", None)
    if isinstance(route_path, str) and route_path:
        return route_path
    return "__unmatched__"


@app.middleware("http")
async def enforce_rate_limits(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    try:
        retry_after = await rate_limiter.retry_after_seconds(
            path=request.url.path,
            client_key=resolve_client_key(request),
        )
    except RateLimiterUnavailableError:
        logger.exception(
            "rate_limit_backend_unavailable",
            extra={
                "request_id": getattr(request.state, "request_id", None),
                "path": request.url.path,
                "backend": rate_limiter.backend_name,
            },
        )
        return JSONResponse(
            status_code=503,
            content={"detail": "Rate limiting service unavailable"},
            headers=cors_headers_for(request),
        )
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
                update_existing_display_name=False,
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
            onboarding_completed=bool(user_data.get("onboarding_completed", False)),
            onboarding_experience=user_data.get("onboarding_experience"),
            learning_goal=user_data.get("learning_goal"),
            assessment_score=user_data.get("assessment_score"),
            assessment_level=user_data.get("assessment_level"),
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


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or secrets.token_hex(16)
    request.state.request_id = request_id
    started_at = monotonic()
    try:
        response = await call_next(request)
    except Exception:
        metric_path = request_metric_path(request)
        duration_ms = observe_request(
            method=request.method,
            path=metric_path,
            status_code=500,
            started_at=started_at,
        )
        logger.exception(
            "request_failed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": metric_path,
                "status_code": 500,
                "duration_ms": duration_ms,
                "client_ip": resolve_client_key(request),
            },
        )
        raise

    metric_path = request_metric_path(request)
    duration_ms = observe_request(
        method=request.method,
        path=metric_path,
        status_code=response.status_code,
        started_at=started_at,
    )
    current_user = getattr(request.state, "current_user", None)
    logger.info(
        "request_completed",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": metric_path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "client_ip": resolve_client_key(request),
            "user_id": getattr(current_user, "id", None),
        },
    )
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if runtime_settings.is_production:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=list(runtime_settings.cors_origins),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    validate_runtime_config(
        runtime_settings,
        database_url=db.DATABASE_URL,
        jwt_secret_key=JWT_SECRET_KEY,
    )
    if runtime_settings.auto_migrate:
        db.init_db()
    else:
        db.check_database_connection()
    logger.info(
        "application_started",
        extra={
            "environment": runtime_settings.environment,
            "rate_limit_backend": rate_limiter.backend_name,
            "metrics_enabled": runtime_settings.metrics_enabled,
            "error_tracking_enabled": bool(runtime_settings.sentry_dsn),
        },
    )


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await rate_limiter.close()
    logger.info("application_stopped")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
async def readiness() -> dict[str, str]:
    try:
        db.check_database_connection()
        await rate_limiter.check_connection()
    except (SQLAlchemyError, RedisError, OSError) as exc:
        raise HTTPException(
            status_code=503,
            detail="A required dependency is unavailable",
        ) from exc
    return {"status": "ready"}


@app.get("/metrics", include_in_schema=False)
def metrics() -> Response:
    if not runtime_settings.metrics_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(
        content=prometheus_payload(),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


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
    refresh_token = create_refresh_token(user_id=user["id"], email=user["email"])
    return AuthTokenResponse(
        access_token=token,
        refresh_token=refresh_token,
        user=build_user_response(user),
    )


@app.post("/auth/login", response_model=AuthTokenResponse)
def login(payload: AuthLoginRequest) -> AuthTokenResponse:
    user = fetch_user_by_email(payload.email)
    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("is_active", False):
        raise HTTPException(status_code=403, detail="User account is inactive")

    token = create_access_token(user_id=user["id"], email=user["email"])
    refresh_token = create_refresh_token(user_id=user["id"], email=user["email"])
    return AuthTokenResponse(
        access_token=token,
        refresh_token=refresh_token,
        user=build_user_response(user),
    )


@app.post("/auth/refresh", response_model=AuthTokenResponse)
def refresh_token(payload: AuthRefreshRequest) -> AuthTokenResponse:
    try:
        token_payload = decode_refresh_token(payload.refresh_token)
        subject = token_payload.get("sub")
        if not isinstance(subject, str) or not subject:
            raise InvalidTokenError("Missing token subject")
        user = fetch_user_by_id(subject)
        if user is None or not user.get("is_active", False):
            raise InvalidTokenError("User not found")
    except InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from exc

    token = create_access_token(user_id=user["id"], email=user["email"])
    next_refresh_token = create_refresh_token(user_id=user["id"], email=user["email"])
    return AuthTokenResponse(
        access_token=token,
        refresh_token=next_refresh_token,
        user=build_user_response(user),
    )


@app.get("/auth/me", response_model=UserResponse)
def get_me(request: Request) -> UserResponse:
    current_user = require_authenticated_user(request)
    return UserResponse.model_validate(current_user.model_dump())


@app.patch("/auth/me", response_model=UserResponse)
def update_me(payload: AuthProfileUpdateRequest, request: Request) -> UserResponse:
    current_user = require_authenticated_user(request)
    user = fetch_user_by_id(current_user.id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    firebase_uid = user.get("firebase_uid")
    if isinstance(firebase_uid, str) and firebase_uid:
        try:
            update_firebase_user_display_name(firebase_uid, payload.display_name)
        except Exception as exc:
            logger.exception(
                "firebase_profile_update_failed",
                extra={"user_id": current_user.id},
            )
            raise HTTPException(
                status_code=503,
                detail="Profilul nu a putut fi actualizat momentan",
            ) from exc

    updated = update_user_display_name(current_user.id, payload.display_name)
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found")
    return build_user_response(updated)


@app.delete("/auth/me", status_code=204)
def delete_me(request: Request) -> Response:
    current_user = require_authenticated_user(request)
    user = fetch_user_by_id(current_user.id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    firebase_uid = user.get("firebase_uid")
    if isinstance(firebase_uid, str) and firebase_uid:
        try:
            delete_firebase_user(firebase_uid)
        except Exception as exc:
            logger.exception(
                "firebase_account_delete_failed",
                extra={"user_id": current_user.id},
            )
            raise HTTPException(
                status_code=503,
                detail="Contul nu a putut fi șters momentan",
            ) from exc

    if not delete_user_account(current_user.id):
        raise HTTPException(status_code=404, detail="User not found")
    return Response(status_code=204)


@app.get("/onboarding", response_model=OnboardingStatusResponse)
def get_onboarding(request: Request) -> OnboardingStatusResponse:
    current_user = require_authenticated_user(request)
    try:
        return get_onboarding_status(current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/onboarding/complete", response_model=OnboardingCompleteResponse)
def submit_onboarding(
    payload: OnboardingCompleteRequest,
    request: Request,
) -> OnboardingCompleteResponse:
    current_user = require_authenticated_user(request)
    try:
        return complete_onboarding(current_user.id, payload)
    except ValueError as exc:
        detail = str(exc)
        status_code = 409 if detail == "Onboarding already completed" else 422
        raise HTTPException(status_code=status_code, detail=detail) from exc


@app.get("/learning/profile", response_model=LearningProfileResponse)
def get_learning_profile(request: Request = None) -> LearningProfileResponse:
    current_user = require_authenticated_user(request)
    return get_training_learning_profile(current_user.id)


@app.get("/learning/path", response_model=LearningPathResponse)
def get_learning_path(request: Request = None) -> LearningPathResponse:
    current_user = require_authenticated_user(request)
    return build_learning_path(current_user.id)


@app.get("/learning/lessons", response_model=LearningLessonCatalogResponse)
def get_learning_lessons(request: Request = None) -> LearningLessonCatalogResponse:
    current_user = require_authenticated_user(request)
    return get_learning_lessons_content(current_user.id)


@app.get(
    "/learning/lessons/{lesson_id}",
    response_model=LearningLessonDetailResponse,
)
def get_learning_lesson(
    lesson_id: LessonId,
    request: Request = None,
) -> LearningLessonDetailResponse:
    current_user = require_authenticated_user(request)
    try:
        return get_learning_lesson_content(current_user.id, lesson_id)
    except LearningPathLockedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post(
    "/learning/lessons/{lesson_id}/quiz/submit",
    response_model=LearningQuizSubmitResponse,
)
def submit_lesson_quiz(
    lesson_id: LessonId,
    payload: LearningQuizSubmitRequest,
    request: Request = None,
) -> LearningQuizSubmitResponse:
    current_user = require_authenticated_user(request)
    try:
        return submit_learning_quiz(current_user.id, lesson_id, payload)
    except LearningPathLockedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        detail = str(exc)
        status_code = 404 if detail == "Unknown lesson" else 422
        raise HTTPException(status_code=status_code, detail=detail) from exc


@app.get("/learning/attempts", response_model=LearningQuizAttemptsResponse)
def get_lesson_quiz_attempts(
    lesson_id: LessonId | None = None,
    limit: int = Query(default=20, gt=0, le=100),
    offset: NonNegativeInt = 0,
    request: Request = None,
) -> LearningQuizAttemptsResponse:
    current_user = require_authenticated_user(request)
    try:
        return get_learning_attempt_history(
            current_user.id,
            lesson_id=lesson_id,
            limit=limit,
            offset=offset,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post(
    "/learning/path/lessons/{lesson_id}/complete",
    response_model=LearningPathLessonCompletionResponse,
)
def complete_learning_path_lesson(
    lesson_id: LessonId,
    request: Request = None,
) -> LearningPathLessonCompletionResponse:
    current_user = require_authenticated_user(request)
    try:
        return complete_lesson(current_user.id, lesson_id)
    except LearningAssessmentRequiredError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except LearningPathLockedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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

    try:
        return generate_training_scenario(
            attack_type=payload.attack_type,
            difficulty=payload.difficulty,
            session_id=payload.session_id,
            owner_user_id=owner_user_id,
            template_id=payload.template_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


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
    except ScenarioEvaluationConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/scenario/catalog", response_model=ScenarioCatalogResponse)
def get_scenario_catalog(request: Request = None) -> ScenarioCatalogResponse:
    if request is not None:
        require_authenticated_user(request)
    return get_training_scenario_catalog()


@app.get("/scenario/{scenario_id}", response_model=GenerateScenarioResponse)
def get_scenario(
    scenario_id: Annotated[str, Path(min_length=1, max_length=128, pattern=ID_PATTERN)],
    request: Request = None,
) -> GenerateScenarioResponse:
    if request is not None:
        current_user = require_authenticated_user(request)
        context = fetch_scenario_session_owner(scenario_id)
        if context is None or not ensure_session_owner(context["session_id"], current_user.id):
            raise HTTPException(status_code=404, detail="Scenario not found")

    scenario = get_training_generated_scenario(scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


@app.post("/assistant/ask", response_model=AssistantAskResponse)
def assistant_ask(
    payload: AssistantAskRequest,
    request: Request = None,
) -> AssistantAskResponse:
    current_user: AuthenticatedUser | None = None
    if request is not None:
        current_user = require_authenticated_user(request)
        if payload.session_id and not ensure_session_owner(payload.session_id, current_user.id):
            raise HTTPException(status_code=404, detail="Session not found")
        if payload.scenario_id:
            owner = fetch_scenario_session_owner(payload.scenario_id)
            if owner is None or not ensure_session_owner(owner["session_id"], current_user.id):
                raise HTTPException(status_code=404, detail="Scenario not found")

    learning_context: dict[str, object] | None = None
    if current_user is not None:
        profile = get_training_learning_profile(current_user.id)
        learning_context = {
            "overall_mastery": profile.overall_mastery,
            "coverage": profile.coverage,
            "weak_areas": [
                {
                    "attack_type": area.attack_type,
                    "difficulty": area.difficulty,
                    "attempts": area.attempts,
                    "accuracy": area.accuracy,
                    "mastery_score": area.mastery_score,
                }
                for area in profile.weak_areas
                if area.attempts > 0
            ],
            "recommended_next": profile.recommended_next.model_dump(),
        }

    scenario_context: dict[str, object] | None = None
    if payload.scenario_id:
        scenario = get_training_generated_scenario(payload.scenario_id)
        if scenario is None:
            raise HTTPException(status_code=404, detail="Scenario not found")
        scenario_context = {
            "attack_type": scenario.attack_type,
            "difficulty": scenario.difficulty,
            "channel": scenario.channel,
            "attacker_message": scenario.attacker_message,
            "red_flags": scenario.red_flags,
        }

    result = answer_assistant(
        message=payload.message,
        history=[item.model_dump() for item in payload.history],
        attack_type=payload.attack_type,
        difficulty=payload.difficulty,
        context_title=payload.context_title,
        context_summary=payload.context_summary,
        learning_context=learning_context,
        scenario_context=scenario_context,
    )
    return AssistantAskResponse(
        answer=result.answer,
        quick_tips=result.quick_tips,
        safety_status=result.safety_status,
        content_source=result.content_source,
        llm_model=result.llm_model,
        generation_ms=result.generation_ms,
        fallback_reason=result.fallback_reason,
    )


@app.get("/sessions", response_model=UserSessionsResponse)
def get_sessions(
    limit: int = Query(default=20, gt=0, le=100),
    offset: NonNegativeInt = 0,
    request: Request = None,
) -> UserSessionsResponse:
    current_user = require_authenticated_user(request)
    return get_training_user_sessions(current_user.id, limit=limit, offset=offset)


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
