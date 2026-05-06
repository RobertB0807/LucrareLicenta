from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

AttackType = Literal["phishing", "smishing", "impersonation"]
DifficultyLevel = Literal["easy", "medium", "hard"]


class ScenarioOption(BaseModel):
    id: str
    text: str


class ScenarioRule(BaseModel):
    correct_option_id: str
    correct_explanation: str
    incorrect_explanation: str


class ScenarioTemplate(BaseModel):
    channel: str
    attacker_message: str
    options: list[ScenarioOption]
    red_flags: list[str]
    rule: ScenarioRule
