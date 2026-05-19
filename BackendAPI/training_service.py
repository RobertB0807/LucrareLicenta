from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from typing import Literal, cast
from uuid import uuid4

from pydantic import BaseModel, Field

from persistence_repository import (
    fetch_user_learning_profiles,
    fetch_scenario_context,
    fetch_scenario_session_owner,
    fetch_session_events,
    fetch_session_snapshot,
    fetch_session_trend_aggregates,
    fetch_session_trends,
    record_user_learning_attempt,
    record_generated_scenario,
    record_scenario_evaluation,
    record_session_event,
    upsert_session_progress,
)
from scenario_library import ALL_ATTACK_TYPES, ALL_DIFFICULTIES, SCENARIO_LIBRARY, get_scenario_template
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


class LearningProfileAreaResponse(BaseModel):
    attack_type: AttackType
    difficulty: DifficultyLevel
    attempts: int
    correct: int
    accuracy: float
    mastery_score: float
    last_attempt_at: str | None


class LearningProfileAttackResponse(BaseModel):
    attack_type: AttackType
    attempts: int
    correct: int
    accuracy: float
    mastery_score: float
    weakest_difficulty: DifficultyLevel | None


class LearningProfileDifficultyResponse(BaseModel):
    difficulty: DifficultyLevel
    attempts: int
    correct: int
    accuracy: float
    mastery_score: float


class LearningProfileResponse(BaseModel):
    user_id: str
    overall_mastery: float
    coverage: float
    by_attack: list[LearningProfileAttackResponse]
    by_difficulty: list[LearningProfileDifficultyResponse]
    weak_areas: list[LearningProfileAreaResponse]
    review_queue: list["LearningReviewItemResponse"]
    review_summary: "LearningReviewSummaryResponse"
    recommended_next: NextScenarioRecommendation
    last_updated_at: str | None


class LearningReviewItemResponse(BaseModel):
    attack_type: AttackType
    difficulty: DifficultyLevel
    attempts: int
    correct: int
    accuracy: float
    mastery_score: float
    last_attempt_at: str | None
    due_at: str
    status: Literal["due_now", "due_soon", "scheduled"]
    priority: float


class LearningReviewSummaryResponse(BaseModel):
    due_now: int
    due_soon: int
    scheduled: int
    next_due_at: str | None


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


class SessionTrendPointResponse(BaseModel):
    timestamp: str
    attack_type: AttackType
    difficulty: DifficultyLevel
    is_correct: bool
    score_delta: int
    score_after: int
    accuracy_after: float
    attempt_index: int


class SessionTrendsResponse(BaseModel):
    session_id: str
    total: int
    limit: int
    offset: int
    points: list[SessionTrendPointResponse]


class SessionTrendByDayResponse(BaseModel):
    day: str
    attempts: int
    correct: int
    accuracy: float
    score_delta_total: int
    cumulative_score_after: int


class SessionTrendByAttackResponse(BaseModel):
    attack_type: AttackType
    attempts: int
    correct: int
    accuracy: float
    score_delta_total: int
    average_score_delta: float


class SessionTrendAggregatesResponse(BaseModel):
    session_id: str
    total_attempts: int
    by_day: list[SessionTrendByDayResponse]
    by_attack: list[SessionTrendByAttackResponse]


class ScenarioCatalogItemResponse(BaseModel):
    id: str
    attack_type: AttackType
    difficulty: DifficultyLevel
    channel: str
    attacker_message_preview: str
    red_flags: list[str]


class ScenarioCatalogResponse(BaseModel):
    items: list[ScenarioCatalogItemResponse]


scenario_contexts: dict[str, ScenarioContext] = {}


def to_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _weight_for_learning_update(attempts: int, difficulty: DifficultyLevel) -> float:
    difficulty_bonus = {"easy": 0.0, "medium": 0.01, "hard": 0.02}
    return min(0.4, 0.18 + min(attempts, 5) * 0.03 + difficulty_bonus[difficulty])


