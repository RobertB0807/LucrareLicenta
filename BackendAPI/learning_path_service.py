from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel

from persistence_repository import (
    complete_learning_path_lesson,
    fetch_learning_path_progress,
    fetch_user_by_id,
    fetch_user_learning_profiles,
    fetch_user_recent_activity,
    has_passed_learning_lesson_quiz,
)
from scenario_models import AttackType, DifficultyLevel

StepType = Literal["lesson", "scenario"]
StepStatus = Literal["locked", "available", "in_progress", "completed"]
ModuleStatus = Literal["locked", "available", "in_progress", "completed"]


class LearningPathStepResponse(BaseModel):
    id: str
    step_type: StepType
    title: str
    description: str
    status: StepStatus
    progress_current: float
    progress_required: float
    lesson_id: str | None = None
    attack_type: AttackType | None = None
    difficulty: DifficultyLevel | None = None
    mastery_current: float | None = None
    minimum_mastery: float | None = None
    unlock_reason: str | None = None


class LearningPathModuleResponse(BaseModel):
    id: str
    title: str
    description: str
    level: Literal["beginner", "intermediate", "advanced"]
    status: ModuleStatus
    progress_percent: float
    completed_steps: int
    total_steps: int
    unlock_reason: str | None = None
    next_unlock_hint: str | None = None
    steps: list[LearningPathStepResponse]


class LearningPathGoalResponse(BaseModel):
    id: str
    title: str
    detail: str
    current: int
    target: int
    completed: bool


class LearningPathBadgeResponse(BaseModel):
    id: str
    title: str
    description: str
    unlocked: bool


class LearningPathNextActionResponse(BaseModel):
    module_id: str
    step_id: str
    step_type: StepType
    title: str
    lesson_id: str | None = None
    attack_type: AttackType | None = None
    difficulty: DifficultyLevel | None = None


class LearningPathResponse(BaseModel):
    user_id: str
    xp: int
    level: int
    level_progress: int
    level_target: int
    current_streak: int
    longest_streak: int
    completed_modules: int
    total_modules: int
    overall_progress: float
    daily_goal: LearningPathGoalResponse
    weekly_goal: LearningPathGoalResponse
    badges: list[LearningPathBadgeResponse]
    modules: list[LearningPathModuleResponse]
    next_action: LearningPathNextActionResponse | None


class LearningPathLessonCompletionResponse(BaseModel):
    lesson_id: str
    was_already_completed: bool
    path: LearningPathResponse


class LearningPathLockedError(ValueError):
    pass


class LearningAssessmentRequiredError(ValueError):
    pass


