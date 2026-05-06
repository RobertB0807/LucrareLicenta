from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, NonNegativeInt

from db import init_db
from scenario_models import AttackType, DifficultyLevel
from training_service import (
    EvaluateScenarioResponse,
    GenerateScenarioResponse,
    SessionEventsResponse,
    SessionSnapshotResponse,
    evaluate_scenario as evaluate_training_scenario,
    generate_scenario as generate_training_scenario,
    get_session_events as get_training_session_events,
    get_session_snapshot as get_training_session_snapshot,
)

app = FastAPI(title="CyberSecurity Training API", version="0.2.0")

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
    session_id: str | None = None


class EvaluateScenarioRequest(BaseModel):
    scenario_id: str = Field(..., min_length=1)
    selected_option_id: str = Field(..., min_length=1)


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


@app.get("/session/{session_id}", response_model=SessionSnapshotResponse)
def get_session_snapshot(session_id: str) -> SessionSnapshotResponse:
    snapshot = get_training_session_snapshot(session_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return snapshot


@app.get("/session/{session_id}/events", response_model=SessionEventsResponse)
def get_session_events(
    session_id: str,
    limit: int = Query(default=20, gt=0, le=100),
    offset: NonNegativeInt = 0,
) -> SessionEventsResponse:
    events = get_training_session_events(session_id, limit=limit, offset=offset)
    if events is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return events
