from __future__ import annotations

from datetime import datetime, timezone
import logging
from typing import cast
from uuid import uuid4

from pydantic import BaseModel, Field

from persistence_repository import (
    fetch_session_events,
    fetch_session_snapshot,
    record_generated_scenario,
    record_scenario_evaluation,
    record_session_event,
    upsert_session_progress,
)
from scenario_library import ALL_ATTACK_TYPES, get_scenario_template
from scenario_models import AttackType, DifficultyLevel, ScenarioOption, ScenarioRule

DIFFICULTY_ORDER: tuple[DifficultyLevel, ...] = ("easy", "medium", "hard")
RISKY_OPTION_IDS = {"click", "tap", "share", "share_code", "share_partial", "comply", "follow"}
logger = logging.getLogger(__name__)


class AttackProgress(BaseModel):
    attempts: int = 0
    correct: int = 0


class SessionProgress(BaseModel):
    total_score: int = 0
    total_attempts: int = 0
    total_correct: int = 0
    correct_streak: int = 0
    incorrect_streak: int = 0
    event_history: list["SessionEvent"] = Field(default_factory=list)
    by_attack: dict[AttackType, AttackProgress] = Field(
        default_factory=lambda: {attack: AttackProgress() for attack in ALL_ATTACK_TYPES}
    )


class SessionEvent(BaseModel):
    id: str
    timestamp: str
    event_type: str
    title: str
    detail: str
    tone: str


class ScenarioContext(BaseModel):
    session_id: str
    attack_type: AttackType
    difficulty: DifficultyLevel
    rule: ScenarioRule


class AttackStatsResponse(BaseModel):
    attempts: int
    correct: int
    accuracy: float


class SessionStatsResponse(BaseModel):
    total_score: int
    total_attempts: int
    total_correct: int
    accuracy: float
    correct_streak: int
    incorrect_streak: int
    per_attack: dict[str, AttackStatsResponse]
    recent_events: list[SessionEvent]


class NextScenarioRecommendation(BaseModel):
    attack_type: AttackType
    difficulty: DifficultyLevel
    reason: str


class GenerateScenarioResponse(BaseModel):
    session_id: str
    scenario_id: str
    attack_type: str
    difficulty: str
    channel: str
    attacker_message: str
    options: list[ScenarioOption]
    red_flags: list[str]


class EvaluateScenarioResponse(BaseModel):
    is_correct: bool
    score_delta: int
    explanation: str
    session_stats: SessionStatsResponse
    recommendation: NextScenarioRecommendation


class SessionSnapshotResponse(BaseModel):
    session_id: str
    session_stats: SessionStatsResponse
    generated_scenarios: int
    evaluated_scenarios: int
    last_updated_at: str | None


class SessionEventsResponse(BaseModel):
    session_id: str
    total: int
    limit: int
    offset: int
    events: list[SessionEvent]


scenario_contexts: dict[str, ScenarioContext] = {}
session_progress: dict[str, SessionProgress] = {}


def to_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def restore_session_from_persistence(current_session_id: str) -> SessionProgress | None:
    snapshot = fetch_session_snapshot(current_session_id, event_limit=30)
    if snapshot is None:
        return None

    session_stats = snapshot.get("session_stats")
    if not isinstance(session_stats, dict):
        return None

    per_attack_payload = session_stats.get("per_attack")
    if not isinstance(per_attack_payload, dict):
        per_attack_payload = {}

    restored_by_attack: dict[AttackType, AttackProgress] = {}
    for attack_type in ALL_ATTACK_TYPES:
        attack_stats = per_attack_payload.get(attack_type)
        if not isinstance(attack_stats, dict):
            attack_stats = {}

        restored_by_attack[attack_type] = AttackProgress(
            attempts=to_int(attack_stats.get("attempts", 0)),
            correct=to_int(attack_stats.get("correct", 0)),
        )

    recent_events_payload = session_stats.get("recent_events")
    if not isinstance(recent_events_payload, list):
        recent_events_payload = []

    restored_events: list[SessionEvent] = []
    for payload in recent_events_payload:
        if not isinstance(payload, dict):
            continue
        try:
            restored_events.append(SessionEvent.model_validate(payload))
        except Exception:
            continue

    return SessionProgress(
        total_score=to_int(session_stats.get("total_score", 0)),
        total_attempts=to_int(session_stats.get("total_attempts", 0)),
        total_correct=to_int(session_stats.get("total_correct", 0)),
        correct_streak=to_int(session_stats.get("correct_streak", 0)),
        incorrect_streak=to_int(session_stats.get("incorrect_streak", 0)),
        event_history=restored_events[:30],
        by_attack=restored_by_attack,
    )


def get_or_create_session(current_session_id: str) -> SessionProgress:
    if current_session_id not in session_progress:
        restored_progress = restore_session_from_persistence(current_session_id)
        session_progress[current_session_id] = restored_progress or SessionProgress()
    return session_progress[current_session_id]