def _target_mastery_for_result(is_correct: bool, difficulty: DifficultyLevel) -> float:
    if is_correct:
        return 100.0
    return {"easy": 10.0, "medium": 16.0, "hard": 22.0}[difficulty]


def _difficulty_from_mastery(mastery_score: float, attempts: int) -> DifficultyLevel:
    if attempts < 2 or mastery_score < 45:
        return "easy"
    if mastery_score < 75:
        return "medium"
    return "hard"


def _review_interval_days(row: dict[str, Any]) -> int:
    mastery_score = float(row["mastery_score"])
    attempts = int(row["attempts"])
    difficulty = cast(DifficultyLevel, row["difficulty"])
    last_result_correct = row.get("last_result_correct")

    if attempts < 2 or mastery_score < 40:
        base_days = 1
    elif mastery_score < 55:
        base_days = 2
    elif mastery_score < 70:
        base_days = 4
    elif mastery_score < 85:
        base_days = 7
    else:
        base_days = 14

    if difficulty == "hard":
        base_days = max(1, int(round(base_days * 0.75)))
    elif difficulty == "medium":
        base_days = max(1, int(round(base_days * 0.9)))

    if last_result_correct is False:
        base_days = max(1, int(round(base_days * 0.5)))

    return base_days


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
        return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def get_previous_difficulty(current_difficulty: DifficultyLevel) -> DifficultyLevel:
    current_index = DIFFICULTY_ORDER.index(current_difficulty)
    if current_index > 0:
        return DIFFICULTY_ORDER[current_index - 1]
    return current_difficulty


def _build_learning_rows(user_id: str) -> list[dict[str, Any]]:
    raw_rows = fetch_user_learning_profiles(user_id)
    row_map = {
        (row["attack_type"], row["difficulty"]): row
        for row in raw_rows
        if isinstance(row.get("attack_type"), str) and isinstance(row.get("difficulty"), str)
    }

    rows: list[dict[str, Any]] = []
    for attack_type in ALL_ATTACK_TYPES:
        for difficulty in ALL_DIFFICULTIES:
            row = row_map.get((attack_type, difficulty))
            attempts = int(row.get("attempts", 0)) if row else 0
            correct = int(row.get("correct", 0)) if row else 0
            mastery_score = float(row.get("mastery_score", 0.0)) if row else 0.0
            accuracy = round((correct / attempts) * 100, 1) if attempts else 0.0
            rows.append(
                {
                    "attack_type": attack_type,
                    "difficulty": difficulty,
                    "attempts": attempts,
                    "correct": correct,
                    "accuracy": accuracy,
                    "mastery_score": round(mastery_score, 1),
                    "last_attempt_at": row.get("last_attempt_at") if row else None,
                    "last_result_correct": row.get("last_result_correct") if row else None,
                }
            )

    return rows


