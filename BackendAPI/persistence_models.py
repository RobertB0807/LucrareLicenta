from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TrainingSessionORM(Base):
    __tablename__ = "training_sessions"

    session_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
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
    owner: Mapped["UserORM | None"] = relationship(back_populates="sessions")


class UserORM(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    firebase_uid: Mapped[str | None] = mapped_column(String(128), unique=True, index=True, nullable=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    sessions: Mapped[list[TrainingSessionORM]] = relationship(back_populates="owner")
    mastery_profiles: Mapped[list["UserLearningProfileORM"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    learning_path_progress: Mapped["UserLearningPathProgressORM | None"] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )


class UserLearningProfileORM(Base):
    __tablename__ = "user_learning_profiles"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "attack_type",
            "difficulty",
            name="uq_user_learning_profiles_user_attack_difficulty",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    attack_type: Mapped[str] = mapped_column(String(32))
    difficulty: Mapped[str] = mapped_column(String(16))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    correct: Mapped[int] = mapped_column(Integer, default=0)
    mastery_score: Mapped[float] = mapped_column(Float, default=50.0)
    last_result_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    user: Mapped["UserORM"] = relationship(back_populates="mastery_profiles")


class UserLearningPathProgressORM(Base):
    __tablename__ = "user_learning_path_progress"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    completed_lessons_json: Mapped[str] = mapped_column(Text, default="[]")
    xp: Mapped[int] = mapped_column(Integer, default=0)
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_activity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    user: Mapped["UserORM"] = relationship(back_populates="learning_path_progress")


class ScenarioAttemptORM(Base):
    __tablename__ = "scenario_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scenario_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("training_sessions.session_id"), index=True)
    attack_type: Mapped[str] = mapped_column(String(32))
    difficulty: Mapped[str] = mapped_column(String(16))
    template_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    content_source: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="rule_based",
        server_default="rule_based",
    )
    llm_model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    generation_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fallback_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    channel: Mapped[str | None] = mapped_column(String(32), nullable=True)
    attacker_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    options_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    red_flags_json: Mapped[str | None] = mapped_column(Text, nullable=True)
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
