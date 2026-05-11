from __future__ import annotations

from scenario_models import AttackType, DifficultyLevel


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