CURRICULUM: tuple[dict[str, object], ...] = (
    {
        "id": "foundations",
        "title": "Fundamente de securitate",
        "description": "Recunoaște semnalele de bază și evită reacțiile impulsive.",
        "level": "beginner",
        "steps": (
            {
                "id": "lesson-phishing-101",
                "step_type": "lesson",
                "lesson_id": "phishing-101",
                "title": "Phishing 101",
                "description": "Înțelege urgența, autoritatea și curiozitatea folosite de atacatori.",
            },
            {
                "id": "lesson-reporting-basics",
                "step_type": "lesson",
                "lesson_id": "reporting-basics",
                "title": "Raportare sigură",
                "description": "Învață când și cum raportezi un mesaj suspect fără să crești riscul.",
            },
            {
                "id": "scenario-phishing-easy",
                "step_type": "scenario",
                "attack_type": "phishing",
                "difficulty": "easy",
                "title": "Emailuri suspecte",
                "description": "Finalizează două scenarii și atinge minimum 60 mastery.",
                "required_attempts": 2,
                "minimum_mastery": 60.0,
            },
            {
                "id": "scenario-smishing-easy",
                "step_type": "scenario",
                "attack_type": "smishing",
                "difficulty": "easy",
                "title": "Mesaje SMS suspecte",
                "description": "Finalizează două scenarii și atinge minimum 60 mastery.",
                "required_attempts": 2,
                "minimum_mastery": 60.0,
            },
        ),
    },
    {
        "id": "defender",
        "title": "Apărător digital",
        "description": "Aplică verificări mai stricte pe mai multe canale de atac.",
        "level": "intermediate",
        "steps": (
            {
                "id": "lesson-fake-websites",
                "step_type": "lesson",
                "lesson_id": "fake-websites",
                "title": "Pagini false și typosquatting",
                "description": "Analizează domenii, subdomenii și pagini false de autentificare.",
            },
            {
                "id": "lesson-phishing-attachments",
                "step_type": "lesson",
                "lesson_id": "phishing-attachments",
                "title": "Atașamente suspecte",
                "description": "Recunoaște documente false, macro-uri și cereri de activare periculoase.",
            },
            {
                "id": "lesson-banking-smishing",
                "step_type": "lesson",
                "lesson_id": "banking-smishing",
                "title": "Alerte bancare false",
                "description": "Verifică mesajele bancare fără linkuri și fără coduri trimise mai departe.",
            },
            {
                "id": "lesson-safe-link-checking",
                "step_type": "lesson",
                "lesson_id": "safe-link-checking",
                "title": "Verificarea linkurilor",
                "description": "Citește domenii, subdomenii și linkuri scurtate înainte de a introduce date.",
            },
            {
                "id": "lesson-qr-phishing",
                "step_type": "lesson",
                "lesson_id": "qr-phishing",
                "title": "QR phishing",
                "description": "Analizează linkurile ascunse în coduri QR și pagini mobile false.",
            },
            {
                "id": "scenario-phishing-medium",
                "step_type": "scenario",
                "attack_type": "phishing",
                "difficulty": "medium",
                "title": "Phishing intermediar",
                "description": "Finalizează trei scenarii și atinge minimum 70 mastery.",
                "required_attempts": 3,
                "minimum_mastery": 70.0,
            },
            {
                "id": "scenario-impersonation-medium",
                "step_type": "scenario",
                "attack_type": "impersonation",
                "difficulty": "medium",
                "title": "Impersonare și pretexting",
                "description": "Finalizează trei scenarii și atinge minimum 70 mastery.",
                "required_attempts": 3,
                "minimum_mastery": 70.0,
            },
        ),
    },
    {
        "id": "specialist",
        "title": "Specialist anti-fraudă",
        "description": "Gestionează scenarii avansate, presiune ridicată și identități credibile.",
        "level": "advanced",
        "steps": (
            {
                "id": "lesson-social-engineering-advanced",
                "step_type": "lesson",
                "lesson_id": "social-engineering-advanced",
                "title": "Social engineering avansat",
                "description": "Studiază spear-phishing, BEC și pretexte complexe.",
            },
            {
                "id": "lesson-workplace-impersonation",
                "step_type": "lesson",
                "lesson_id": "workplace-impersonation",
                "title": "Impersonare la locul de muncă",
                "description": "Validează cereri urgente de plată, acces și date sensibile prin proceduri separate.",
            },
            {
                "id": "lesson-account-recovery-abuse",
                "step_type": "lesson",
                "lesson_id": "account-recovery-abuse",
                "title": "Recuperare cont abuzată",
                "description": "Protejează codurile de recuperare, resetările și sesiunile active.",
            },
            {
                "id": "lesson-incident-response-basics",
                "step_type": "lesson",
                "lesson_id": "incident-response-basics",
                "title": "Răspuns după o greșeală",
                "description": "Învață ce faci imediat după click, date introduse sau cod comunicat.",
            },
            {
                "id": "scenario-smishing-hard",
                "step_type": "scenario",
                "attack_type": "smishing",
                "difficulty": "hard",
                "title": "Smishing avansat",
                "description": "Finalizează patru scenarii și atinge minimum 75 mastery.",
                "required_attempts": 4,
                "minimum_mastery": 75.0,
            },
            {
                "id": "scenario-impersonation-hard",
                "step_type": "scenario",
                "attack_type": "impersonation",
                "difficulty": "hard",
                "title": "Impersonare avansată",
                "description": "Finalizează patru scenarii și atinge minimum 75 mastery.",
                "required_attempts": 4,
                "minimum_mastery": 75.0,
            },
        ),
    },
)

LEVEL_ORDER = {
    "beginner": 0,
    "intermediate": 1,
    "advanced": 2,
}


def _build_profile_map(user_id: str) -> dict[tuple[str, str], dict[str, object]]:
    return {
        (str(row["attack_type"]), str(row["difficulty"])): row
        for row in fetch_user_learning_profiles(user_id)
    }


