from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import EmailMessage
import os
import secrets
import smtplib
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field
from sqlalchemy import select

import db as database
from persistence_models import LiveDrillORM, UserORM
from scenario_models import AttackType, DifficultyLevel
from training_service import GenerateScenarioResponse, generate_scenario


LiveDrillDeliveryChannel = Literal["email"]
LiveDrillDeliveryStatus = Literal["sent", "dry_run", "failed"]


class LiveDrillCreateRequest(BaseModel):
    delivery_channel: LiveDrillDeliveryChannel = "email"
    recipient: str | None = Field(default=None, min_length=3, max_length=254)
    dry_run: bool = False
    attack_type: AttackType = "phishing"
    difficulty: DifficultyLevel = "easy"
    session_id: str | None = None
    template_id: str | None = None


class LiveDrillResponse(BaseModel):
    id: str
    session_id: str
    scenario_id: str
    delivery_channel: LiveDrillDeliveryChannel
    recipient: str
    subject: str
    tracking_url: str
    delivery_status: LiveDrillDeliveryStatus
    delivery_error: str | None = None
    opened_at: str | None = None
    reported_at: str | None = None
    created_at: str
    scenario: GenerateScenarioResponse


class LiveDrillSummaryResponse(BaseModel):
    id: str
    session_id: str
    scenario_id: str
    delivery_channel: LiveDrillDeliveryChannel
    recipient: str
    subject: str
    tracking_url: str
    delivery_status: LiveDrillDeliveryStatus
    delivery_error: str | None = None
    opened_at: str | None = None
    reported_at: str | None = None
    created_at: str
    attack_type: AttackType
    difficulty: DifficultyLevel
    red_flags: list[str]


class LiveDrillListResponse(BaseModel):
    items: list[LiveDrillSummaryResponse]


class LiveDrillReportResponse(BaseModel):
    id: str
    scenario_id: str
    session_id: str
    is_correct: bool
    score_delta: int
    explanation: str
    opened_at: str | None
    reported_at: str
    attack_type: AttackType
    difficulty: DifficultyLevel
    red_flags: list[str]


@dataclass(frozen=True)
class EmailDeliveryResult:
    status: LiveDrillDeliveryStatus
    error: str | None = None


def _public_base_url() -> str:
    return os.getenv("LIVE_DRILL_PUBLIC_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


def _smtp_enabled() -> bool:
    raw = os.getenv("LIVE_DRILL_EMAIL_ENABLED")
    if raw is not None:
        return raw.strip().lower() in {"1", "true", "yes", "on"}
    return bool(os.getenv("LIVE_DRILL_SMTP_HOST"))


def _build_subject(attack_type: AttackType, difficulty: DifficultyLevel) -> str:
    labels = {
        "phishing": "Verificare cont",
        "smishing": "Notificare urgentă",
        "impersonation": "Solicitare internă",
    }
    difficulty_label = {"easy": "basic", "medium": "contextual", "hard": "advanced"}[difficulty]
    return f"{labels[attack_type]} - exercițiu {difficulty_label}"


def _build_email_body(scenario: GenerateScenarioResponse, tracking_url: str) -> str:
    return (
        f"{scenario.attacker_message}\n\n"
        f"Link de acțiune: {tracking_url}\n\n"
        "----\n"
        "Acesta este un exercițiu de training generat de CyberSecurity Coach. "
        "Dacă ai ajuns aici în timpul testului, revino în aplicație și analizează semnalele de alarmă."
    )


def _send_email(*, recipient: str, subject: str, body: str) -> EmailDeliveryResult:
    if not _smtp_enabled():
        return EmailDeliveryResult(status="dry_run")

    host = os.getenv("LIVE_DRILL_SMTP_HOST", "").strip()
    port = int(os.getenv("LIVE_DRILL_SMTP_PORT", "587"))
    username = os.getenv("LIVE_DRILL_SMTP_USERNAME", "").strip()
    password = os.getenv("LIVE_DRILL_SMTP_PASSWORD", "")
    sender = os.getenv("LIVE_DRILL_EMAIL_FROM", username or "training@example.invalid").strip()
    use_tls = os.getenv("LIVE_DRILL_SMTP_TLS", "true").strip().lower() in {"1", "true", "yes", "on"}

    if not host:
        return EmailDeliveryResult(status="dry_run")

    message = EmailMessage()
    message["From"] = sender
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)

    try:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            if use_tls:
                smtp.starttls()
            if username:
                smtp.login(username, password)
            smtp.send_message(message)
    except Exception as exc:
        return EmailDeliveryResult(status="failed", error=str(exc)[:500])

    return EmailDeliveryResult(status="sent")


def _serialize_drill(row: LiveDrillORM, scenario: GenerateScenarioResponse) -> LiveDrillResponse:
    return LiveDrillResponse(
        id=row.id,
        session_id=row.session_id,
        scenario_id=row.scenario_id,
        delivery_channel="email",
        recipient=row.recipient,
        subject=row.subject,
        tracking_url=row.tracking_url,
        delivery_status=row.delivery_status,  # type: ignore[arg-type]
        delivery_error=row.delivery_error,
        opened_at=row.opened_at.isoformat() if row.opened_at else None,
        reported_at=row.reported_at.isoformat() if row.reported_at else None,
        created_at=row.created_at.isoformat(),
        scenario=scenario,
    )


