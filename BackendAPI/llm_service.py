from __future__ import annotations

from dataclasses import dataclass
import json
import os
import re
from time import monotonic
from typing import Literal
import unicodedata
from urllib import error, request

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

from scenario_models import AttackType, DifficultyLevel, ScenarioTemplate

DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_OLLAMA_MODEL = "qwen3:8b"
DEFAULT_TIMEOUT_SECONDS = 60.0
ALLOWED_OPTION_IDS = ("comply", "verify", "report")
EXPECTED_CHANNELS: dict[AttackType, set[str]] = {
    "phishing": {"email"},
    "smishing": {"sms"},
    "impersonation": {"chat", "telefon", "apel", "mesagerie"},
}
HOSTNAME_PATTERN = re.compile(
    r"(?i)\b(?:https?://)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:/[^\s]*)?"
)
PLACEHOLDER_PATTERN = re.compile(r"[\[\]{}<>]")
NAME_PLACEHOLDER_PATTERN = re.compile(
    r"(?i)\[(?:nume|nume utilizator|prenume)\]"
)


class LlmScenarioOption(BaseModel):
    id: Literal["comply", "verify", "report"]
    text: str = Field(min_length=8, max_length=240)

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return value.strip()


class LlmScenarioRule(BaseModel):
    correct_option_id: Literal["verify", "report"]
    correct_explanation: str = Field(min_length=30, max_length=600)
    incorrect_explanation: str = Field(min_length=30, max_length=600)

    @field_validator("correct_explanation", "incorrect_explanation")
    @classmethod
    def normalize_explanation(cls, value: str) -> str:
        return value.strip()


