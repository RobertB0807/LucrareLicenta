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
        "id": "email-urgency",
        "attack_type": "phishing",
        "channel": "email",
        "prompt": (
            "Primești un email care spune că accesul la cont va fi blocat în 15 minute "
            "și îți cere să te autentifici dintr-un link. Ce faci?"
        ),
        "options": (
            {"id": "open_link", "text": "Deschid linkul rapid ca să evit blocarea."},
            {"id": "reply", "text": "Răspund emailului și cer confirmarea."},
            {
                "id": "verify_official",
                "text": "Deschid separat aplicația oficială și raportez mesajul.",
            },
        ),
        "correct_option_id": "verify_official",
    },
    {
        "id": "delivery-sms",
        "attack_type": "smishing",
        "channel": "sms",
        "prompt": (
            "Un SMS despre un colet îți cere o taxă mică printr-un link scurt. "
            "Nu aștepți nicio livrare. Cum reacționezi?"
        ),
        "options": (
            {"id": "pay_fee", "text": "Plătesc taxa, fiind o sumă mică."},
            {"id": "open_tracking", "text": "Deschid linkul doar ca să verific detaliile."},
            {
                "id": "report_sms",
                "text": "Nu folosesc linkul și raportez mesajul ca spam.",
            },
        ),
        "correct_option_id": "report_sms",
    },
    {
        "id": "manager-payment",
        "attack_type": "impersonation",
        "channel": "chat",
        "prompt": (
            "Un presupus manager îți cere urgent, printr-un cont nou, să schimbi "
            "datele unei plăți confidențiale. Care este răspunsul sigur?"
        ),
        "options": (
            {"id": "follow_request", "text": "Execut cererea pentru că pare urgentă."},
            {"id": "ask_details", "text": "Cer mai multe detalii în același chat."},
            {
                "id": "verify_identity",
                "text": "Verific identitatea prin canalul oficial și procedura internă.",
            },
        ),
        "correct_option_id": "verify_identity",
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


def _assessment_level(score: int) -> AssessmentLevel:
    if score >= 3:
        return "advanced"
    if score >= 2:
        return "intermediate"
    return "beginner"


def _recommended_attack(
    *,
    incorrect_attacks: list[AttackType],
    learning_goal: LearningGoal,
) -> AttackType:
    if incorrect_attacks:
        return incorrect_attacks[0]
    if learning_goal == "workplace":
        return "impersonation"
    if learning_goal == "personal_safety":
        return "smishing"
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
    incorrect_attacks: list[AttackType] = []
    score = 0
    for answer in payload.answers:
        question = question_map[answer.question_id]
        valid_option_ids = {
            str(option["id"])
            for option in question["options"]  # type: ignore[union-attr]
        }
        if answer.selected_option_id not in valid_option_ids:
            raise ValueError("Selected option does not belong to the question")

        is_correct = answer.selected_option_id == question["correct_option_id"]
        attack_type: AttackType = question["attack_type"]  # type: ignore[assignment]
        score += int(is_correct)
        if not is_correct:
            incorrect_attacks.append(attack_type)
        outcomes.append(
            {
                "attack_type": attack_type,
                "is_correct": is_correct,
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
        incorrect_attacks=incorrect_attacks,
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

    if incorrect_attacks:
        reason = "Începem cu zona în care evaluarea a identificat cea mai mare nevoie de consolidare."
    elif level == "advanced":
        reason = "Evaluarea indică o bază solidă, așa că începem direct cu un scenariu avansat."
    else:
        reason = "Ai răspuns corect la evaluare; primul scenariu este adaptat obiectivului ales."

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
