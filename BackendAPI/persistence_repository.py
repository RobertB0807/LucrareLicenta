from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterator
from uuid import uuid4

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from db import SessionLocal
from persistence_models import (
    LearningLessonORM,
    LearningQuizAnswerORM,
    LearningQuizAttemptORM,
    LearningQuizOptionORM,
    LearningQuizQuestionORM,
    ScenarioAttemptORM,
    SessionEventORM,
    TrainingSessionORM,
    UserLearningPathProgressORM,
    UserLearningProfileORM,
    UserORM,
)
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


def normalize_mastery_score(score: float) -> float:
    return round(max(0.0, min(100.0, score)), 1)


def compute_mastery_score(current_score: float, attempts: int, is_correct: bool, difficulty: str) -> float:
    difficulty_target_map = {"easy": 10.0, "medium": 16.0, "hard": 22.0}
    difficulty_bonus_map = {"easy": 0.0, "medium": 0.01, "hard": 0.02}

    target = 100.0 if is_correct else difficulty_target_map.get(difficulty, 16.0)
    update_weight = min(0.4, 0.18 + min(attempts, 5) * 0.03 + difficulty_bonus_map.get(difficulty, 0.0))
    updated_score = current_score * (1.0 - update_weight) + target * update_weight
    return normalize_mastery_score(updated_score)


def upsert_session_progress(
    *,
    session_id: str,
    total_score: int,
    total_attempts: int,
    total_correct: int,
    correct_streak: int,
    incorrect_streak: int,
    per_attack_stats: dict[str, dict[str, int]],
    owner_user_id: str | None = None,
) -> None:
    normalized = normalize_per_attack_stats(per_attack_stats)

    with session_scope() as db:
        row = db.get(TrainingSessionORM, session_id)
        if row is None:
            row = TrainingSessionORM(session_id=session_id, owner_user_id=owner_user_id)
            db.add(row)
        elif owner_user_id and row.owner_user_id is None:
            row.owner_user_id = owner_user_id

        row.total_score = total_score
        row.total_attempts = total_attempts
        row.total_correct = total_correct
        row.correct_streak = correct_streak
        row.incorrect_streak = incorrect_streak
        row.per_attack_stats_json = json.dumps(normalized)
        row.updated_at = utc_now()


def create_user(*, email: str, password_hash: str, display_name: str) -> dict[str, Any]:
    normalized_email = email.strip().lower()
    with session_scope() as db:
        existing = db.scalar(select(UserORM).where(UserORM.email == normalized_email))
        if existing is not None:
            raise ValueError("Email already exists")

        user = UserORM(
            id=str(uuid4()),
            email=normalized_email,
            password_hash=password_hash,
            display_name=display_name,
            is_active=True,
        )
        db.add(user)
        db.flush()
        return {
            "id": user.id,
            "firebase_uid": user.firebase_uid,
            "email": user.email,
            "display_name": user.display_name,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }


def create_or_update_firebase_user(
    *,
    firebase_uid: str,
    email: str,
    display_name: str | None = None,
    update_existing_display_name: bool = True,
) -> dict[str, Any]:
    normalized_uid = firebase_uid.strip()
    normalized_email = email.strip().lower()
    resolved_display_name = (
        display_name.strip()
        if display_name and display_name.strip()
        else normalized_email.split("@", maxsplit=1)[0]
    )

    if not normalized_uid:
        raise ValueError("Firebase UID is required")
    if not normalized_email:
        raise ValueError("Firebase email is required")

    with session_scope() as db:
        user = db.scalar(select(UserORM).where(UserORM.firebase_uid == normalized_uid))
        if user is None:
            user = db.scalar(select(UserORM).where(UserORM.email == normalized_email))
            if user is not None and user.firebase_uid not in (None, normalized_uid):
                raise ValueError("Email is already linked to another Firebase account")

        if user is None:
            user = UserORM(
                id=str(uuid4()),
                firebase_uid=normalized_uid,
                email=normalized_email,
                password_hash="firebase-auth",
                display_name=resolved_display_name,
                is_active=True,
            )
            db.add(user)
        else:
            user.firebase_uid = normalized_uid
            user.email = normalized_email
            if update_existing_display_name:
                user.display_name = resolved_display_name
            user.updated_at = utc_now()

        db.flush()
        return {
            "id": user.id,
            "firebase_uid": user.firebase_uid,
            "email": user.email,
            "display_name": user.display_name,
            "is_active": user.is_active,
        }


def fetch_user_by_email(email: str) -> dict[str, Any] | None:
    normalized_email = email.strip().lower()
    db = SessionLocal()
    try:
        row = db.scalar(select(UserORM).where(UserORM.email == normalized_email))
        if row is None:
            return None
        return {
            "id": row.id,
            "firebase_uid": row.firebase_uid,
            "email": row.email,
            "password_hash": row.password_hash,
            "display_name": row.display_name,
            "is_active": row.is_active,
        }
    finally:
        db.close()


