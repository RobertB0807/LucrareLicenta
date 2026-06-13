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


class LearningLessonCatalogResponse(BaseModel):
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


def get_learning_lessons(user_id: str) -> LearningLessonCatalogResponse:
    status_map = _lesson_status_map(user_id)
    items = []
    for lesson in fetch_learning_lessons(user_id):
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
        items.append(LearningLessonSummaryResponse(**lesson, status=status))
    return LearningLessonCatalogResponse(items=items)


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
