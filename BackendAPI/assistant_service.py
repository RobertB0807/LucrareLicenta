from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Any, Literal

from llm_service import generate_llm_assistant
from scenario_models import AttackType, DifficultyLevel

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AssistantAnswer:
    answer: str
    quick_tips: list[str]
    safety_status: Literal["answered", "refused"]
    content_source: Literal["ollama", "rule_based"]
    llm_model: str | None
    generation_ms: int | None
    fallback_reason: str | None


def _difficulty_label(difficulty: DifficultyLevel | None) -> str | None:
    if difficulty is None:
        return None
    labels: dict[DifficultyLevel, str] = {
        "easy": "ușor",
        "medium": "mediu",
        "hard": "greu",
    }
    return labels[difficulty]


def _contains_any(text: str, words: tuple[str, ...]) -> bool:
    return any(word in text for word in words)


def _is_unsafe_request(message: str) -> bool:
    normalized = message.casefold()
    unsafe_phrases = (
        "fur parola",
        "fur parole",
        "steal password",
        "build a phishing page",
        "create a phishing page",
        "construiesc o pagină de phishing",
        "construiesc o pagina de phishing",
        "creează malware",
        "creeaza malware",
        "create malware",
        "build malware",
        "scrie un keylogger",
        "write a keylogger",
        "build a keylogger",
        "bypass mfa",
        "ocolesc mfa",
        "evit detectarea",
        "evade detection",
        "fără să fiu detectat",
        "fara sa fiu detectat",
        "mă dau drept",
        "ma dau drept",
    )
    return _contains_any(normalized, unsafe_phrases)


def _is_simple_greeting(message: str) -> bool:
    normalized = message.casefold().strip()
    normalized = normalized.strip(" .,!?:;-_")
    return normalized in {
        "salut",
        "buna",
        "bună",
        "hello",
        "hi",
        "hey",
        "hei",
        "ceau",
        "ciao",
    }


def _build_greeting_answer() -> tuple[str, list[str]]:
    return (
        "Salut! Sunt Sentinel, asistentul tău pentru antrenament împotriva atacurilor "
        "de inginerie socială. Te pot ajuta să recunoști phishing, smishing, apeluri "
        "suspecte, pagini false și cereri de impersonare.",
        [
            "Îmi poți trimite un mesaj suspect și îl analizăm împreună.",
            "Îți pot explica red flags pentru email, SMS sau apeluri.",
            "Îți pot recomanda ce să exersezi în funcție de progres.",
        ],
    )


def build_assistant_answer(
    *,
    message: str,
    attack_type: AttackType | None = None,
    difficulty: DifficultyLevel | None = None,
) -> tuple[str, list[str]]:
    normalized = message.lower()
    inferred_attack_type = attack_type

    if inferred_attack_type is None:
        if _contains_any(normalized, ("sms", "smishing", "mesaj text")):
            inferred_attack_type = "smishing"
        elif _contains_any(normalized, ("apel", "telefon", "vishing", "imperson")):
            inferred_attack_type = "impersonation"
        elif _contains_any(normalized, ("email", "mail", "phishing")):
            inferred_attack_type = "phishing"

    if inferred_attack_type == "smishing":
        answer = (
            "La SMS-uri suspecte, tratează orice urgență ca risc. Nu accesa link-ul din mesaj; "
            "verifică direct în aplicația oficială a instituției."
        )
        quick_tips = [
            "Nu deschide link-uri din SMS-uri urgente.",
            "Verifică numărul și limbajul mesajului (greșeli, presiune, amenințări).",
            "Confirmă situația în aplicația oficială sau la numărul public al instituției.",
        ]
    elif inferred_attack_type == "impersonation":
        answer = (
            "La apeluri sau mesaje de impersonare, validează identitatea printr-un canal separat "
            "înainte să oferi orice informație."
        )
        quick_tips = [
            "Nu comunica parole, coduri MFA sau date bancare la telefon.",
            "Închide conversația și sună înapoi la un număr oficial.",
            "Raportează imediat tentativa dacă solicitarea pare urgentă și neobișnuită.",
        ]
    else:
        answer = (
            "Pentru emailuri de phishing, semnalele-cheie sunt urgența artificială, link-urile "
            "suspecte și cererile de date sensibile."
        )
        quick_tips = [
            "Verifică domeniul expeditorului, nu doar numele afișat.",
            "Nu deschide atașamente neașteptate și nu activa macro-uri.",
            "Accesează conturile doar din aplicația sau site-ul oficial, nu din link-ul primit.",
        ]

    difficulty_context = _difficulty_label(difficulty)
    if difficulty_context:
        answer = f"{answer} Recomandare pentru nivel {difficulty_context}: exersează scenarii similare până menții decizii corecte consecutive."

    return answer, quick_tips


def answer_assistant(
    *,
    message: str,
    history: list[dict[str, str]] | None = None,
    attack_type: AttackType | None = None,
    difficulty: DifficultyLevel | None = None,
    context_title: str | None = None,
    context_summary: str | None = None,
    learning_context: dict[str, Any] | None = None,
    scenario_context: dict[str, Any] | None = None,
) -> AssistantAnswer:
    if _is_unsafe_request(message):
        return AssistantAnswer(
            answer=(
                "Nu pot ajuta la construirea sau ascunderea unui atac. Pot însă explica "
                "modul în care o astfel de tentativă este detectată, raportată și prevenită."
            ),
            quick_tips=[
                "Folosește doar medii de laborator și date fictive pentru exerciții.",
                "Concentrează testarea pe detectare, raportare și reducerea impactului.",
                "Nu colecta parole, coduri MFA sau alte date reale ale utilizatorilor.",
            ],
            safety_status="refused",
            content_source="rule_based",
            llm_model=None,
            generation_ms=None,
            fallback_reason="unsafe_request",
        )

    if _is_simple_greeting(message):
        answer, quick_tips = _build_greeting_answer()
        return AssistantAnswer(
            answer=answer,
            quick_tips=quick_tips,
            safety_status="answered",
            content_source="rule_based",
            llm_model=None,
            generation_ms=None,
            fallback_reason="small_talk",
        )

    generated = generate_llm_assistant(
        message=message,
        history=history,
        attack_type=attack_type,
        difficulty=difficulty,
        context_title=context_title,
        context_summary=context_summary,
        learning_context=learning_context,
        scenario_context=scenario_context,
    )
    if generated.output is not None:
        return AssistantAnswer(
            answer=generated.output.answer,
            quick_tips=generated.output.quick_tips,
            safety_status=generated.output.safety_status,
            content_source="ollama",
            llm_model=generated.model,
            generation_ms=generated.generation_ms,
            fallback_reason=None,
        )

    answer, quick_tips = build_assistant_answer(
        message=message,
        attack_type=attack_type,
        difficulty=difficulty,
    )
    logger.warning(
        "Assistant used deterministic fallback",
        extra={
            "event": "assistant_fallback",
            "fallback_reason": generated.fallback_reason,
            "llm_model": generated.model,
            "generation_ms": generated.generation_ms,
        },
    )
    return AssistantAnswer(
        answer=answer,
        quick_tips=quick_tips,
        safety_status="answered",
        content_source="rule_based",
        llm_model=generated.model,
        generation_ms=generated.generation_ms,
        fallback_reason=generated.fallback_reason,
    )
