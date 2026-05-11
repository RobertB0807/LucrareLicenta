from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db import SessionLocal
from persistence_models import ScenarioAttemptORM, SessionEventORM, TrainingSessionORM
from scenario_library import ALL_ATTACK_TYPES


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@contextmanager
def session_scope() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def normalize_per_attack_stats(per_attack_stats: dict[str, dict[str, int]] | None) -> dict[str, dict[str, int]]:
    normalized: dict[str, dict[str, int]] = {
        attack: {"attempts": 0, "correct": 0} for attack in ALL_ATTACK_TYPES
    }
    if not per_attack_stats:
        return normalized

    for attack in ALL_ATTACK_TYPES:
        candidate = per_attack_stats.get(attack, {})
        normalized[attack] = {
            "attempts": int(candidate.get("attempts", 0)),
            "correct": int(candidate.get("correct", 0)),
        }

    return normalized


def upsert_session_progress(
    *,
    session_id: str,
    total_score: int,
    total_attempts: int,
    total_correct: int,
    correct_streak: int,
    incorrect_streak: int,
    per_attack_stats: dict[str, dict[str, int]],
) -> None:
    normalized = normalize_per_attack_stats(per_attack_stats)

    with session_scope() as db:
        row = db.get(TrainingSessionORM, session_id)
        if row is None:
            row = TrainingSessionORM(session_id=session_id)
            db.add(row)

        row.total_score = total_score
        row.total_attempts = total_attempts
        row.total_correct = total_correct
        row.correct_streak = correct_streak
        row.incorrect_streak = incorrect_streak
        row.per_attack_stats_json = json.dumps(normalized)
        row.updated_at = utc_now()


def record_generated_scenario(
    *,
    session_id: str,
    scenario_id: str,
    attack_type: str,
    difficulty: str,
    correct_option_id: str,
    correct_explanation: str,
    incorrect_explanation: str,
) -> None:
    with session_scope() as db:
        existing = db.scalar(
            select(ScenarioAttemptORM).where(ScenarioAttemptORM.scenario_id == scenario_id)
        )
        if existing is not None:
            return

        row = ScenarioAttemptORM(
            scenario_id=scenario_id,
            session_id=session_id,
            attack_type=attack_type,
            difficulty=difficulty,
            correct_option_id=correct_option_id,
            correct_explanation=correct_explanation,
            incorrect_explanation=incorrect_explanation,
        )
        db.add(row)


def fetch_scenario_context(scenario_id: str) -> dict[str, str] | None:
    db = SessionLocal()
    try:
        row = db.scalar(
            select(ScenarioAttemptORM).where(ScenarioAttemptORM.scenario_id == scenario_id)
        )
        if row is None:
            return None
        if (
            row.correct_option_id is None
            or row.correct_explanation is None
            or row.incorrect_explanation is None
        ):
            return None

        return {
            "session_id": row.session_id,
            "attack_type": row.attack_type,
            "difficulty": row.difficulty,
            "correct_option_id": row.correct_option_id,
            "correct_explanation": row.correct_explanation,
            "incorrect_explanation": row.incorrect_explanation,
        }
    finally:
        db.close()


def record_scenario_evaluation(
    *,
    scenario_id: str,
    session_id: str,
    attack_type: str,
    difficulty: str,
    selected_option_id: str,
    is_correct: bool,
    score_delta: int,
    explanation: str,
    recommendation_attack_type: str,
    recommendation_difficulty: str,
) -> None:
    with session_scope() as db:
        row = db.scalar(
            select(ScenarioAttemptORM).where(ScenarioAttemptORM.scenario_id == scenario_id)
        )
        if row is None:
            row = ScenarioAttemptORM(
                scenario_id=scenario_id,
                session_id=session_id,
                attack_type=attack_type,
                difficulty=difficulty,
            )
            db.add(row)

        row.selected_option_id = selected_option_id
        row.is_correct = is_correct
        row.score_delta = score_delta
        row.explanation = explanation
        row.recommendation_attack_type = recommendation_attack_type
        row.recommendation_difficulty = recommendation_difficulty
        row.evaluated_at = utc_now()


