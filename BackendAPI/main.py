from __future__ import annotations

from typing import cast
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from scenario_library import ALL_ATTACK_TYPES, get_scenario_template
from scenario_models import AttackType, DifficultyLevel, ScenarioOption, ScenarioRule

app = FastAPI(title="CyberSecurity Training API", version="0.2.0")

# Keep CORS open for local MVP development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DIFFICULTY_ORDER: tuple[DifficultyLevel, ...] = ("easy", "medium", "hard")
RISKY_OPTION_IDS = {"click", "tap", "share", "share_code", "share_partial", "comply", "follow"}


class AttackProgress(BaseModel):
    attempts: int = 0
    correct: int = 0


class SessionProgress(BaseModel):
    total_score: int = 0
    total_attempts: int = 0
    total_correct: int = 0
    correct_streak: int = 0
    incorrect_streak: int = 0
    by_attack: dict[AttackType, AttackProgress] = Field(
        default_factory=lambda: {attack: AttackProgress() for attack in ALL_ATTACK_TYPES}
    )


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


class NextScenarioRecommendation(BaseModel):
    attack_type: AttackType
    difficulty: DifficultyLevel
    reason: str


scenario_contexts: dict[str, ScenarioContext] = {}
session_progress: dict[str, SessionProgress] = {}


class GenerateScenarioRequest(BaseModel):
    attack_type: AttackType = "phishing"
    difficulty: DifficultyLevel = "easy"
    session_id: str | None = None


class GenerateScenarioResponse(BaseModel):
    session_id: str
    scenario_id: str
    attack_type: str
    difficulty: str
    channel: str
    attacker_message: str
    options: list[ScenarioOption]
    red_flags: list[str]


class EvaluateScenarioRequest(BaseModel):
    scenario_id: str = Field(..., min_length=1)
    selected_option_id: str = Field(..., min_length=1)


class EvaluateScenarioResponse(BaseModel):
    is_correct: bool
    score_delta: int
    explanation: str
    session_stats: SessionStatsResponse
    recommendation: NextScenarioRecommendation


def get_or_create_session(current_session_id: str) -> SessionProgress:
    if current_session_id not in session_progress:
        session_progress[current_session_id] = SessionProgress()
    return session_progress[current_session_id]


def calculate_score_delta(is_correct: bool, selected_option_id: str) -> int:
    if is_correct:
        return 10
    if selected_option_id in RISKY_OPTION_IDS:
        return -5
    return 0


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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/scenario/generate", response_model=GenerateScenarioResponse)
def generate_scenario(payload: GenerateScenarioRequest) -> GenerateScenarioResponse:
    session_id = payload.session_id or str(uuid4())
    get_or_create_session(session_id)

    scenario_id = str(uuid4())
    template = get_scenario_template(payload.attack_type, payload.difficulty)

    scenario_contexts[scenario_id] = ScenarioContext(
        session_id=session_id,
        attack_type=payload.attack_type,
        difficulty=payload.difficulty,
        rule=template.rule,
    )

    return GenerateScenarioResponse(
        session_id=session_id,
        scenario_id=scenario_id,
        attack_type=payload.attack_type,
        difficulty=payload.difficulty,
        channel=template.channel,
        attacker_message=template.attacker_message,
        options=template.options,
        red_flags=template.red_flags,
    )


@app.post("/scenario/evaluate", response_model=EvaluateScenarioResponse)
def evaluate_scenario(payload: EvaluateScenarioRequest) -> EvaluateScenarioResponse:
    scenario_context = scenario_contexts.get(payload.scenario_id)

    if scenario_context is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    progress = get_or_create_session(scenario_context.session_id)

    is_correct = payload.selected_option_id == scenario_context.rule.correct_option_id
    score_delta = calculate_score_delta(is_correct, payload.selected_option_id)

    progress.total_attempts += 1
    progress.total_score += score_delta

    current_attack_progress = progress.by_attack[scenario_context.attack_type]
    current_attack_progress.attempts += 1

    if is_correct:
        progress.total_correct += 1
        progress.correct_streak += 1
        progress.incorrect_streak = 0
        current_attack_progress.correct += 1
        explanation = scenario_context.rule.correct_explanation
    else:
        progress.incorrect_streak += 1
        progress.correct_streak = 0
        explanation = scenario_context.rule.incorrect_explanation

    session_stats = build_session_stats(progress)
    recommendation = build_recommendation(
        progress,
        scenario_context.attack_type,
        scenario_context.difficulty,
    )

    return EvaluateScenarioResponse(
        is_correct=is_correct,
        score_delta=score_delta,
        explanation=explanation,
        session_stats=session_stats,
        recommendation=recommendation,
    )