def _build_learning_recommendation(user_id: str, rows: list[dict[str, Any]]) -> NextScenarioRecommendation:
    review_rows = [row for row in rows if row["attempts"] > 0]
    now = datetime.now(timezone.utc)
    review_candidates: list[tuple[float, dict[str, Any], datetime]] = []

    for row in review_rows:
        last_attempt_at = _parse_iso_datetime(row.get("last_attempt_at"))
        if last_attempt_at is None:
            continue
        due_at = last_attempt_at + timedelta(days=_review_interval_days(row))
        if due_at <= now:
            overdue_hours = (now - due_at).total_seconds() / 3600.0
            priority = 1000.0 + overdue_hours + (100.0 - float(row["mastery_score"]))
        elif due_at <= now + timedelta(days=2):
            hours_until_due = (due_at - now).total_seconds() / 3600.0
            priority = 100.0 + max(0.0, 48.0 - hours_until_due) + (80.0 - float(row["mastery_score"]))
        else:
            hours_until_due = (due_at - now).total_seconds() / 3600.0
            priority = max(0.0, 50.0 - float(row["mastery_score"])) + (24.0 / max(1.0, hours_until_due))
        review_candidates.append((priority, row, due_at))

    if review_candidates:
        _, candidate, _ = max(
            review_candidates,
            key=lambda item: (item[0], -item[1]["mastery_score"], item[1]["attack_type"], item[1]["difficulty"]),
        )
        if candidate["mastery_score"] < 60:
            reason = "Este momentul pentru recapitulare; consolidăm zona care a început să slăbească."
        else:
            reason = "Recapitulăm pentru a fixa progresul înainte să trecem mai departe."
        return NextScenarioRecommendation(
            attack_type=candidate["attack_type"],
            difficulty=cast(DifficultyLevel, candidate["difficulty"]),
            reason=reason,
        )

    total_attempts = sum(row["attempts"] for row in rows)
    attempted_rows = [row for row in rows if row["attempts"] > 0]
    untried_rows = [row for row in rows if row["attempts"] == 0]

    if total_attempts < 3 and untried_rows:
        candidate = untried_rows[0]
        return NextScenarioRecommendation(
            attack_type=candidate["attack_type"],
            difficulty="easy",
            reason="Construim baza și acoperim o suprafață nouă înainte de a crește dificultatea.",
        )

    if not attempted_rows:
        candidate = rows[0]
        return NextScenarioRecommendation(
            attack_type=candidate["attack_type"],
            difficulty="easy",
            reason="Nu există încă istoric suficient; începem cu un exercițiu ghidat de bază.",
        )

    weakest = min(attempted_rows, key=lambda row: (row["mastery_score"], -row["attempts"]))
    recommended_difficulty = _difficulty_from_mastery(weakest["mastery_score"], weakest["attempts"])

    if weakest["mastery_score"] >= 80 and untried_rows:
        candidate = untried_rows[0]
        return NextScenarioRecommendation(
            attack_type=candidate["attack_type"],
            difficulty="medium" if total_attempts >= 5 else "easy",
            reason="Ai consolidat bine zonele antrenate; extindem acoperirea spre o suprafață încă neatinsă.",
        )

    return NextScenarioRecommendation(
        attack_type=weakest["attack_type"],
        difficulty=recommended_difficulty,
        reason=(
            f"Consolidăm {weakest['attack_type']} la dificultatea {recommended_difficulty} "
            f"unde stăpânirea este cea mai scăzută."
        ),
    )


def _summarize_learning_rows(
    rows: list[dict[str, Any]]
) -> tuple[list[LearningProfileAttackResponse], list[LearningProfileDifficultyResponse], float, float, str | None]:
    by_attack: list[LearningProfileAttackResponse] = []
    by_difficulty: list[LearningProfileDifficultyResponse] = []

    total_weight = 0
    total_weighted_mastery = 0.0
    coverage_count = sum(1 for row in rows if row["attempts"] > 0)
    last_updated_at: str | None = None

    for attack_type in ALL_ATTACK_TYPES:
        attack_rows = [row for row in rows if row["attack_type"] == attack_type and row["attempts"] > 0]
        attempts = sum(row["attempts"] for row in attack_rows)
        correct = sum(row["correct"] for row in attack_rows)
        weighted_mastery = sum(row["mastery_score"] * row["attempts"] for row in attack_rows)
        mastery_score = round(weighted_mastery / attempts, 1) if attempts else 0.0
        accuracy = round((correct / attempts) * 100, 1) if attempts else 0.0
        weakest_difficulty: DifficultyLevel | None = None
        if attack_rows:
            weakest_difficulty = min(attack_rows, key=lambda row: (row["mastery_score"], -row["attempts"]))[
                "difficulty"
            ]

        by_attack.append(
            LearningProfileAttackResponse(
                attack_type=attack_type,
                attempts=attempts,
                correct=correct,
                accuracy=accuracy,
                mastery_score=mastery_score,
                weakest_difficulty=weakest_difficulty,
            )
        )
        total_weight += attempts
        total_weighted_mastery += weighted_mastery

    for difficulty in ALL_DIFFICULTIES:
        difficulty_rows = [row for row in rows if row["difficulty"] == difficulty and row["attempts"] > 0]
        attempts = sum(row["attempts"] for row in difficulty_rows)
        correct = sum(row["correct"] for row in difficulty_rows)
        weighted_mastery = sum(row["mastery_score"] * row["attempts"] for row in difficulty_rows)
        mastery_score = round(weighted_mastery / attempts, 1) if attempts else 0.0
        accuracy = round((correct / attempts) * 100, 1) if attempts else 0.0

        by_difficulty.append(
            LearningProfileDifficultyResponse(
                difficulty=difficulty,
                attempts=attempts,
                correct=correct,
                accuracy=accuracy,
                mastery_score=mastery_score,
            )
        )

    if rows:
        updated_candidates = [row["last_attempt_at"] for row in rows if row["last_attempt_at"]]
        last_updated_at = max(updated_candidates) if updated_candidates else None

    coverage = round((coverage_count / len(rows)) * 100, 1) if rows else 0.0
    overall_mastery = round(total_weighted_mastery / total_weight, 1) if total_weight else 0.0
    return by_attack, by_difficulty, overall_mastery, coverage, last_updated_at


