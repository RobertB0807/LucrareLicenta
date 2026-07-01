from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from learning_path_service import (
    LearningPathLockedError,
    LearningPathResponse,
    build_learning_path,
)
from persistence_repository import (
    fetch_learning_lesson,
    fetch_learning_lessons,
    fetch_learning_quiz_attempts,
    fetch_user_by_id,
    fetch_user_learning_profiles,
    record_learning_quiz_attempt,
)
from scenario_models import AttackType, DifficultyLevel

LessonLevel = Literal["beginner", "intermediate", "advanced"]
LessonStatus = Literal["locked", "available", "in_progress", "completed"]
ContentId = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$",
    ),
]


class LearningLessonSummaryResponse(BaseModel):
    id: str
    category: str
    title: str
    summary: str
    duration_minutes: int
    level: LessonLevel
    attack_type: AttackType | None
    difficulty: DifficultyLevel
    pass_score: int
    xp_reward: int
    attempts: int
    best_score: int | None
    passed: bool
    status: LessonStatus
    recommended: bool = False
    recommendation_reason: str | None = None


class LearningLessonCategoryResponse(BaseModel):
    name: str
    total: int
    completed: int
    in_progress: int = 0
    available: int = 0
    locked: int = 0
    recommended: int
    progress_percent: int = 0
    next_lesson_id: str | None = None
    next_lesson_title: str | None = None
    next_action_label: str | None = None


class LearningLessonCatalogResponse(BaseModel):
    user_level: LessonLevel
    learning_goal: str | None
    recommended_lesson_ids: list[str]
    categories: list[LearningLessonCategoryResponse]
    items: list[LearningLessonSummaryResponse]


class LearningLessonSectionResponse(BaseModel):
    id: str
    title: str
    body: str
    order_index: int


class LearningQuizOptionResponse(BaseModel):
    id: str
    text: str
    order_index: int


class LearningQuizQuestionResponse(BaseModel):
    id: str
    prompt: str
    order_index: int
    options: list[LearningQuizOptionResponse]


class LearningLessonDetailResponse(LearningLessonSummaryResponse):
    sections: list[LearningLessonSectionResponse]
    questions: list[LearningQuizQuestionResponse]


class LearningQuizAnswerRequest(BaseModel):
    question_id: ContentId
    selected_option_id: ContentId


class LearningQuizSubmitRequest(BaseModel):
    answers: list[LearningQuizAnswerRequest] = Field(min_length=1, max_length=20)


class LearningQuizAnswerResultResponse(BaseModel):
    question_id: str
    selected_option_id: str
    correct_option_id: str
    is_correct: bool
    explanation: str


class LearningQuizSubmitResponse(BaseModel):
    attempt_id: str
    lesson_id: str
    score: int
    correct_answers: int
    total_questions: int
    passed: bool
    pass_score: int
    xp_awarded: int
    lesson_completed: bool
    was_already_completed: bool
    answers: list[LearningQuizAnswerResultResponse]
    created_at: str
    path: LearningPathResponse


class LearningQuizAttemptSummaryResponse(BaseModel):
    attempt_id: str
    lesson_id: str
    score: int
    correct_answers: int
    total_questions: int
    passed: bool
    xp_awarded: int
    created_at: str


class LearningQuizAttemptsResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[LearningQuizAttemptSummaryResponse]


def _lesson_status_map(user_id: str) -> dict[str, LessonStatus]:
    path = build_learning_path(user_id)
    return {
        step.lesson_id: step.status
        for module in path.modules
        for step in module.steps
        if step.lesson_id is not None
    }


LEVEL_ORDER: dict[str, int] = {
    "beginner": 0,
    "intermediate": 1,
    "advanced": 2,
}

GOAL_CATEGORY_PRIORITY: dict[str, tuple[str, ...]] = {
    "personal_safety": ("Smishing", "Siguranța contului", "Escrocherii web"),
    "workplace": ("Vishing", "Phishing", "Fundamente"),
    "general_knowledge": ("Fundamente", "Phishing", "Siguranța contului"),
}


def _user_learning_context(user_id: str) -> tuple[LessonLevel, str | None, set[str]]:
    user = fetch_user_by_id(user_id) or {}
    raw_level = user.get("assessment_level") or user.get("onboarding_experience") or "beginner"
    user_level: LessonLevel = (
        raw_level if raw_level in LEVEL_ORDER else "beginner"
    )  # type: ignore[assignment]
    learning_goal = user.get("learning_goal")

    weak_attacks: set[str] = set()
    for row in fetch_user_learning_profiles(user_id):
        attempts = int(row.get("attempts", 0))
        mastery = float(row.get("mastery_score", 100.0))
        accuracy = float(row.get("accuracy", 100.0))
        if attempts > 0 and (mastery < 65 or accuracy < 65):
            weak_attacks.add(str(row.get("attack_type")))

    return user_level, str(learning_goal) if learning_goal else None, weak_attacks