class LlmScenarioTemplate(BaseModel):
    channel: str = Field(min_length=2, max_length=32)
    attacker_message: str = Field(min_length=40, max_length=1200)
    options: list[LlmScenarioOption] = Field(min_length=3, max_length=3)
    red_flags: list[str] = Field(min_length=3, max_length=5)
    rule: LlmScenarioRule

    @field_validator("channel")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("attacker_message")
    @classmethod
    def normalize_attacker_message(cls, value: str) -> str:
        normalized = NAME_PLACEHOLDER_PATTERN.sub("utilizatorule", value)
        return normalized.strip()

    @field_validator("red_flags")
    @classmethod
    def validate_red_flags(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        if any(len(value) < 5 or len(value) > 180 for value in normalized):
            raise ValueError("Each red flag must contain between 5 and 180 characters")
        if len(set(normalized)) != len(normalized):
            raise ValueError("Red flags must be unique")
        return normalized

    @model_validator(mode="after")
    def validate_options_and_links(self) -> "LlmScenarioTemplate":
        option_ids = [option.id for option in self.options]
        if tuple(option_ids) != ALLOWED_OPTION_IDS:
            raise ValueError(
                "Options must appear in this order: comply, verify, report"
            )

        for hostname in HOSTNAME_PATTERN.findall(self.attacker_message):
            clean_hostname = re.sub(
                r"(?i)^https?://",
                "",
                hostname.rstrip(".,);]"),
            ).split("/", maxsplit=1)[0]
            if not clean_hostname.lower().endswith(".invalid"):
                raise ValueError(
                    "Generated scenarios may only use reserved .invalid domains"
                )

        return self

    def validate_for_attack(self, attack_type: AttackType) -> None:
        if self.channel.lower() not in EXPECTED_CHANNELS[attack_type]:
            expected = ", ".join(sorted(EXPECTED_CHANNELS[attack_type]))
            raise ValueError(
                f"Channel for {attack_type} must be one of: {expected}"
            )
        if PLACEHOLDER_PATTERN.search(self.attacker_message):
            raise ValueError("Generated attacker message may not contain placeholders")


@dataclass(frozen=True)
class LlmScenarioGeneration:
    template: ScenarioTemplate | None
    model: str | None
    generation_ms: int | None
    fallback_reason: str | None


def _env_flag(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _timeout_seconds() -> float:
    raw_value = os.getenv("LLM_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))
    try:
        return max(1.0, float(raw_value))
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS


def _build_messages(
    attack_type: AttackType,
    difficulty: DifficultyLevel,
    recent_messages: list[str] | None = None,
) -> list[dict[str, str]]:
    channel_instruction = {
        "phishing": "Setează channel exact la email.",
        "smishing": "Setează channel exact la sms.",
        "impersonation": "Setează channel la chat, telefon, apel sau mesagerie.",
    }[attack_type]
    difficulty_instruction = {
        "easy": (
            "Nivel UȘOR: include 3-4 indicii evidente, un pretext comun, formulări suspecte "
            "și o opțiune sigură clar diferențiată. Mesajul trebuie să poată fi recunoscut "
            "de un începător fără cunoștințe tehnice."
        ),
        "medium": (
            "Nivel MEDIU: mesajul trebuie să pară plauzibil și contextual, cu 2-3 indicii "
            "mai discrete. Evită greșelile grosolane; opțiunea riscantă trebuie să pară "
            "tentantă, iar utilizatorul să fie obligat să verifice canalul și contextul."
        ),
        "hard": (
            "Nivel GREU: construiește un mesaj bine redactat, personalizat contextual și "
            "fără semnale evidente. Folosește autoritate, continuitatea unei conversații "
            "sau un proces realist; diferența corectă trebuie să depindă de procedură, "
            "verificare independentă și detalii subtile."
        ),
    }[difficulty]
    system_prompt = (
        "Ești un generator de scenarii educaționale pentru recunoașterea atacurilor "
        "de inginerie socială. Răspunde exclusiv cu JSON valid conform schemei primite. "
        "Scrie toate textele în limba română. Scenariul trebuie să fie realist, dar fictiv, "
        "și să nu includă date personale reale, instrucțiuni operaționale de fraudă sau "
        "domenii web reale. Dacă ai nevoie de un domeniu, folosește exclusiv un domeniu "
        "rezervat care se termină în .invalid. attacker_message trebuie să conțină mesajul "
        "direct primit de utilizator de la atacator, nu o descriere sau explicație a "
        "scenariului. Nu folosi substituenți precum [Nume], [Link], acolade sau paranteze "
        "unghiulare."
    )
    user_prompt = (
        f"Generează un scenariu nou de tip {attack_type}, dificultate {difficulty}. "
        f"{channel_instruction} {difficulty_instruction} "
        "Folosește exact trei opțiuni, în această ordine și cu aceste ID-uri: "
        "comply pentru acțiunea riscantă, verify pentru verificare prin canal oficial, "
        "report pentru raportarea și oprirea interacțiunii. Răspunsul corect trebuie să "
        "fie verify sau report. Include între 3 și 5 semnale de alarmă și explicații "
        "educaționale clare pentru răspuns corect și incorect. Dacă mesajul conține un "
        "link, scrie unul complet precum https://verificare-cont.invalid/login."
    )
    normalized_recent_messages = [
        message.strip()
        for message in (recent_messages or [])
        if message and message.strip()
    ][:4]
    if normalized_recent_messages:
        recent_examples = "\n".join(
            f"- {message[:300]}" for message in normalized_recent_messages
        )
        user_prompt = (
            f"{user_prompt}\nNu repeta și nu parafraza îndeaproape aceste scenarii folosite "
            f"recent în aceeași sesiune:\n{recent_examples}\n"
            "Schimbă organizația invocată, pretextul, acțiunea cerută și semnalele de alarmă."
        )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _normalized_tokens(value: str) -> set[str]:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    without_marks = "".join(
        character for character in normalized if not unicodedata.combining(character)
    )
    return set(re.findall(r"[a-z0-9]{3,}", without_marks))


def _is_too_similar(candidate: str, recent_messages: list[str]) -> bool:
    candidate_tokens = _normalized_tokens(candidate)
    if not candidate_tokens:
        return False

    for recent_message in recent_messages:
        recent_tokens = _normalized_tokens(recent_message)
        if not recent_tokens:
            continue
        overlap = len(candidate_tokens & recent_tokens)
        union = len(candidate_tokens | recent_tokens)
        if union and overlap / union >= 0.72:
            return True
    return False


def generate_llm_scenario(
    attack_type: AttackType,
    difficulty: DifficultyLevel,
    recent_messages: list[str] | None = None,
) -> LlmScenarioGeneration:
    if not _env_flag("LLM_ENABLED"):
        return LlmScenarioGeneration(
            template=None,
            model=None,
            generation_ms=None,
            fallback_reason="llm_disabled",
        )

    provider = os.getenv("LLM_PROVIDER", "ollama").strip().lower()
    if provider != "ollama":
        return LlmScenarioGeneration(
            template=None,
            model=None,
            generation_ms=None,
            fallback_reason="unsupported_provider",
        )

    base_url = os.getenv("OLLAMA_BASE_URL", DEFAULT_OLLAMA_BASE_URL).rstrip("/")
    model = os.getenv("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL).strip()
    if not model:
        return LlmScenarioGeneration(
            template=None,
            model=None,
            generation_ms=None,
            fallback_reason="model_not_configured",
        )

    payload = {
        "model": model,
        "messages": _build_messages(attack_type, difficulty, recent_messages),
        "format": LlmScenarioTemplate.model_json_schema(),
        "stream": False,
        "think": False,
        "options": {"temperature": 0.2},
        "keep_alive": "5m",
    }
    http_request = request.Request(
        f"{base_url}/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started_at = monotonic()

    try:
        with request.urlopen(http_request, timeout=_timeout_seconds()) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        return LlmScenarioGeneration(
            template=None,
            model=model,
            generation_ms=round((monotonic() - started_at) * 1000),
            fallback_reason=f"ollama_http_{exc.code}",
        )
    except (error.URLError, TimeoutError):
        return LlmScenarioGeneration(
            template=None,
            model=model,
            generation_ms=round((monotonic() - started_at) * 1000),
            fallback_reason="ollama_unavailable",
        )
    except (UnicodeDecodeError, json.JSONDecodeError):
        return LlmScenarioGeneration(
            template=None,
            model=model,
            generation_ms=round((monotonic() - started_at) * 1000),
            fallback_reason="invalid_ollama_response",
        )

    generation_ms = round((monotonic() - started_at) * 1000)
    try:
        content = response_payload["message"]["content"]
        validated = LlmScenarioTemplate.model_validate_json(content)
        validated.validate_for_attack(attack_type)
        template = ScenarioTemplate.model_validate(validated.model_dump())
    except (KeyError, TypeError, ValueError, ValidationError, json.JSONDecodeError):
        return LlmScenarioGeneration(
            template=None,
            model=model,
            generation_ms=generation_ms,
            fallback_reason="invalid_scenario_output",
        )

    if _is_too_similar(template.attacker_message, recent_messages or []):
        return LlmScenarioGeneration(
            template=None,
            model=model,
            generation_ms=generation_ms,
            fallback_reason="duplicate_scenario_output",
        )

    return LlmScenarioGeneration(
        template=template,
        model=model,
        generation_ms=generation_ms,
        fallback_reason=None,
    )
