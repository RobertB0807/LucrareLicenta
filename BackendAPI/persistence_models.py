from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TrainingSessionORM(Base):
    __tablename__ = "training_sessions"

    session_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    total_score: Mapped[int] = mapped_column(Integer, default=0)
    total_attempts: Mapped[int] = mapped_column(Integer, default=0)
    total_correct: Mapped[int] = mapped_column(Integer, default=0)
    correct_streak: Mapped[int] = mapped_column(Integer, default=0)
    incorrect_streak: Mapped[int] = mapped_column(Integer, default=0)
    per_attack_stats_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    attempts: Mapped[list["ScenarioAttemptORM"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
    )
    events: Mapped[list["SessionEventORM"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
    )


class ScenarioAttemptORM(Base):
    __tablename__ = "scenario_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scenario_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("training_sessions.session_id"), index=True)
    attack_type: Mapped[str] = mapped_column(String(32))
    difficulty: Mapped[str] = mapped_column(String(16))
    correct_option_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    correct_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    incorrect_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_option_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    score_delta: Mapped[int] = mapped_column(Integer, default=0)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommendation_attack_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    recommendation_difficulty: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    session: Mapped[TrainingSessionORM] = relationship(back_populates="attempts")


class SessionEventORM(Base):
    __tablename__ = "session_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("training_sessions.session_id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    event_type: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(128))
    detail: Mapped[str] = mapped_column(Text)
    tone: Mapped[str] = mapped_column(String(16))

    session: Mapped[TrainingSessionORM] = relationship(back_populates="events")