def _build_step(
    definition: dict[str, object],
    *,
    module_unlocked: bool,
    completed_lessons: set[str],
    profile_map: dict[tuple[str, str], dict[str, object]],
) -> LearningPathStepResponse:
    step_type = str(definition["step_type"])
    if step_type == "lesson":
        lesson_id = str(definition["lesson_id"])
        completed = lesson_id in completed_lessons
        status: StepStatus = "completed" if completed else "available" if module_unlocked else "locked"
        return LearningPathStepResponse(
            id=str(definition["id"]),
            step_type="lesson",
            title=str(definition["title"]),
            description=str(definition["description"]),
            status=status,
            progress_current=1 if completed else 0,
            progress_required=1,
            lesson_id=lesson_id,
            unlock_reason=None
            if module_unlocked
            else "Finalizează modulul anterior ca să deblochezi această lecție.",
        )

    attack_type = str(definition["attack_type"])
    difficulty = str(definition["difficulty"])
    required_attempts = int(definition["required_attempts"])
    minimum_mastery = float(definition["minimum_mastery"])
    row = profile_map.get((attack_type, difficulty), {})
    attempts = int(row.get("attempts", 0))
    mastery_score = round(float(row.get("mastery_score", 0.0)), 1)
    completed = attempts >= required_attempts and mastery_score >= minimum_mastery
    if completed:
        status = "completed"
    elif not module_unlocked:
        status = "locked"
    elif attempts > 0:
        status = "in_progress"
    else:
        status = "available"

    return LearningPathStepResponse(
        id=str(definition["id"]),
        step_type="scenario",
        title=str(definition["title"]),
        description=str(definition["description"]),
        status=status,
        progress_current=min(attempts, required_attempts),
        progress_required=required_attempts,
        attack_type=attack_type,  # type: ignore[arg-type]
        difficulty=difficulty,  # type: ignore[arg-type]
        mastery_current=mastery_score,
        minimum_mastery=minimum_mastery,
        unlock_reason=None
        if module_unlocked
        else "Finalizează modulul anterior ca să deblochezi acest scenariu.",
    )