def _build_review_queue(rows: list[dict[str, Any]]) -> tuple[list[LearningReviewItemResponse], LearningReviewSummaryResponse]:
    now = datetime.now(timezone.utc)
    queue: list[LearningReviewItemResponse] = []

    for row in rows:
        if row["attempts"] <= 0:
            continue

        last_attempt_at = _parse_iso_datetime(row.get("last_attempt_at"))
        if last_attempt_at is None:
            continue

        interval_days = _review_interval_days(row)
        due_at = last_attempt_at + timedelta(days=interval_days)
        if due_at <= now:
            status: Literal["due_now", "due_soon", "scheduled"] = "due_now"
            priority = 1000.0 + ((now - due_at).total_seconds() / 3600.0)
        elif due_at <= now + timedelta(days=2):
            status = "due_soon"
            priority = 500.0 - ((due_at - now).total_seconds() / 3600.0)
        else:
            status = "scheduled"
            priority = float(interval_days)

        queue.append(
            LearningReviewItemResponse(
                attack_type=row["attack_type"],
                difficulty=cast(DifficultyLevel, row["difficulty"]),
                attempts=row["attempts"],
                correct=row["correct"],
                accuracy=row["accuracy"],
                mastery_score=row["mastery_score"],
                last_attempt_at=row.get("last_attempt_at"),
                due_at=due_at.isoformat(),
                status=status,
                priority=round(priority, 2),
            )
        )

    queue.sort(
        key=lambda item: (
            0 if item.status == "due_now" else 1 if item.status == "due_soon" else 2,
            item.due_at,
            item.mastery_score,
            -item.attempts,
            item.attack_type,
            item.difficulty,
        )
    )

    due_now = sum(1 for item in queue if item.status == "due_now")
    due_soon = sum(1 for item in queue if item.status == "due_soon")
    scheduled = sum(1 for item in queue if item.status == "scheduled")
    next_due_at = queue[0].due_at if queue else None

    return queue[:5], LearningReviewSummaryResponse(
        due_now=due_now,
        due_soon=due_soon,
        scheduled=scheduled,
        next_due_at=next_due_at,
    )


