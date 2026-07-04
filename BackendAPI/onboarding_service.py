from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from persistence_repository import complete_user_onboarding, fetch_user_by_id
from scenario_models import AttackType, DifficultyLevel

OnboardingExperience = Literal["beginner", "intermediate", "advanced"]
LearningGoal = Literal["personal_safety", "workplace", "general_knowledge"]
AssessmentLevel = Literal["beginner", "intermediate", "advanced"]
AnswerId = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=64),
]


class OnboardingOptionResponse(BaseModel):
    id: str
    text: str


class OnboardingQuestionResponse(BaseModel):
    id: str
    attack_type: AttackType
    channel: str
    prompt: str
    options: list[OnboardingOptionResponse]


class OnboardingStatusResponse(BaseModel):
    completed: bool
    experience: OnboardingExperience | None = None
    learning_goal: LearningGoal | None = None
    assessment_score: int | None = None
    assessment_level: AssessmentLevel | None = None
    questions: list[OnboardingQuestionResponse]


class OnboardingAnswerRequest(BaseModel):
    question_id: AnswerId
    selected_option_id: AnswerId


class OnboardingCompleteRequest(BaseModel):
    experience: OnboardingExperience
    learning_goal: LearningGoal
    answers: list[OnboardingAnswerRequest] = Field(min_length=3, max_length=3)


class OnboardingRecommendationResponse(BaseModel):
    attack_type: AttackType
    difficulty: DifficultyLevel
    reason: str


class OnboardingCompleteResponse(BaseModel):
    onboarding_completed: bool
    experience: OnboardingExperience
    learning_goal: LearningGoal
    score: int
    total_questions: int
    assessment_level: AssessmentLevel
    recommendation: OnboardingRecommendationResponse


ASSESSMENT_QUESTIONS: tuple[dict[str, object], ...] = (
    {
        "id": "knowledge-confidence",
        "attack_type": "phishing",
        "channel": "profil",
        "prompt": (
            "Cât de familiar ești cu atacuri precum phishing, mesaje false sau impersonare?"
        ),
        "options": (
            {"id": "new_to_security", "text": "Sunt nou în domeniu și vreau explicații de la zero."},
            {"id": "know_basics", "text": "Cunosc câteva semnale, dar nu sunt mereu sigur."},
            {
                "id": "confident",
                "text": "Am cunoștințe bune și vreau cazuri mai dificile.",
            },
        ),
        "level_points": {
            "new_to_security": 0,
            "know_basics": 1,
            "confident": 2,
        },
    },
    {
        "id": "real-world-exposure",
        "attack_type": "smishing",
        "channel": "profil",
        "prompt": (
            "Cât de des ai analizat sau raportat până acum mesaje suspecte?"
        ),
        "options": (
            {"id": "never", "text": "Aproape niciodată; de obicei nu știu ce să verific."},
            {"id": "sometimes", "text": "Uneori verific expeditorul, linkul sau contextul."},
            {
                "id": "often",
                "text": "Fac asta des și pot explica de ce un mesaj este suspect.",
            },
        ),
        "level_points": {
            "never": 0,
            "sometimes": 1,
            "often": 2,
        },
    },
    {
        "id": "training-pace",
        "attack_type": "impersonation",
        "channel": "profil",
        "prompt": (
            "Cum vrei să înceapă antrenamentul tău?"
        ),
        "options": (
            {"id": "guided", "text": "Cu pași ghidați, exemple simple și multe explicații."},
            {"id": "balanced", "text": "Cu un mix între lecții scurte și scenarii realiste."},
            {
                "id": "challenge",
                "text": "Cu provocări mai grele și feedback direct.",
            },
        ),
        "level_points": {
            "guided": 0,
            "balanced": 1,
            "challenge": 2,
        },
    },
)


def _public_questions() -> list[OnboardingQuestionResponse]:
    return [
        OnboardingQuestionResponse(
            id=str(question["id"]),
            attack_type=question["attack_type"],  # type: ignore[arg-type]
            channel=str(question["channel"]),
            prompt=str(question["prompt"]),
            options=[
                OnboardingOptionResponse.model_validate(option)
                for option in question["options"]  # type: ignore[union-attr]
            ],
        )
        for question in ASSESSMENT_QUESTIONS
    ]