def calculate_score_delta(is_correct: bool, selected_option_id: str) -> int:
    if is_correct:
        return 10
    if selected_option_id in RISKY_OPTION_IDS:
        return -5
    return 0


def persist_session_state(session_id: str, progress: SessionProgress) -> None:
    per_attack_stats = {
        attack_type: {
            "attempts": progress.by_attack[attack_type].attempts,
            "correct": progress.by_attack[attack_type].correct,
        }
        for attack_type in ALL_ATTACK_TYPES
    }

    try:
        upsert_session_progress(
            session_id=session_id,
            total_score=progress.total_score,
            total_attempts=progress.total_attempts,
            total_correct=progress.total_correct,
            correct_streak=progress.correct_streak,
            incorrect_streak=progress.incorrect_streak,
            per_attack_stats=per_attack_stats,
        )
    except Exception:
        logger.exception("Failed to persist session state", extra={"session_id": session_id})


def persist_event(session_id: str, event: SessionEvent) -> None:
    try:
        record_session_event(
            session_id=session_id,
            event_id=event.id,
            timestamp_iso=event.timestamp,
            event_type=event.event_type,
            title=event.title,
            detail=event.detail,
            tone=event.tone,
        )
    except Exception:
        logger.exception(
            "Failed to persist session event",
            extra={"session_id": session_id, "event_id": event.id},
        )


def persist_generated_attempt(
    session_id: str,
    scenario_id: str,
    attack_type: AttackType,
    difficulty: DifficultyLevel,
) -> None:
    try:
        record_generated_scenario(
            session_id=session_id,
            scenario_id=scenario_id,
            attack_type=attack_type,
            difficulty=difficulty,
        )
    except Exception:
        logger.exception(
            "Failed to persist generated scenario",
            extra={"session_id": session_id, "scenario_id": scenario_id},
        )


def add_session_event(
    progress: SessionProgress,
    event_type: str,
    title: str,
    detail: str,
    tone: str,
) -> SessionEvent:
    event = SessionEvent(
        id=str(uuid4()),
        timestamp=datetime.now(timezone.utc).isoformat(),
        event_type=event_type,
        title=title,
        detail=detail,
        tone=tone,
    )

    progress.event_history.insert(0, event)
    if len(progress.event_history) > 30:
        progress.event_history = progress.event_history[:30]

    return event


def build_session_stats(progress: SessionProgress) -> SessionStatsResponse:
    per_attack: dict[str, AttackStatsResponse] = {}

    for attack_type in ALL_ATTACK_TYPES:
        attack_progress = progress.by_attack[attack_type]
        attack_accuracy = (
            round((attack_progress.correct / attack_progress.attempts) * 100, 1)
            if attack_progress.attempts
            else 0.0
        )
        per_attack[attack_type] = AttackStatsResponse(
            attempts=attack_progress.attempts,
            correct=attack_progress.correct,
            accuracy=attack_accuracy,
        )

    total_accuracy = (
        round((progress.total_correct / progress.total_attempts) * 100, 1)
        if progress.total_attempts
        else 0.0
    )

    return SessionStatsResponse(
        total_score=progress.total_score,
        total_attempts=progress.total_attempts,
        total_correct=progress.total_correct,
        accuracy=total_accuracy,
        correct_streak=progress.correct_streak,
        incorrect_streak=progress.incorrect_streak,
        per_attack=per_attack,
        recent_events=progress.event_history[:12],
    )


def get_next_difficulty(progress: SessionProgress, current_difficulty: DifficultyLevel) -> DifficultyLevel:
    current_index = DIFFICULTY_ORDER.index(current_difficulty)

    if progress.correct_streak >= 2 and current_index < len(DIFFICULTY_ORDER) - 1:
        return DIFFICULTY_ORDER[current_index + 1]
    if progress.incorrect_streak >= 2 and current_index > 0:
        return DIFFICULTY_ORDER[current_index - 1]
    return current_difficulty


def get_weakest_attack_type(progress: SessionProgress) -> AttackType:
    def score(attack_type: AttackType) -> tuple[float, int]:
        attack_progress = progress.by_attack[attack_type]
        accuracy = attack_progress.correct / attack_progress.attempts if attack_progress.attempts else 0.0
        return (accuracy, attack_progress.attempts)

    weakest_attack = min(ALL_ATTACK_TYPES, key=score)
    return cast(AttackType, weakest_attack)