def fetch_user_by_id(user_id: str) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        row = db.get(UserORM, user_id)
        if row is None:
            return None
        return {
            "id": row.id,
            "firebase_uid": row.firebase_uid,
            "email": row.email,
            "display_name": row.display_name,
            "is_active": row.is_active,
        }
    finally:
        db.close()


def update_user_display_name(user_id: str, display_name: str) -> dict[str, Any] | None:
    normalized_display_name = display_name.strip()
    with session_scope() as db:
        user = db.get(UserORM, user_id)
        if user is None:
            return None

        user.display_name = normalized_display_name
        user.updated_at = utc_now()
        db.flush()
        return {
            "id": user.id,
            "firebase_uid": user.firebase_uid,
            "email": user.email,
            "display_name": user.display_name,
            "is_active": user.is_active,
        }


def delete_user_account(user_id: str) -> bool:
    with session_scope() as db:
        user = db.scalar(
            select(UserORM)
            .where(UserORM.id == user_id)
            .options(
                selectinload(UserORM.sessions),
                selectinload(UserORM.mastery_profiles),
                selectinload(UserORM.learning_path_progress),
                selectinload(UserORM.lesson_quiz_attempts),
            )
        )
        if user is None:
            return False

        db.delete(user)
        db.flush()
        return True


def record_user_learning_attempt(
    *,
    user_id: str,
    attack_type: str,
    difficulty: str,
    is_correct: bool,
    attempted_at: datetime | None = None,
) -> None:
    with session_scope() as db:
        _apply_user_learning_attempt(
            db,
            user_id=user_id,
            attack_type=attack_type,
            difficulty=difficulty,
            is_correct=is_correct,
            attempted_at=attempted_at,
        )


def _apply_user_learning_attempt(
    db: Session,
    *,
    user_id: str,
    attack_type: str,
    difficulty: str,
    is_correct: bool,
    attempted_at: datetime | None = None,
) -> None:
    row = db.scalar(
        select(UserLearningProfileORM)
        .where(
            UserLearningProfileORM.user_id == user_id,
            UserLearningProfileORM.attack_type == attack_type,
            UserLearningProfileORM.difficulty == difficulty,
        )
        .with_for_update()
    )

    if row is None:
        row = UserLearningProfileORM(
            user_id=user_id,
            attack_type=attack_type,
            difficulty=difficulty,
            mastery_score=50.0,
            attempts=0,
            correct=0,
        )
        db.add(row)

    row.attempts = int(row.attempts or 0) + 1
    if is_correct:
        row.correct = int(row.correct or 0) + 1

    row.mastery_score = compute_mastery_score(
        float(row.mastery_score or 50.0),
        row.attempts,
        is_correct,
        difficulty,
    )
    row.last_result_correct = is_correct
    row.last_attempt_at = attempted_at or utc_now()
    row.updated_at = utc_now()


def _update_learning_path_activity_row(
    row: UserLearningPathProgressORM,
    *,
    xp_delta: int,
    activity_at: datetime | None = None,
) -> None:
    current_time = activity_at or utc_now()
    activity_date = current_time.astimezone(timezone.utc).date()
    if row.last_activity_date is None:
        row.current_streak = 1
    elif row.last_activity_date == activity_date:
        pass
    elif row.last_activity_date == activity_date - timedelta(days=1):
        row.current_streak = int(row.current_streak or 0) + 1
    else:
        row.current_streak = 1

    row.longest_streak = max(int(row.longest_streak or 0), int(row.current_streak or 0))
    row.last_activity_date = activity_date
    row.xp = int(row.xp or 0) + max(0, xp_delta)
    row.updated_at = current_time


def _apply_learning_path_activity(
    db: Session,
    *,
    user_id: str,
    xp_delta: int,
    activity_at: datetime | None = None,
) -> UserLearningPathProgressORM:
    row = db.scalar(
        select(UserLearningPathProgressORM)
        .where(UserLearningPathProgressORM.user_id == user_id)
        .with_for_update()
    )
    if row is None:
        row = UserLearningPathProgressORM(
            user_id=user_id,
            completed_lessons_json="[]",
            xp=0,
            current_streak=0,
            longest_streak=0,
        )
        db.add(row)

    _update_learning_path_activity_row(
        row,
        xp_delta=xp_delta,
        activity_at=activity_at,
    )
    return row


def _complete_learning_path_lesson_in_session(
    db: Session,
    *,
    user_id: str,
    lesson_id: str,
    xp_reward: int,
    row: UserLearningPathProgressORM | None = None,
) -> dict[str, Any]:
    if row is None:
        row = db.scalar(
            select(UserLearningPathProgressORM)
            .where(UserLearningPathProgressORM.user_id == user_id)
            .with_for_update()
        )
    if row is None:
        row = UserLearningPathProgressORM(
            user_id=user_id,
            completed_lessons_json="[]",
            xp=0,
            current_streak=0,
            longest_streak=0,
        )
        db.add(row)

    try:
        completed_lessons = json.loads(row.completed_lessons_json or "[]")
    except (TypeError, json.JSONDecodeError):
        completed_lessons = []
    if not isinstance(completed_lessons, list):
        completed_lessons = []

    normalized_lessons = {
        str(item) for item in completed_lessons if isinstance(item, str) and item
    }
    was_already_completed = lesson_id in normalized_lessons
    if not was_already_completed:
        normalized_lessons.add(lesson_id)
        row.completed_lessons_json = json.dumps(sorted(normalized_lessons))
        _update_learning_path_activity_row(
            row,
            xp_delta=xp_reward,
        )

    return {
        "lesson_id": lesson_id,
        "was_already_completed": was_already_completed,
    }