def _serialize_drill_summary(row: LiveDrillORM) -> LiveDrillSummaryResponse | None:
    from training_service import get_generated_scenario

    scenario = get_generated_scenario(row.scenario_id)
    if scenario is None:
        return None

    return LiveDrillSummaryResponse(
        id=row.id,
        session_id=row.session_id,
        scenario_id=row.scenario_id,
        delivery_channel="email",
        recipient=row.recipient,
        subject=row.subject,
        tracking_url=row.tracking_url,
        delivery_status=row.delivery_status,  # type: ignore[arg-type]
        delivery_error=row.delivery_error,
        opened_at=row.opened_at.isoformat() if row.opened_at else None,
        reported_at=row.reported_at.isoformat() if row.reported_at else None,
        created_at=row.created_at.isoformat(),
        attack_type=scenario.attack_type,  # type: ignore[arg-type]
        difficulty=scenario.difficulty,  # type: ignore[arg-type]
        red_flags=scenario.red_flags,
    )


def create_live_drill(user_id: str, payload: LiveDrillCreateRequest) -> LiveDrillResponse:
    with database.SessionLocal() as session:
        user = session.get(UserORM, user_id)
        if user is None:
            raise ValueError("User not found")
        recipient = (payload.recipient or user.email).strip().lower()

    scenario = generate_scenario(
        attack_type=payload.attack_type,
        difficulty=payload.difficulty,
        session_id=payload.session_id,
        owner_user_id=user_id,
        template_id=payload.template_id,
    )
    token = secrets.token_urlsafe(32)
    tracking_url = f"{_public_base_url()}/live-drills/track/{token}"
    subject = _build_subject(payload.attack_type, payload.difficulty)
    body = _build_email_body(scenario, tracking_url)
    delivery = (
        EmailDeliveryResult(status="dry_run")
        if payload.dry_run
        else _send_email(recipient=recipient, subject=subject, body=body)
    )

    row = LiveDrillORM(
        id=str(uuid4()),
        user_id=user_id,
        session_id=scenario.session_id,
        scenario_id=scenario.scenario_id,
        delivery_channel=payload.delivery_channel,
        recipient=recipient,
        subject=subject,
        tracking_token=token,
        tracking_url=tracking_url,
        delivery_status=delivery.status,
        delivery_error=delivery.error,
        created_at=datetime.now(timezone.utc),
    )

    with database.SessionLocal() as session:
        session.add(row)
        session.commit()
        session.refresh(row)
        return _serialize_drill(row, scenario)


def mark_live_drill_opened(tracking_token: str) -> LiveDrillORM | None:
    with database.SessionLocal() as session:
        row = session.scalar(select(LiveDrillORM).where(LiveDrillORM.tracking_token == tracking_token))
        if row is None:
            return None
        if row.opened_at is None:
            row.opened_at = datetime.now(timezone.utc)
            session.commit()
            session.refresh(row)
        session.expunge(row)
        return row


def list_recent_live_drills(user_id: str, limit: int = 5) -> LiveDrillListResponse:
    with database.SessionLocal() as session:
        rows = (
            session.scalars(
                select(LiveDrillORM)
                .where(LiveDrillORM.user_id == user_id)
                .order_by(LiveDrillORM.created_at.desc())
                .limit(limit)
            )
            .all()
        )
        for row in rows:
            session.expunge(row)

    items = [item for row in rows if (item := _serialize_drill_summary(row)) is not None]
    return LiveDrillListResponse(items=items)


def report_live_drill(user_id: str, drill_id: str) -> LiveDrillReportResponse:
    from training_service import get_generated_scenario

    with database.SessionLocal() as session:
        row = session.get(LiveDrillORM, drill_id)
        if row is None or row.user_id != user_id:
            raise ValueError("Live drill not found")
        if row.reported_at is None:
            row.reported_at = datetime.now(timezone.utc)
            session.commit()
            session.refresh(row)
        session.expunge(row)

    scenario = get_generated_scenario(row.scenario_id)
    if scenario is None:
        raise ValueError("Scenario not found")

    clicked = row.opened_at is not None
    if clicked:
        score_delta = 0
        explanation = (
            "Ai raportat emailul, dar după ce ai deschis link-ul. Într-un atac real, click-ul poate fi suficient "
            "pentru colectarea datelor sau pentru expunerea dispozitivului. Raportarea este utilă, însă pasul sigur "
            "era să nu accesezi linkul și să verifici mesajul prin canal oficial."
        )
    else:
        score_delta = 10
        explanation = (
            "Ai procedat corect: nu ai deschis link-ul și ai raportat emailul suspect. Aceasta este reacția potrivită "
            "într-un exercițiu live: oprești interacțiunea, păstrezi mesajul ca dovadă și folosești canalul de raportare."
        )

    return LiveDrillReportResponse(
        id=row.id,
        scenario_id=row.scenario_id,
        session_id=row.session_id,
        is_correct=not clicked,
        score_delta=score_delta,
        explanation=explanation,
        opened_at=row.opened_at.isoformat() if row.opened_at else None,
        reported_at=row.reported_at.isoformat() if row.reported_at else datetime.now(timezone.utc).isoformat(),
        attack_type=scenario.attack_type,  # type: ignore[arg-type]
        difficulty=scenario.difficulty,  # type: ignore[arg-type]
        red_flags=scenario.red_flags,
    )
