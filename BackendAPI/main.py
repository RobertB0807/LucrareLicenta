from __future__ import annotations

from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="CyberSecurity Training API", version="0.1.0")

# Keep CORS open for local MVP development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scenario_answers: dict[str, str] = {}


class GenerateScenarioRequest(BaseModel):
    attack_type: Literal["phishing", "smishing", "impersonation"] = "phishing"
    difficulty: Literal["easy", "medium", "hard"] = "easy"


class ScenarioOption(BaseModel):
    id: str
    text: str


class GenerateScenarioResponse(BaseModel):
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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/scenario/generate", response_model=GenerateScenarioResponse)
def generate_scenario(payload: GenerateScenarioRequest) -> GenerateScenarioResponse:
    scenario_id = str(uuid4())

    options = [
        ScenarioOption(id="click", text="Dau click pe link si completez datele cerute."),
        ScenarioOption(id="reply", text="Raspund la mesaj si cer mai multe detalii."),
        ScenarioOption(id="report", text="Nu interactionez cu linkul si raportez mesajul."),
    ]

    scenario_answers[scenario_id] = "report"

    return GenerateScenarioResponse(
        scenario_id=scenario_id,
        attack_type=payload.attack_type,
        difficulty=payload.difficulty,
        channel="email",
        attacker_message=(
            "Subiect: Actiune urgenta: contul tau va fi suspendat in 30 de minute. "
            "Acceseaza imediat secure-banking-check.com pentru verificare."
        ),
        options=options,
        red_flags=[
            "Urgenta artificiala (presiune de timp)",
            "Domeniu suspect, diferit de cel oficial",
            "Solicitare de verificare prin link extern",
        ],
    )


@app.post("/scenario/evaluate", response_model=EvaluateScenarioResponse)
def evaluate_scenario(payload: EvaluateScenarioRequest) -> EvaluateScenarioResponse:
    if payload.scenario_id not in scenario_answers:
        raise HTTPException(status_code=404, detail="Scenario not found")

    correct_option_id = scenario_answers[payload.scenario_id]
    is_correct = payload.selected_option_id == correct_option_id

    if is_correct:
        return EvaluateScenarioResponse(
            is_correct=True,
            score_delta=10,
            explanation=(
                "Corect. Nu ai interactionat cu linkul suspect si ai ales raportarea mesajului."
            ),
        )

    return EvaluateScenarioResponse(
        is_correct=False,
        score_delta=0,
        explanation=(
            "Alegerea nu este sigura. Mesajul foloseste tactici clasice de phishing: urgenta falsa "
            "si link neoficial."
        ),
    )