def complete_learning_path_lesson(
    *,
    user_id: str,
    lesson_id: str,
    xp_reward: int = 25,
) -> dict[str, Any]:
    with session_scope() as db:
        result = _complete_learning_path_lesson_in_session(
            db,
            user_id=user_id,
            lesson_id=lesson_id,
            xp_reward=xp_reward,
        )
        db.flush()
        return result


def fetch_learning_lessons(user_id: str) -> list[dict[str, Any]]:
    db = SessionLocal()
    try:
        lessons = db.scalars(
            select(LearningLessonORM)
            .where(LearningLessonORM.is_active.is_(True))
            .order_by(LearningLessonORM.order_index.asc(), LearningLessonORM.id.asc())
        ).all()
        attempts = db.scalars(
            select(LearningQuizAttemptORM)
            .where(LearningQuizAttemptORM.user_id == user_id)
            .order_by(LearningQuizAttemptORM.created_at.desc())
        ).all()
        by_lesson: dict[str, list[LearningQuizAttemptORM]] = {}
        for attempt in attempts:
            by_lesson.setdefault(attempt.lesson_id, []).append(attempt)

        return [
            {
                "id": lesson.id,
                "category": lesson.category,
                "title": lesson.title,
                "summary": lesson.summary,
                "duration_minutes": lesson.duration_minutes,
                "level": lesson.level,
                "attack_type": lesson.attack_type,
                "difficulty": lesson.difficulty,
                "pass_score": lesson.pass_score,
                "xp_reward": lesson.xp_reward,
                "attempts": len(by_lesson.get(lesson.id, [])),
                "best_score": max(
                    (attempt.score for attempt in by_lesson.get(lesson.id, [])),
                    default=None,
                ),
                "passed": any(
                    attempt.passed for attempt in by_lesson.get(lesson.id, [])
                ),
            }
            for lesson in lessons
        ]
    finally:
        db.close()


def fetch_learning_lesson(lesson_id: str, user_id: str) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        lesson = db.scalar(
            select(LearningLessonORM)
            .options(
                selectinload(LearningLessonORM.sections),
                selectinload(LearningLessonORM.questions).selectinload(
                    LearningQuizQuestionORM.options
                ),
            )
            .where(
                LearningLessonORM.id == lesson_id,
                LearningLessonORM.is_active.is_(True),
            )
        )
        if lesson is None:
            return None

        attempts = db.scalars(
            select(LearningQuizAttemptORM)
            .where(
                LearningQuizAttemptORM.user_id == user_id,
                LearningQuizAttemptORM.lesson_id == lesson_id,
            )
            .order_by(LearningQuizAttemptORM.created_at.desc())
        ).all()
        return {
            "id": lesson.id,
            "category": lesson.category,
            "title": lesson.title,
            "summary": lesson.summary,
            "duration_minutes": lesson.duration_minutes,
            "level": lesson.level,
            "attack_type": lesson.attack_type,
            "difficulty": lesson.difficulty,
            "pass_score": lesson.pass_score,
            "xp_reward": lesson.xp_reward,
            "attempts": len(attempts),
            "best_score": max((attempt.score for attempt in attempts), default=None),
            "passed": any(attempt.passed for attempt in attempts),
            "sections": [
                {
                    "id": section.id,
                    "title": section.title,
                    "body": section.body,
                    "order_index": section.order_index,
                }
                for section in lesson.sections
            ],
            "questions": [
                {
                    "id": question.id,
                    "prompt": question.prompt,
                    "order_index": question.order_index,
                    "options": [
                        {
                            "id": option.id,
                            "text": option.text,
                            "order_index": option.order_index,
                        }
                        for option in question.options
                    ],
                }
                for question in lesson.questions
            ],
        }
    finally:
        db.close()


def has_passed_learning_lesson_quiz(user_id: str, lesson_id: str) -> bool:
    db = SessionLocal()
    try:
        return bool(
            db.scalar(
                select(func.count())
                .select_from(LearningQuizAttemptORM)
                .where(
                    LearningQuizAttemptORM.user_id == user_id,
                    LearningQuizAttemptORM.lesson_id == lesson_id,
                    LearningQuizAttemptORM.passed.is_(True),
                )
            )
        )
    finally:
        db.close()


