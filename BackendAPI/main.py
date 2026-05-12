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

from assistant_service import build_assistant_answer
from db import init_db
from scenario_models import AttackType, DifficultyLevel
from training_service import (
    EvaluateScenarioResponse,
    GenerateScenarioResponse,
    ScenarioCatalogResponse,
    SessionEventsResponse,
    SessionSnapshotResponse,
    SessionTrendsResponse,
    get_scenario_catalog as get_training_scenario_catalog,
    evaluate_scenario as evaluate_training_scenario,
    generate_scenario as generate_training_scenario,
    get_session_events as get_training_session_events,
    get_session_snapshot as get_training_session_snapshot,
    get_session_trends as get_training_session_trends,
)

app = FastAPI(title="CyberSecurity Training API", version="0.2.0")

ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$"
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

# Keep CORS open for local MVP development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


@app.middleware("http")
async def enforce_rate_limits(request: Request, call_next):
    retry_after = rate_limiter.retry_after_seconds(request)
    if retry_after is not None:
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Try again later."},
            headers={"Retry-After": str(retry_after)},
        )
    return await call_next(request)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/scenario/generate", response_model=GenerateScenarioResponse)
def generate_scenario(payload: GenerateScenarioRequest) -> GenerateScenarioResponse:
    return generate_training_scenario(
        attack_type=payload.attack_type,
        difficulty=payload.difficulty,
        session_id=payload.session_id,
    )


@app.post("/scenario/evaluate", response_model=EvaluateScenarioResponse)
def evaluate_scenario(payload: EvaluateScenarioRequest) -> EvaluateScenarioResponse:
    try:
        return evaluate_training_scenario(
            scenario_id=payload.scenario_id,
            selected_option_id=payload.selected_option_id,
        )
    except KeyError as exc:
        detail = exc.args[0] if exc.args else "Scenario not found"
        raise HTTPException(status_code=404, detail=detail) from exc


@app.get("/scenario/catalog", response_model=ScenarioCatalogResponse)
def get_scenario_catalog() -> ScenarioCatalogResponse:
    return get_training_scenario_catalog()


@app.post("/assistant/ask", response_model=AssistantAskResponse)
def assistant_ask(payload: AssistantAskRequest) -> AssistantAskResponse:
    answer, quick_tips = build_assistant_answer(
        message=payload.message,
        attack_type=payload.attack_type,
        difficulty=payload.difficulty,
    )
    return AssistantAskResponse(answer=answer, quick_tips=quick_tips)


@app.get("/session/{session_id}", response_model=SessionSnapshotResponse)
def get_session_snapshot(
    session_id: Annotated[str, Path(min_length=1, max_length=128, pattern=ID_PATTERN)]
) -> SessionSnapshotResponse:
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
) -> SessionEventsResponse:
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
) -> SessionTrendsResponse:
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