def build_learning_profile(user_id: str) -> LearningProfileResponse:
    rows = _build_learning_rows(user_id)
    by_attack, by_difficulty, overall_mastery, coverage, last_updated_at = _summarize_learning_rows(rows)
    attempted_rows = [row for row in rows if row["attempts"] > 0]
    candidate_rows = attempted_rows if attempted_rows else rows
    weak_areas = sorted(
        (LearningProfileAreaResponse.model_validate(row) for row in candidate_rows),
        key=lambda item: (
            item.mastery_score,
            -item.attempts,
            item.attack_type,
            item.difficulty,
        ),
    )[:3]
    review_queue, review_summary = _build_review_queue(rows)
    if review_queue:
        top_review = review_queue[0]
        if top_review.status == "due_now":
            review_reason = "Este momentul pentru recapitulare; consolidăm zona care are nevoie de atenție imediată."
        elif top_review.status == "due_soon":
            review_reason = "Recapitularea este programată curând; păstrăm ritmul și revenim la timp."
        else:
            review_reason = "Recapitulăm la intervalul stabilit pentru a fixa progresul."
        recommended_next = NextScenarioRecommendation(
            attack_type=top_review.attack_type,
            difficulty=top_review.difficulty,
            reason=review_reason,
        )
    else:
        recommended_next = _build_learning_recommendation(user_id, rows)

    return LearningProfileResponse(
        user_id=user_id,
        overall_mastery=overall_mastery,
        coverage=coverage,
        by_attack=by_attack,
        by_difficulty=by_difficulty,
        weak_areas=list(weak_areas),
        review_queue=review_queue,
        review_summary=review_summary,
        recommended_next=recommended_next,
        last_updated_at=last_updated_at,
    )


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
    # Read session state from persistence on each access so DB remains the source of truth.
    restored_progress = restore_session_from_persistence(current_session_id)
    return restored_progress or SessionProgress()


def calculate_score_delta(is_correct: bool, selected_option_id: str) -> int:
    if is_correct:
        return 10
    if selected_option_id in RISKY_OPTION_IDS:
        return -5
    return 0


def persist_session_state(
    session_id: str,
    progress: SessionProgress,
    *,
    owner_user_id: str | None = None,
) -> None:
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
            owner_user_id=owner_user_id,
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
    rule: ScenarioRule,
) -> None:
    try:
        record_generated_scenario(
            session_id=session_id,
            scenario_id=scenario_id,
            attack_type=attack_type,
            difficulty=difficulty,
            correct_option_id=rule.correct_option_id,
            correct_explanation=rule.correct_explanation,
            incorrect_explanation=rule.incorrect_explanation,
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
    progress: SessionProgress,
    current_attack_type: AttackType,
    current_difficulty: DifficultyLevel,
    owner_user_id: str | None = None,
) -> NextScenarioRecommendation:
    if owner_user_id:
        learning_profile = build_learning_profile(owner_user_id)
        recommended_attack_type = learning_profile.recommended_next.attack_type
        recommended_difficulty = learning_profile.recommended_next.difficulty
        reason = learning_profile.recommended_next.reason

        if progress.correct_streak >= 2:
            adjusted_difficulty = get_next_difficulty(progress, recommended_difficulty)
            if adjusted_difficulty != recommended_difficulty:
                recommended_difficulty = adjusted_difficulty
                reason = "Ai demonstrat consistență; urcăm dificultatea pe zona care are cel mai mare potențial de creștere."
        elif progress.incorrect_streak >= 2:
            adjusted_difficulty = get_previous_difficulty(recommended_difficulty)
            if adjusted_difficulty != recommended_difficulty:
                recommended_difficulty = adjusted_difficulty
                reason = "Au apărut erori consecutive; coborâm un nivel pentru consolidare înainte de a avansa."

        return NextScenarioRecommendation(
            attack_type=recommended_attack_type,
            difficulty=recommended_difficulty,
            reason=reason,
        )

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
    attack_type: AttackType,
    difficulty: DifficultyLevel,
    session_id: str | None = None,
    owner_user_id: str | None = None,
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
        rule=template.rule,
    )
    persist_event(current_session_id, event)
    persist_session_state(current_session_id, progress, owner_user_id=owner_user_id)

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