def get_onboarding_status(user_id: str) -> OnboardingStatusResponse:
    user = fetch_user_by_id(user_id)
    if user is None:
        raise ValueError("User not found")

    completed = bool(user.get("onboarding_completed", False))
    return OnboardingStatusResponse(
        completed=completed,
        experience=user.get("onboarding_experience"),
        learning_goal=user.get("learning_goal"),
        assessment_score=user.get("assessment_score"),
        assessment_level=user.get("assessment_level"),
        questions=[] if completed else _public_questions(),
    )


EXPERIENCE_POINTS: dict[OnboardingExperience, int] = {
    "beginner": 0,
    "intermediate": 1,
    "advanced": 2,
}


def _assessment_level(score: int) -> AssessmentLevel:
    if score >= 6:
        return "advanced"
    if score >= 3:
        return "intermediate"
    return "beginner"


def _recommended_attack(
    *,
    level: AssessmentLevel,
    learning_goal: LearningGoal,
) -> AttackType:
    if learning_goal == "workplace":
        return "impersonation"
    if learning_goal == "personal_safety":
        return "smishing"
    if level == "advanced":
        return "impersonation"
    return "phishing"


def complete_onboarding(
    user_id: str,
    payload: OnboardingCompleteRequest,
) -> OnboardingCompleteResponse:
    question_map = {
        str(question["id"]): question
        for question in ASSESSMENT_QUESTIONS
    }
    submitted_ids = [answer.question_id for answer in payload.answers]
    if len(set(submitted_ids)) != len(submitted_ids):
        raise ValueError("Each assessment question must be answered once")
    if set(submitted_ids) != set(question_map):
        raise ValueError("All assessment questions must be answered")

    outcomes: list[dict[str, object]] = []
    score = EXPERIENCE_POINTS[payload.experience]
    for answer in payload.answers:
        question = question_map[answer.question_id]
        valid_option_ids = {
            str(option["id"])
            for option in question["options"]  # type: ignore[union-attr]
        }
        if answer.selected_option_id not in valid_option_ids:
            raise ValueError("Selected option does not belong to the question")

        level_points = question["level_points"]  # type: ignore[index]
        selected_points = int(level_points[answer.selected_option_id])  # type: ignore[index]
        attack_type: AttackType = question["attack_type"]  # type: ignore[assignment]
        score += selected_points
        outcomes.append(
            {
                "attack_type": attack_type,
                "is_correct": selected_points > 0,
            }
        )

    level = _assessment_level(score)
    difficulty: DifficultyLevel = {
        "beginner": "easy",
        "intermediate": "medium",
        "advanced": "hard",
    }[level]  # type: ignore[assignment]
    for outcome in outcomes:
        outcome["difficulty"] = difficulty

    recommendation_attack = _recommended_attack(
        level=level,
        learning_goal=payload.learning_goal,
    )
    complete_user_onboarding(
        user_id=user_id,
        experience=payload.experience,
        learning_goal=payload.learning_goal,
        assessment_score=score,
        assessment_level=level,
        outcomes=outcomes,
    )

    if level == "advanced":
        reason = "Profilul tău indică o bază solidă, așa că începem cu provocări mai complexe."
    elif level == "intermediate":
        reason = "Ai deja o bază; începem cu exerciții medii și consolidăm zonele importante."
    else:
        reason = "Începem ghidat, cu lecții de bază și scenarii ușoare înainte de niveluri mai grele."

    return OnboardingCompleteResponse(
        onboarding_completed=True,
        experience=payload.experience,
        learning_goal=payload.learning_goal,
        score=score,
        total_questions=len(ASSESSMENT_QUESTIONS),
        assessment_level=level,
        recommendation=OnboardingRecommendationResponse(
            attack_type=recommendation_attack,
            difficulty=difficulty,
            reason=reason,
        ),
    )