def record_session_event(
    *,
    session_id: str,
    event_id: str,
    timestamp_iso: str,
    event_type: str,
    title: str,
    detail: str,
    tone: str,
) -> None:
    parsed_timestamp = datetime.fromisoformat(timestamp_iso)

    with session_scope() as db:
        existing = db.get(SessionEventORM, event_id)
        if existing is not None:
            return

        row = SessionEventORM(
            id=event_id,
            session_id=session_id,
            timestamp=parsed_timestamp,
            event_type=event_type,
            title=title,
            detail=detail,
            tone=tone,
        )
        db.add(row)


def fetch_session_snapshot(session_id: str, event_limit: int = 12) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        row = db.get(TrainingSessionORM, session_id)
        if row is None:
            return None

        raw_per_attack = json.loads(row.per_attack_stats_json) if row.per_attack_stats_json else {}
        per_attack = normalize_per_attack_stats(raw_per_attack)

        per_attack_with_accuracy: dict[str, dict[str, float | int]] = {}
        for attack in ALL_ATTACK_TYPES:
            attempts = per_attack[attack]["attempts"]
            correct = per_attack[attack]["correct"]
            accuracy = round((correct / attempts) * 100, 1) if attempts else 0.0
            per_attack_with_accuracy[attack] = {
                "attempts": attempts,
                "correct": correct,
                "accuracy": accuracy,
            }

        total_accuracy = round((row.total_correct / row.total_attempts) * 100, 1) if row.total_attempts else 0.0

        events = db.execute(
            select(SessionEventORM)
            .where(SessionEventORM.session_id == session_id)
            .order_by(SessionEventORM.timestamp.desc())
            .limit(event_limit)
        ).scalars().all()

        generated_count = db.scalar(
            select(func.count())
            .select_from(ScenarioAttemptORM)
            .where(ScenarioAttemptORM.session_id == session_id)
        )
        evaluated_count = db.scalar(
            select(func.count())
            .select_from(ScenarioAttemptORM)
            .where(
                ScenarioAttemptORM.session_id == session_id,
                ScenarioAttemptORM.evaluated_at.is_not(None),
            )
        )

        return {
            "session_id": session_id,
            "session_stats": {
                "total_score": row.total_score,
                "total_attempts": row.total_attempts,
                "total_correct": row.total_correct,
                "accuracy": total_accuracy,
                "correct_streak": row.correct_streak,
                "incorrect_streak": row.incorrect_streak,
                "per_attack": per_attack_with_accuracy,
                "recent_events": [
                    {
                        "id": event.id,
                        "timestamp": event.timestamp.isoformat(),
                        "event_type": event.event_type,
                        "title": event.title,
                        "detail": event.detail,
                        "tone": event.tone,
                    }
                    for event in events
                ],
            },
            "generated_scenarios": int(generated_count or 0),
            "evaluated_scenarios": int(evaluated_count or 0),
            "last_updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
    finally:
        db.close()


def fetch_session_events(session_id: str, limit: int = 20, offset: int = 0) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        row = db.get(TrainingSessionORM, session_id)
        if row is None:
            return None

        total = db.scalar(
            select(func.count())
            .select_from(SessionEventORM)
            .where(SessionEventORM.session_id == session_id)
        )

        events = db.execute(
            select(SessionEventORM)
            .where(SessionEventORM.session_id == session_id)
            .order_by(SessionEventORM.timestamp.desc())
            .offset(offset)
            .limit(limit)
        ).scalars().all()

        return {
            "session_id": session_id,
            "total": int(total or 0),
            "limit": limit,
            "offset": offset,
            "events": [
                {
                    "id": event.id,
                    "timestamp": event.timestamp.isoformat(),
                    "event_type": event.event_type,
                    "title": event.title,
                    "detail": event.detail,
                    "tone": event.tone,
                }
                for event in events
            ],
        }
    finally:
        db.close()