def record_learning_quiz_attempt(
    *,
    user_id: str,
    lesson_id: str,
    answers: list[dict[str, str]],
) -> dict[str, Any]:
    with session_scope() as db:
        lesson = db.scalar(
            select(LearningLessonORM)
            .options(
                selectinload(LearningLessonORM.questions).selectinload(
                    LearningQuizQuestionORM.options
                )
            )
            .where(
                LearningLessonORM.id == lesson_id,
                LearningLessonORM.is_active.is_(True),
            )
        )
        if lesson is None:
            raise ValueError("Unknown lesson")
        if not lesson.questions:
            raise ValueError("Lesson has no quiz")

        progress_row = db.scalar(
            select(UserLearningPathProgressORM)
            .where(UserLearningPathProgressORM.user_id == user_id)
            .with_for_update()
        )
        completed_lessons: list[Any] = []
        if progress_row is not None:
            try:
                parsed_lessons = json.loads(progress_row.completed_lessons_json or "[]")
                if isinstance(parsed_lessons, list):
                    completed_lessons = parsed_lessons
            except (TypeError, json.JSONDecodeError):
                pass
        was_already_completed = lesson_id in {
            str(item)
            for item in completed_lessons
            if isinstance(item, str) and item
        }

        answers_by_question = {
            answer["question_id"]: answer["selected_option_id"] for answer in answers
        }
        if len(answers_by_question) != len(answers):
            raise ValueError("Each quiz question may be answered only once")

        expected_question_ids = {question.id for question in lesson.questions}
        if set(answers_by_question) != expected_question_ids:
            raise ValueError("All quiz questions must be answered")

        result_rows: list[dict[str, Any]] = []
        correct_answers = 0
        for question in lesson.questions:
            selected_option_id = answers_by_question[question.id]
            selected_option = next(
                (
                    option
                    for option in question.options
                    if option.id == selected_option_id
                ),
                None,
            )
            if selected_option is None:
                raise ValueError("Selected option does not belong to the quiz question")
            correct_option = next(
                (option for option in question.options if option.is_correct),
                None,
            )
            if correct_option is None:
                raise ValueError("Quiz question has no correct option")

            is_correct = bool(selected_option.is_correct)
            if is_correct:
                correct_answers += 1
            result_rows.append(
                {
                    "question_id": question.id,
                    "selected_option_id": selected_option.id,
                    "correct_option_id": correct_option.id,
                    "is_correct": is_correct,
                    "explanation": question.explanation,
                }
            )

        total_questions = len(lesson.questions)
        score = round((correct_answers / total_questions) * 100)
        passed = score >= lesson.pass_score
        completion = {
            "lesson_id": lesson_id,
            "was_already_completed": was_already_completed,
        }
        xp_awarded = 0
        if passed:
            completion = _complete_learning_path_lesson_in_session(
                db,
                user_id=user_id,
                lesson_id=lesson_id,
                xp_reward=lesson.xp_reward,
                row=progress_row,
            )
            if not completion["was_already_completed"]:
                xp_awarded = lesson.xp_reward

        attempt = LearningQuizAttemptORM(
            id=str(uuid4()),
            user_id=user_id,
            lesson_id=lesson_id,
            score=score,
            correct_answers=correct_answers,
            total_questions=total_questions,
            passed=passed,
            xp_awarded=xp_awarded,
        )
        db.add(attempt)
        db.flush()
        for result in result_rows:
            db.add(
                LearningQuizAnswerORM(
                    attempt_id=attempt.id,
                    question_id=result["question_id"],
                    selected_option_id=result["selected_option_id"],
                    is_correct=result["is_correct"],
                )
            )

        return {
            "attempt_id": attempt.id,
            "lesson_id": lesson_id,
            "score": score,
            "correct_answers": correct_answers,
            "total_questions": total_questions,
            "passed": passed,
            "pass_score": lesson.pass_score,
            "xp_awarded": xp_awarded,
            "lesson_completed": passed or was_already_completed,
            "was_already_completed": bool(completion["was_already_completed"]),
            "answers": result_rows,
            "created_at": attempt.created_at.isoformat() if attempt.created_at else utc_now().isoformat(),
        }