def _recommend_lessons(
    lessons: list[dict[str, object]],
    *,
    user_level: LessonLevel,
    learning_goal: str | None,
    weak_attacks: set[str],
) -> dict[str, str]:
    goal_categories = GOAL_CATEGORY_PRIORITY.get(learning_goal or "", ())
    user_level_index = LEVEL_ORDER[user_level]
    ranked: list[tuple[int, int, str, str]] = []

    for lesson in lessons:
        if bool(lesson["passed"]):
            continue

        lesson_level = str(lesson["level"])
        level_index = LEVEL_ORDER.get(lesson_level, 0)
        level_distance = abs(level_index - user_level_index)
        score = 100 - (level_distance * 24)
        reason = "Potrivit pentru nivelul tău din onboarding."

        if int(lesson["attempts"]) > 0:
            score += 45
            reason = "Continuă lecția începută și treci pragul quiz-ului."
        elif lesson_level == user_level:
            score += 25
            reason = "Recomandată pentru nivelul tău actual."

        if str(lesson["category"]) in goal_categories:
            score += 18
            reason = "Potrivită obiectivului ales la onboarding."

        attack_type = lesson.get("attack_type")
        if attack_type and str(attack_type) in weak_attacks:
            score += 30
            reason = "Întărește o zonă unde scenariile au arătat risc mai mare."

        if str(lesson["status"]) == "locked":
            score -= 80

        ranked.append((score, -int(lesson["order_index"]), str(lesson["id"]), reason))

    ranked.sort(reverse=True)
    return {lesson_id: reason for _, _, lesson_id, reason in ranked[:4]}


def _build_categories(
    items: list[LearningLessonSummaryResponse],
) -> list[LearningLessonCategoryResponse]:
    by_category: dict[str, dict[str, object]] = {}
    for item in items:
        row = by_category.setdefault(
            item.category,
            {
                "total": 0,
                "completed": 0,
                "in_progress": 0,
                "available": 0,
                "locked": 0,
                "recommended": 0,
                "next_lesson_id": None,
                "next_lesson_title": None,
                "next_action_label": None,
            },
        )
        row["total"] = int(row["total"]) + 1
        row["completed"] = int(row["completed"]) + int(item.status == "completed")
        row["in_progress"] = int(row["in_progress"]) + int(item.status == "in_progress")
        row["available"] = int(row["available"]) + int(item.status in {"available", "in_progress"})
        row["locked"] = int(row["locked"]) + int(item.status == "locked")
        row["recommended"] = int(row["recommended"]) + int(item.recommended)

        if row["next_lesson_id"] is None and item.status != "completed":
            row["next_lesson_id"] = item.id
            row["next_lesson_title"] = item.title
            if item.status == "locked":
                row["next_action_label"] = "Blocat momentan"
            elif item.status == "in_progress":
                row["next_action_label"] = "Continuă lecția"
            else:
                row["next_action_label"] = "Începe lecția"

    return [
        LearningLessonCategoryResponse(
            name=name,
            progress_percent=round(
                (int(values["completed"]) / int(values["total"])) * 100
            )
            if int(values["total"])
            else 0,
            **values,
        )
        for name, values in sorted(
            by_category.items(),
            key=lambda pair: (-int(pair[1]["recommended"]), pair[0]),
        )
    ]


def get_learning_lessons(user_id: str) -> LearningLessonCatalogResponse:
    status_map = _lesson_status_map(user_id)
    raw_lessons = fetch_learning_lessons(user_id)
    for lesson in raw_lessons:
        status = status_map.get(lesson["id"])
        if status is None:
            if lesson["passed"]:
                status = "completed"
            elif lesson["attempts"] > 0:
                status = "in_progress"
            else:
                status = "available"
        elif status == "available" and lesson["attempts"] > 0:
            status = "in_progress"
        lesson["status"] = status

    user_level, learning_goal, weak_attacks = _user_learning_context(user_id)
    recommendations = _recommend_lessons(
        raw_lessons,
        user_level=user_level,
        learning_goal=learning_goal,
        weak_attacks=weak_attacks,
    )

    items = [
        LearningLessonSummaryResponse(
            **lesson,
            recommended=lesson["id"] in recommendations,
            recommendation_reason=recommendations.get(str(lesson["id"])),
        )
        for lesson in sorted(
            raw_lessons,
            key=lambda item: (
                item["id"] not in recommendations,
                item["status"] == "locked",
                LEVEL_ORDER.get(str(item["level"]), 0),
                int(item["order_index"]),
            ),
        )
    ]
    return LearningLessonCatalogResponse(
        user_level=user_level,
        learning_goal=learning_goal,
        recommended_lesson_ids=list(recommendations.keys()),
        categories=_build_categories(items),
        items=items,
    )


def get_learning_lesson(user_id: str, lesson_id: str) -> LearningLessonDetailResponse:
    lesson = fetch_learning_lesson(lesson_id, user_id)
    if lesson is None:
        raise ValueError("Unknown lesson")

    status = _lesson_status_map(user_id).get(lesson_id)
    if status == "locked":
        raise LearningPathLockedError("Lesson is locked")
    if status is None:
        if lesson["passed"]:
            status = "completed"
        elif lesson["attempts"] > 0:
            status = "in_progress"
        else:
            status = "available"
    elif status == "available" and lesson["attempts"] > 0:
        status = "in_progress"
    return LearningLessonDetailResponse(**lesson, status=status)


def submit_learning_quiz(
    user_id: str,
    lesson_id: str,
    payload: LearningQuizSubmitRequest,
) -> LearningQuizSubmitResponse:
    get_learning_lesson(user_id, lesson_id)
    result = record_learning_quiz_attempt(
        user_id=user_id,
        lesson_id=lesson_id,
        answers=[answer.model_dump() for answer in payload.answers],
    )
    return LearningQuizSubmitResponse(
        **result,
        path=build_learning_path(user_id),
    )


def get_learning_quiz_attempts(
    user_id: str,
    *,
    lesson_id: str | None,
    limit: int,
    offset: int,
) -> LearningQuizAttemptsResponse:
    if lesson_id is not None and fetch_learning_lesson(lesson_id, user_id) is None:
        raise ValueError("Unknown lesson")
    return LearningQuizAttemptsResponse.model_validate(
        fetch_learning_quiz_attempts(
            user_id,
            lesson_id=lesson_id,
            limit=limit,
            offset=offset,
        )
    )