def build_learning_path(user_id: str) -> LearningPathResponse:
    progress = fetch_learning_path_progress(user_id)
    completed_lessons = set(progress["completed_lessons"])
    profile_map = _build_profile_map(user_id)
    user = fetch_user_by_id(user_id) or {}
    raw_user_level = user.get("assessment_level") or user.get("onboarding_experience") or "beginner"
    user_level_index = LEVEL_ORDER.get(str(raw_user_level), 0)
    modules: list[LearningPathModuleResponse] = []
    previous_completed = True

    for definition in CURRICULUM:
        module_level_index = LEVEL_ORDER.get(str(definition["level"]), 0)
        module_unlocked = previous_completed or module_level_index <= user_level_index
        steps = [
            _build_step(
                step,
                module_unlocked=module_unlocked,
                completed_lessons=completed_lessons,
                profile_map=profile_map,
            )
            for step in definition["steps"]  # type: ignore[union-attr]
        ]
        completed_steps = sum(1 for step in steps if step.status == "completed")
        total_steps = len(steps)
        progress_percent = round((completed_steps / total_steps) * 100, 1) if total_steps else 0.0
        if not module_unlocked:
            module_status: ModuleStatus = "locked"
        elif completed_steps == total_steps:
            module_status = "completed"
        elif completed_steps > 0 or any(step.status == "in_progress" for step in steps):
            module_status = "in_progress"
        else:
            module_status = "available"

        next_step = next((step for step in steps if step.status != "completed"), None)
        if not module_unlocked:
            unlock_reason = "Finalizează modulul anterior pentru a deschide acest nivel."
            next_unlock_hint = unlock_reason
        elif next_step is not None:
            unlock_reason = None
            if next_step.status == "locked":
                next_unlock_hint = next_step.unlock_reason
            elif next_step.step_type == "lesson":
                next_unlock_hint = f"Următor: promovează lecția „{next_step.title}”."
            else:
                next_unlock_hint = (
                    f"Următor: rulează {int(next_step.progress_required)} scenarii "
                    f"și atinge mastery {next_step.minimum_mastery or 0:g}."
                )
        else:
            unlock_reason = None
            next_unlock_hint = "Modul finalizat."

        modules.append(
            LearningPathModuleResponse(
                id=str(definition["id"]),
                title=str(definition["title"]),
                description=str(definition["description"]),
                level=definition["level"],  # type: ignore[arg-type]
                status=module_status,
                progress_percent=progress_percent,
                completed_steps=completed_steps,
                total_steps=total_steps,
                unlock_reason=unlock_reason,
                next_unlock_hint=next_unlock_hint,
                steps=steps,
            )
        )
        previous_completed = module_status == "completed"

    completed_modules = sum(1 for module in modules if module.status == "completed")
    total_steps = sum(module.total_steps for module in modules)
    completed_steps = sum(module.completed_steps for module in modules)
    overall_progress = round((completed_steps / total_steps) * 100, 1) if total_steps else 0.0

    now = datetime.now(timezone.utc)
    recent_day = fetch_user_recent_activity(user_id, since=now - timedelta(days=1))
    recent_week = fetch_user_recent_activity(user_id, since=now - timedelta(days=7))
    last_activity_date = progress.get("last_activity_date")
    active_today = last_activity_date == now.date().isoformat()
    daily_current = 1 if active_today or recent_day["attempts"] > 0 else 0
    weekly_current = min(recent_week["attempts"], 5)

    total_attempts = sum(int(row.get("attempts", 0)) for row in profile_map.values())
    total_correct = sum(int(row.get("correct", 0)) for row in profile_map.values())
    overall_accuracy = round((total_correct / total_attempts) * 100, 1) if total_attempts else 0.0
    xp = int(progress["xp"])
    level = (xp // 100) + 1
    level_progress = xp % 100

    badges = [
        LearningPathBadgeResponse(
            id="first-step",
            title="Primul pas",
            description="Finalizează prima activitate.",
            unlocked=xp > 0,
        ),
        LearningPathBadgeResponse(
            id="consistent",
            title="Consecvent",
            description="Menține o serie de 3 zile.",
            unlocked=int(progress["longest_streak"]) >= 3,
        ),
        LearningPathBadgeResponse(
            id="defender",
            title="Apărător",
            description="Finalizează cel puțin 10 scenarii.",
            unlocked=total_attempts >= 10,
        ),
        LearningPathBadgeResponse(
            id="sharp-eye",
            title="Ochi ager",
            description="Menține minimum 75% acuratețe după 8 scenarii.",
            unlocked=total_attempts >= 8 and overall_accuracy >= 75,
        ),
        LearningPathBadgeResponse(
            id="pathfinder",
            title="Pathfinder",
            description="Finalizează primul modul.",
            unlocked=completed_modules >= 1,
        ),
    ]

    next_action: LearningPathNextActionResponse | None = None
    for module in modules:
        if module.status == "locked":
            continue
        candidate = next((step for step in module.steps if step.status != "completed"), None)
        if candidate:
            next_action = LearningPathNextActionResponse(
                module_id=module.id,
                step_id=candidate.id,
                step_type=candidate.step_type,
                title=candidate.title,
                lesson_id=candidate.lesson_id,
                attack_type=candidate.attack_type,
                difficulty=candidate.difficulty,
            )
            break

    return LearningPathResponse(
        user_id=user_id,
        xp=xp,
        level=level,
        level_progress=level_progress,
        level_target=100,
        current_streak=int(progress["current_streak"]),
        longest_streak=int(progress["longest_streak"]),
        completed_modules=completed_modules,
        total_modules=len(modules),
        overall_progress=overall_progress,
        daily_goal=LearningPathGoalResponse(
            id="daily-activity",
            title="Obiectiv zilnic",
            detail="Finalizează o lecție sau un scenariu astăzi.",
            current=daily_current,
            target=1,
            completed=daily_current >= 1,
        ),
        weekly_goal=LearningPathGoalResponse(
            id="weekly-scenarios",
            title="Obiectiv săptămânal",
            detail="Finalizează 5 scenarii în ultimele 7 zile.",
            current=weekly_current,
            target=5,
            completed=weekly_current >= 5,
        ),
        badges=badges,
        modules=modules,
        next_action=next_action,
    )


def complete_lesson(user_id: str, lesson_id: str) -> LearningPathLessonCompletionResponse:
    current_path = build_learning_path(user_id)
    matching_step = next(
        (
            step
            for module in current_path.modules
            for step in module.steps
            if step.lesson_id == lesson_id
        ),
        None,
    )
    if matching_step is None:
        raise ValueError("Unknown learning path lesson")
    if matching_step.status == "locked":
        raise LearningPathLockedError("Lesson is locked")
    if not has_passed_learning_lesson_quiz(user_id, lesson_id):
        raise LearningAssessmentRequiredError(
            "Pass the lesson quiz before completing the lesson"
        )

    result = complete_learning_path_lesson(user_id=user_id, lesson_id=lesson_id)
    return LearningPathLessonCompletionResponse(
        lesson_id=lesson_id,
        was_already_completed=bool(result["was_already_completed"]),
        path=build_learning_path(user_id),
    )