def fetch_learning_quiz_attempts(
    user_id: str,
    *,
    lesson_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    db = SessionLocal()
    try:
        filters = [LearningQuizAttemptORM.user_id == user_id]
        if lesson_id:
            filters.append(LearningQuizAttemptORM.lesson_id == lesson_id)

        total = db.scalar(
            select(func.count())
            .select_from(LearningQuizAttemptORM)
            .where(*filters)
        )
        attempts = db.scalars(
            select(LearningQuizAttemptORM)
            .where(*filters)
            .order_by(
                LearningQuizAttemptORM.created_at.desc(),
                LearningQuizAttemptORM.id.desc(),
            )
            .offset(offset)
            .limit(limit)
        ).all()
        return {
            "total": int(total or 0),
            "limit": limit,
            "offset": offset,
            "items": [
                {
                    "attempt_id": attempt.id,
                    "lesson_id": attempt.lesson_id,
                    "score": attempt.score,
                    "correct_answers": attempt.correct_answers,
                    "total_questions": attempt.total_questions,
                    "passed": attempt.passed,
                    "xp_awarded": attempt.xp_awarded,
                    "created_at": attempt.created_at.isoformat(),
                }
                for attempt in attempts
            ],
        }
    finally:
        db.close()


def fetch_learning_path_progress(user_id: str) -> dict[str, Any]:
    db = SessionLocal()
    try:
        row = db.get(UserLearningPathProgressORM, user_id)
        if row is None:
            return {
                "completed_lessons": [],
                "xp": 0,
                "current_streak": 0,
                "longest_streak": 0,
                "last_activity_date": None,
            }
        try:
            completed_lessons = json.loads(row.completed_lessons_json or "[]")
        except (TypeError, json.JSONDecodeError):
            completed_lessons = []
        if not isinstance(completed_lessons, list):
            completed_lessons = []
        return {
            "completed_lessons": [
                str(item) for item in completed_lessons if isinstance(item, str) and item
            ],
            "xp": int(row.xp or 0),
            "current_streak": int(row.current_streak or 0),
            "longest_streak": int(row.longest_streak or 0),
            "last_activity_date": (
                row.last_activity_date.isoformat() if row.last_activity_date else None
            ),
        }
    finally:
        db.close()


def fetch_user_recent_activity(
    user_id: str,
    *,
    since: datetime,
) -> dict[str, int]:
    db = SessionLocal()
    try:
        attempts = db.execute(
            select(ScenarioAttemptORM)
            .join(
                TrainingSessionORM,
                TrainingSessionORM.session_id == ScenarioAttemptORM.session_id,
            )
            .where(
                TrainingSessionORM.owner_user_id == user_id,
                ScenarioAttemptORM.evaluated_at.is_not(None),
                ScenarioAttemptORM.evaluated_at >= since,
            )
        ).scalars().all()
        return {
            "attempts": len(attempts),
            "correct": sum(1 for attempt in attempts if bool(attempt.is_correct)),
        }
    finally:
        db.close()


def fetch_user_learning_profiles(user_id: str) -> list[dict[str, Any]]:
    db = SessionLocal()
    try:
        rows = db.execute(
            select(UserLearningProfileORM)
            .where(UserLearningProfileORM.user_id == user_id)
            .order_by(UserLearningProfileORM.attack_type.asc(), UserLearningProfileORM.difficulty.asc())
        ).scalars().all()
        return [
            {
                "user_id": row.user_id,
                "attack_type": row.attack_type,
                "difficulty": row.difficulty,
                "attempts": row.attempts,
                "correct": row.correct,
                "mastery_score": float(row.mastery_score or 0.0),
                "last_result_correct": row.last_result_correct,
                "last_attempt_at": row.last_attempt_at.isoformat() if row.last_attempt_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ]
    finally:
        db.close()


def ensure_session_owner(session_id: str, user_id: str) -> bool:
    db = SessionLocal()
    try:
        row = db.get(TrainingSessionORM, session_id)
        return row is not None and row.owner_user_id == user_id
    finally:
        db.close()


def fetch_scenario_session_owner(scenario_id: str) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        row = db.scalar(
            select(ScenarioAttemptORM).where(ScenarioAttemptORM.scenario_id == scenario_id)
        )
        if row is None:
            return None
        session = db.get(TrainingSessionORM, row.session_id)
        return {
            "session_id": row.session_id,
            "owner_user_id": session.owner_user_id if session is not None else None,
        }
    finally:
        db.close()


def record_generated_scenario(
    *,
    session_id: str,
    scenario_id: str,
    attack_type: str,
    difficulty: str,
    template_id: str | None,
    channel: str,
    attacker_message: str,
    options: list[dict[str, str]],
    red_flags: list[str],
    correct_option_id: str,
    correct_explanation: str,
    incorrect_explanation: str,
    content_source: str = "rule_based",
    llm_model: str | None = None,
    generation_ms: int | None = None,
    fallback_reason: str | None = None,
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
            template_id=template_id,
            content_source=content_source,
            llm_model=llm_model,
            generation_ms=generation_ms,
            fallback_reason=fallback_reason,
            channel=channel,
            attacker_message=attacker_message,
            options_json=json.dumps(options),
            red_flags_json=json.dumps(red_flags),
            correct_option_id=correct_option_id,
            correct_explanation=correct_explanation,
            incorrect_explanation=incorrect_explanation,
        )
        db.add(row)


def fetch_generated_scenario(scenario_id: str) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        row = db.scalar(
            select(ScenarioAttemptORM).where(ScenarioAttemptORM.scenario_id == scenario_id)
        )
        if row is None:
            return None
        if (
            row.channel is None
            or row.attacker_message is None
            or row.options_json is None
            or row.red_flags_json is None
        ):
            return None

        try:
            options = json.loads(row.options_json)
            red_flags = json.loads(row.red_flags_json)
        except (TypeError, json.JSONDecodeError):
            return None

        if not isinstance(options, list) or not isinstance(red_flags, list):
            return None

        return {
            "session_id": row.session_id,
            "scenario_id": row.scenario_id,
            "template_id": row.template_id,
            "content_source": row.content_source,
            "llm_model": row.llm_model,
            "generation_ms": row.generation_ms,
            "fallback_reason": row.fallback_reason,
            "attack_type": row.attack_type,
            "difficulty": row.difficulty,
            "channel": row.channel,
            "attacker_message": row.attacker_message,
            "options": options,
            "red_flags": red_flags,
        }
    finally:
        db.close()


def fetch_recent_generated_scenarios(
    session_id: str,
    *,
    attack_type: str,
    difficulty: str,
    limit: int = 6,
) -> list[dict[str, str | None]]:
    db = SessionLocal()
    try:
        rows = db.scalars(
            select(ScenarioAttemptORM)
            .where(
                ScenarioAttemptORM.session_id == session_id,
                ScenarioAttemptORM.attack_type == attack_type,
                ScenarioAttemptORM.difficulty == difficulty,
            )
            .order_by(ScenarioAttemptORM.created_at.desc(), ScenarioAttemptORM.id.desc())
            .limit(max(1, limit))
        ).all()
        return [
            {
                "template_id": row.template_id,
                "attacker_message": row.attacker_message,
            }
            for row in rows
        ]
    finally:
        db.close()


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


def apply_scenario_evaluation_once(
    *,
    scenario_id: str,
    session_id: str,
    attack_type: str,
    difficulty: str,
    selected_option_id: str,
    is_correct: bool,
    score_delta: int,
    explanation: str,
    event_id: str,
    event_timestamp_iso: str,
    event_type: str,
    event_title: str,
    event_detail: str,
    event_tone: str,
    owner_user_id: str | None = None,
) -> dict[str, Any]:
    evaluated_at = utc_now()

    with session_scope() as db:
        claim = db.execute(
            update(ScenarioAttemptORM)
            .where(
                ScenarioAttemptORM.scenario_id == scenario_id,
                ScenarioAttemptORM.evaluated_at.is_(None),
            )
            .values(
                selected_option_id=selected_option_id,
                is_correct=is_correct,
                score_delta=score_delta,
                explanation=explanation,
                evaluated_at=evaluated_at,
            )
        )

        if claim.rowcount != 1:
            existing = db.scalar(
                select(ScenarioAttemptORM).where(ScenarioAttemptORM.scenario_id == scenario_id)
            )
            if existing is None:
                return {"status": "missing"}
            return {
                "status": "duplicate",
                "selected_option_id": existing.selected_option_id,
                "is_correct": bool(existing.is_correct),
                "score_delta": int(existing.score_delta or 0),
                "explanation": existing.explanation or "",
            }

        session = db.scalar(
            select(TrainingSessionORM)
            .where(TrainingSessionORM.session_id == session_id)
            .with_for_update()
        )
        if session is None:
            raise ValueError("Training session not found")

        raw_per_attack = (
            json.loads(session.per_attack_stats_json)
            if session.per_attack_stats_json
            else {}
        )
        per_attack = normalize_per_attack_stats(raw_per_attack)
        attack_stats = per_attack[attack_type]

        session.total_attempts = int(session.total_attempts or 0) + 1
        session.total_score = int(session.total_score or 0) + score_delta
        attack_stats["attempts"] += 1

        if is_correct:
            session.total_correct = int(session.total_correct or 0) + 1
            session.correct_streak = int(session.correct_streak or 0) + 1
            session.incorrect_streak = 0
            attack_stats["correct"] += 1
        else:
            session.incorrect_streak = int(session.incorrect_streak or 0) + 1
            session.correct_streak = 0

        if owner_user_id and session.owner_user_id is None:
            session.owner_user_id = owner_user_id
        session.per_attack_stats_json = json.dumps(per_attack)
        session.updated_at = evaluated_at

        db.add(
            SessionEventORM(
                id=event_id,
                session_id=session_id,
                timestamp=datetime.fromisoformat(event_timestamp_iso),
                event_type=event_type,
                title=event_title,
                detail=event_detail,
                tone=event_tone,
            )
        )

        if owner_user_id is not None:
            _apply_user_learning_attempt(
                db,
                user_id=owner_user_id,
                attack_type=attack_type,
                difficulty=difficulty,
                is_correct=is_correct,
                attempted_at=evaluated_at,
            )
            _apply_learning_path_activity(
                db,
                user_id=owner_user_id,
                xp_delta=20 if is_correct else 10,
                activity_at=evaluated_at,
            )

        return {
            "status": "applied",
            "selected_option_id": selected_option_id,
            "is_correct": is_correct,
            "score_delta": score_delta,
            "explanation": explanation,
        }


def update_scenario_recommendation(
    *,
    scenario_id: str,
    recommendation_attack_type: str,
    recommendation_difficulty: str,
) -> None:
    with session_scope() as db:
        row = db.scalar(
            select(ScenarioAttemptORM).where(ScenarioAttemptORM.scenario_id == scenario_id)
        )
        if row is None:
            return
        row.recommendation_attack_type = recommendation_attack_type
        row.recommendation_difficulty = recommendation_difficulty


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


def fetch_user_sessions(
    user_id: str,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    generated_count = (
        select(func.count(ScenarioAttemptORM.id))
        .where(ScenarioAttemptORM.session_id == TrainingSessionORM.session_id)
        .correlate(TrainingSessionORM)
        .scalar_subquery()
    )
    evaluated_count = (
        select(func.count(ScenarioAttemptORM.id))
        .where(
            ScenarioAttemptORM.session_id == TrainingSessionORM.session_id,
            ScenarioAttemptORM.evaluated_at.is_not(None),
        )
        .correlate(TrainingSessionORM)
        .scalar_subquery()
    )
    latest_attack_type = (
        select(ScenarioAttemptORM.attack_type)
        .where(ScenarioAttemptORM.session_id == TrainingSessionORM.session_id)
        .order_by(ScenarioAttemptORM.created_at.desc(), ScenarioAttemptORM.id.desc())
        .limit(1)
        .correlate(TrainingSessionORM)
        .scalar_subquery()
    )
    latest_difficulty = (
        select(ScenarioAttemptORM.difficulty)
        .where(ScenarioAttemptORM.session_id == TrainingSessionORM.session_id)
        .order_by(ScenarioAttemptORM.created_at.desc(), ScenarioAttemptORM.id.desc())
        .limit(1)
        .correlate(TrainingSessionORM)
        .scalar_subquery()
    )
    pending_scenario_id = (
        select(ScenarioAttemptORM.scenario_id)
        .where(
            ScenarioAttemptORM.session_id == TrainingSessionORM.session_id,
            ScenarioAttemptORM.evaluated_at.is_(None),
        )
        .order_by(ScenarioAttemptORM.created_at.desc(), ScenarioAttemptORM.id.desc())
        .limit(1)
        .correlate(TrainingSessionORM)
        .scalar_subquery()
    )

    db = SessionLocal()
    try:
        total = db.scalar(
            select(func.count())
            .select_from(TrainingSessionORM)
            .where(TrainingSessionORM.owner_user_id == user_id)
        )
        rows = db.execute(
            select(
                TrainingSessionORM,
                generated_count.label("generated_scenarios"),
                evaluated_count.label("evaluated_scenarios"),
                latest_attack_type.label("latest_attack_type"),
                latest_difficulty.label("latest_difficulty"),
                pending_scenario_id.label("pending_scenario_id"),
            )
            .where(TrainingSessionORM.owner_user_id == user_id)
            .order_by(TrainingSessionORM.updated_at.desc(), TrainingSessionORM.session_id.desc())
            .offset(offset)
            .limit(limit)
        ).all()

        items: list[dict[str, Any]] = []
        for (
            session,
            generated_scenarios,
            evaluated_scenarios,
            current_attack_type,
            current_difficulty,
            current_pending_scenario_id,
        ) in rows:
            accuracy = (
                round((session.total_correct / session.total_attempts) * 100, 1)
                if session.total_attempts
                else 0.0
            )
            items.append(
                {
                    "session_id": session.session_id,
                    "total_score": int(session.total_score or 0),
                    "total_attempts": int(session.total_attempts or 0),
                    "total_correct": int(session.total_correct or 0),
                    "accuracy": accuracy,
                    "generated_scenarios": int(generated_scenarios or 0),
                    "evaluated_scenarios": int(evaluated_scenarios or 0),
                    "latest_attack_type": current_attack_type,
                    "latest_difficulty": current_difficulty,
                    "pending_scenario_id": current_pending_scenario_id,
                    "created_at": session.created_at.isoformat() if session.created_at else None,
                    "updated_at": session.updated_at.isoformat() if session.updated_at else None,
                }
            )

        return {
            "total": int(total or 0),
            "limit": limit,
            "offset": offset,
            "items": items,
        }
    finally:
        db.close()


def fetch_session_events(
    session_id: str,
    limit: int = 20,
    offset: int = 0,
    *,
    since: datetime | None = None,
    until: datetime | None = None,
) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        row = db.get(TrainingSessionORM, session_id)
        if row is None:
            return None

        filters = [SessionEventORM.session_id == session_id]
        if since is not None:
            filters.append(SessionEventORM.timestamp >= since)
        if until is not None:
            filters.append(SessionEventORM.timestamp <= until)

        total = db.scalar(
            select(func.count())
            .select_from(SessionEventORM)
            .where(*filters)
        )

        events = db.execute(
            select(SessionEventORM)
            .where(*filters)
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


def fetch_session_trends(
    session_id: str,
    limit: int = 30,
    offset: int = 0,
    *,
    attack_type: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        row = db.get(TrainingSessionORM, session_id)
        if row is None:
            return None

        filters = [
            ScenarioAttemptORM.session_id == session_id,
            ScenarioAttemptORM.evaluated_at.is_not(None),
        ]
        if attack_type is not None:
            filters.append(ScenarioAttemptORM.attack_type == attack_type)
        if since is not None:
            filters.append(ScenarioAttemptORM.evaluated_at >= since)
        if until is not None:
            filters.append(ScenarioAttemptORM.evaluated_at <= until)

        attempts = db.execute(
            select(ScenarioAttemptORM)
            .where(*filters)
            .order_by(ScenarioAttemptORM.evaluated_at.asc(), ScenarioAttemptORM.id.asc())
        ).scalars().all()

        trend_points: list[dict[str, Any]] = []
        running_score = 0
        running_attempts = 0
        running_correct = 0

        for attempt in attempts:
            running_attempts += 1
            running_score += int(attempt.score_delta or 0)
            if attempt.is_correct:
                running_correct += 1
            accuracy = round((running_correct / running_attempts) * 100, 1) if running_attempts else 0.0

            trend_points.append(
                {
                    "timestamp": attempt.evaluated_at.isoformat() if attempt.evaluated_at else "",
                    "attack_type": attempt.attack_type,
                    "difficulty": attempt.difficulty,
                    "is_correct": bool(attempt.is_correct),
                    "score_delta": int(attempt.score_delta or 0),
                    "score_after": running_score,
                    "accuracy_after": accuracy,
                    "attempt_index": running_attempts,
                }
            )

        total_points = len(trend_points)
        paged_points = trend_points[offset : offset + limit]

        return {
            "session_id": session_id,
            "total": total_points,
            "limit": limit,
            "offset": offset,
            "points": paged_points,
        }
    finally:
        db.close()


def fetch_session_trend_aggregates(
    session_id: str,
    *,
    attack_type: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        row = db.get(TrainingSessionORM, session_id)
        if row is None:
            return None

        filters = [
            ScenarioAttemptORM.session_id == session_id,
            ScenarioAttemptORM.evaluated_at.is_not(None),
        ]
        if attack_type is not None:
            filters.append(ScenarioAttemptORM.attack_type == attack_type)
        if since is not None:
            filters.append(ScenarioAttemptORM.evaluated_at >= since)
        if until is not None:
            filters.append(ScenarioAttemptORM.evaluated_at <= until)

        attempts = db.execute(
            select(ScenarioAttemptORM)
            .where(*filters)
            .order_by(ScenarioAttemptORM.evaluated_at.asc(), ScenarioAttemptORM.id.asc())
        ).scalars().all()

        by_day: dict[str, dict[str, int]] = {}
        by_attack: dict[str, dict[str, int]] = {}

        for attempt in attempts:
            if attempt.evaluated_at is None:
                continue

            day_key = attempt.evaluated_at.date().isoformat()
            day_stats = by_day.setdefault(
                day_key,
                {
                    "attempts": 0,
                    "correct": 0,
                    "score_delta_total": 0,
                },
            )
            day_stats["attempts"] += 1
            day_stats["correct"] += 1 if bool(attempt.is_correct) else 0
            day_stats["score_delta_total"] += int(attempt.score_delta or 0)

            attack_key = str(attempt.attack_type)
            attack_stats = by_attack.setdefault(
                attack_key,
                {
                    "attempts": 0,
                    "correct": 0,
                    "score_delta_total": 0,
                },
            )
            attack_stats["attempts"] += 1
            attack_stats["correct"] += 1 if bool(attempt.is_correct) else 0
            attack_stats["score_delta_total"] += int(attempt.score_delta or 0)

        day_points: list[dict[str, Any]] = []
        cumulative_score_after = 0
        for day in sorted(by_day.keys()):
            stats = by_day[day]
            attempts_count = stats["attempts"]
            correct_count = stats["correct"]
            score_delta_total = stats["score_delta_total"]
            cumulative_score_after += score_delta_total
            accuracy = round((correct_count / attempts_count) * 100, 1) if attempts_count else 0.0
            day_points.append(
                {
                    "day": day,
                    "attempts": attempts_count,
                    "correct": correct_count,
                    "accuracy": accuracy,
                    "score_delta_total": score_delta_total,
                    "cumulative_score_after": cumulative_score_after,
                }
            )

        attack_points: list[dict[str, Any]] = []
        for current_attack in sorted(by_attack.keys()):
            stats = by_attack[current_attack]
            attempts_count = stats["attempts"]
            correct_count = stats["correct"]
            score_delta_total = stats["score_delta_total"]
            accuracy = round((correct_count / attempts_count) * 100, 1) if attempts_count else 0.0
            average_score_delta = (
                round(score_delta_total / attempts_count, 2) if attempts_count else 0.0
            )
            attack_points.append(
                {
                    "attack_type": current_attack,
                    "attempts": attempts_count,
                    "correct": correct_count,
                    "accuracy": accuracy,
                    "score_delta_total": score_delta_total,
                    "average_score_delta": average_score_delta,
                }
            )

        return {
            "session_id": session_id,
            "total_attempts": len(attempts),
            "by_day": day_points,
            "by_attack": attack_points,
        }
    finally:
        db.close()