def evaluate_scenario(
    scenario_id: str,
    selected_option_id: str,
    owner_user_id: str | None = None,
) -> EvaluateScenarioResponse:
    scenario_context = scenario_contexts.get(scenario_id)

    if scenario_context is None:
        persisted_scenario_context = fetch_scenario_context(scenario_id)
        if persisted_scenario_context is None:
            raise KeyError("Scenario not found")

        scenario_context = ScenarioContext(
            session_id=persisted_scenario_context["session_id"],
            attack_type=cast(AttackType, persisted_scenario_context["attack_type"]),
            difficulty=cast(DifficultyLevel, persisted_scenario_context["difficulty"]),
            rule=ScenarioRule(
                correct_option_id=persisted_scenario_context["correct_option_id"],
                correct_explanation=persisted_scenario_context["correct_explanation"],
                incorrect_explanation=persisted_scenario_context["incorrect_explanation"],
            ),
        )
        scenario_contexts[scenario_id] = scenario_context

    resolved_owner_user_id = owner_user_id
    if resolved_owner_user_id is None:
        ownership = fetch_scenario_session_owner(scenario_id)
        if ownership is not None:
            resolved_owner_user_id = ownership["owner_user_id"]

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

    if resolved_owner_user_id is not None:
        try:
            record_user_learning_attempt(
                user_id=resolved_owner_user_id,
                attack_type=scenario_context.attack_type,
                difficulty=scenario_context.difficulty,
                is_correct=is_correct,
            )
        except Exception:
            logger.exception(
                "Failed to persist adaptive learning profile",
                extra={"session_id": scenario_context.session_id, "scenario_id": scenario_id},
            )

    session_stats = build_session_stats(progress)
    recommendation = build_recommendation(
        progress,
        scenario_context.attack_type,
        scenario_context.difficulty,
        owner_user_id=resolved_owner_user_id,
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


def get_learning_profile(user_id: str) -> LearningProfileResponse:
    return build_learning_profile(user_id)


def get_session_snapshot(session_id: str) -> SessionSnapshotResponse | None:
    snapshot = fetch_session_snapshot(session_id)
    if snapshot is None:
        return None
    return SessionSnapshotResponse.model_validate(snapshot)


def get_session_events(
    session_id: str,
    limit: int = 20,
    offset: int = 0,
    *,
    since: datetime | None = None,
    until: datetime | None = None,
) -> SessionEventsResponse | None:
    events = fetch_session_events(session_id, limit=limit, offset=offset, since=since, until=until)
    if events is None:
        return None
    return SessionEventsResponse.model_validate(events)


def get_session_trends(
    session_id: str,
    limit: int = 30,
    offset: int = 0,
    *,
    attack_type: AttackType | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
) -> SessionTrendsResponse | None:
    trends = fetch_session_trends(
        session_id,
        limit=limit,
        offset=offset,
        attack_type=attack_type,
        since=since,
        until=until,
    )
    if trends is None:
        return None
    return SessionTrendsResponse.model_validate(trends)


def get_session_trend_aggregates(
    session_id: str,
    *,
    attack_type: AttackType | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
) -> SessionTrendAggregatesResponse | None:
    aggregates = fetch_session_trend_aggregates(
        session_id,
        attack_type=attack_type,
        since=since,
        until=until,
    )
    if aggregates is None:
        return None
    return SessionTrendAggregatesResponse.model_validate(aggregates)


def get_scenario_catalog() -> ScenarioCatalogResponse:
    items: list[ScenarioCatalogItemResponse] = []

    for attack_type in ALL_ATTACK_TYPES:
        for difficulty in ALL_DIFFICULTIES:
            templates = SCENARIO_LIBRARY[(attack_type, difficulty)]
            for index, template in enumerate(templates, start=1):
                preview = template.attacker_message.strip()
                if len(preview) > 160:
                    preview = f"{preview[:157]}..."

                items.append(
                    ScenarioCatalogItemResponse(
                        id=f"{attack_type}-{difficulty}-{index}",
                        attack_type=attack_type,
                        difficulty=difficulty,
                        channel=template.channel,
                        attacker_message_preview=preview,
                        red_flags=template.red_flags[:3],
                    )
                )

    return ScenarioCatalogResponse(items=items)