def build_recommendation(
    progress: SessionProgress, current_attack_type: AttackType, current_difficulty: DifficultyLevel
) -> NextScenarioRecommendation:
    recommended_attack_type = get_weakest_attack_type(progress)
    recommended_difficulty = get_next_difficulty(progress, current_difficulty)

    if progress.correct_streak >= 2 and recommended_difficulty != current_difficulty:
        reason = "Ai raspuns corect de mai multe ori. Crestem dificultatea pentru provocare."
    elif progress.incorrect_streak >= 2 and recommended_difficulty != current_difficulty:
        reason = "Au aparut erori repetate. Coboram dificultatea pentru consolidare."
    elif recommended_attack_type != current_attack_type:
        reason = f"Acuratetea este mai scazuta pe {recommended_attack_type}. Recomandam practica tintita."
    else:
        reason = "Pastram directia curenta pentru consolidarea abilitatilor."

    return NextScenarioRecommendation(
        attack_type=recommended_attack_type,
        difficulty=recommended_difficulty,
        reason=reason,
    )


def generate_scenario(
    attack_type: AttackType, difficulty: DifficultyLevel, session_id: str | None = None
) -> GenerateScenarioResponse:
    current_session_id = session_id or str(uuid4())
    progress = get_or_create_session(current_session_id)

    scenario_id = str(uuid4())
    template = get_scenario_template(attack_type, difficulty)

    scenario_contexts[scenario_id] = ScenarioContext(
        session_id=current_session_id,
        attack_type=attack_type,
        difficulty=difficulty,
        rule=template.rule,
    )

    event = add_session_event(
        progress=progress,
        event_type="scenario_generated",
        title="Scenario generated",
        detail=f"{attack_type} on {difficulty} difficulty is now active.",
        tone="neutral",
    )

    persist_generated_attempt(
        session_id=current_session_id,
        scenario_id=scenario_id,
        attack_type=attack_type,
        difficulty=difficulty,
    )
    persist_event(current_session_id, event)
    persist_session_state(current_session_id, progress)

    return GenerateScenarioResponse(
        session_id=current_session_id,
        scenario_id=scenario_id,
        attack_type=attack_type,
        difficulty=difficulty,
        channel=template.channel,
        attacker_message=template.attacker_message,
        options=template.options,
        red_flags=template.red_flags,
    )


def evaluate_scenario(scenario_id: str, selected_option_id: str) -> EvaluateScenarioResponse:
    scenario_context = scenario_contexts.get(scenario_id)

    if scenario_context is None:
        raise KeyError("Scenario not found")

    progress = get_or_create_session(scenario_context.session_id)

    is_correct = selected_option_id == scenario_context.rule.correct_option_id
    score_delta = calculate_score_delta(is_correct, selected_option_id)

    progress.total_attempts += 1
    progress.total_score += score_delta

    current_attack_progress = progress.by_attack[scenario_context.attack_type]
    current_attack_progress.attempts += 1
    event: SessionEvent

    if is_correct:
        progress.total_correct += 1
        progress.correct_streak += 1
        progress.incorrect_streak = 0
        current_attack_progress.correct += 1
        explanation = scenario_context.rule.correct_explanation
        event = add_session_event(
            progress=progress,
            event_type="answer_evaluated",
            title="Answer marked correct",
            detail=f"+{score_delta} points applied to the live score.",
            tone="good",
        )
    else:
        progress.incorrect_streak += 1
        progress.correct_streak = 0
        explanation = scenario_context.rule.incorrect_explanation
        detail_prefix = f"{score_delta}" if score_delta < 0 else f"+{score_delta}"
        event = add_session_event(
            progress=progress,
            event_type="answer_evaluated",
            title="Answer marked incorrect",
            detail=f"{detail_prefix} points applied to the live score.",
            tone="warning",
        )

    session_stats = build_session_stats(progress)
    recommendation = build_recommendation(
        progress,
        scenario_context.attack_type,
        scenario_context.difficulty,
    )

    try:
        record_scenario_evaluation(
            scenario_id=scenario_id,
            session_id=scenario_context.session_id,
            attack_type=scenario_context.attack_type,
            difficulty=scenario_context.difficulty,
            selected_option_id=selected_option_id,
            is_correct=is_correct,
            score_delta=score_delta,
            explanation=explanation,
            recommendation_attack_type=recommendation.attack_type,
            recommendation_difficulty=recommendation.difficulty,
        )
    except Exception:
        logger.exception(
            "Failed to persist scenario evaluation",
            extra={"session_id": scenario_context.session_id, "scenario_id": scenario_id},
        )

    persist_event(scenario_context.session_id, event)
    persist_session_state(scenario_context.session_id, progress)

    return EvaluateScenarioResponse(
        is_correct=is_correct,
        score_delta=score_delta,
        explanation=explanation,
        session_stats=session_stats,
        recommendation=recommendation,
    )


def get_session_snapshot(session_id: str) -> SessionSnapshotResponse | None:
    snapshot = fetch_session_snapshot(session_id)
    if snapshot is None:
        return None
    return SessionSnapshotResponse.model_validate(snapshot)


def get_session_events(session_id: str, limit: int = 20, offset: int = 0) -> SessionEventsResponse | None:
    events = fetch_session_events(session_id, limit=limit, offset=offset)
    if events is None:
        return None
    return SessionEventsResponse.model_validate(events)