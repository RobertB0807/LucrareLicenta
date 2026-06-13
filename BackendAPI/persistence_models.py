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

    sessions: Mapped[list[TrainingSessionORM]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
    )
    mastery_profiles: Mapped[list["UserLearningProfileORM"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    learning_path_progress: Mapped["UserLearningPathProgressORM | None"] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        uselist=False,
    )
    lesson_quiz_attempts: Mapped[list["LearningQuizAttemptORM"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
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


class LearningLessonORM(Base):
    __tablename__ = "learning_lessons"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    category: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str] = mapped_column(Text)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    level: Mapped[str] = mapped_column(String(16), index=True)
    attack_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    difficulty: Mapped[str] = mapped_column(String(16))
    pass_score: Mapped[int] = mapped_column(Integer, default=70)
    xp_reward: Mapped[int] = mapped_column(Integer, default=25)
    order_index: Mapped[int] = mapped_column(Integer, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    sections: Mapped[list["LearningLessonSectionORM"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
        order_by="LearningLessonSectionORM.order_index",
    )
    questions: Mapped[list["LearningQuizQuestionORM"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
        order_by="LearningQuizQuestionORM.order_index",
    )
    attempts: Mapped[list["LearningQuizAttemptORM"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
    )


class LearningLessonSectionORM(Base):
    __tablename__ = "learning_lesson_sections"
    __table_args__ = (
        UniqueConstraint(
            "lesson_id",
            "order_index",
            name="uq_learning_lesson_sections_lesson_order",
        ),
    )

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    lesson_id: Mapped[str] = mapped_column(
        ForeignKey("learning_lessons.id", ondelete="CASCADE"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    order_index: Mapped[int] = mapped_column(Integer)

    lesson: Mapped["LearningLessonORM"] = relationship(back_populates="sections")


class LearningQuizQuestionORM(Base):
    __tablename__ = "learning_quiz_questions"
    __table_args__ = (
        UniqueConstraint(
            "lesson_id",
            "order_index",
            name="uq_learning_quiz_questions_lesson_order",
        ),
    )

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    lesson_id: Mapped[str] = mapped_column(
        ForeignKey("learning_lessons.id", ondelete="CASCADE"),
        index=True,
    )
    prompt: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text)
    order_index: Mapped[int] = mapped_column(Integer)

    lesson: Mapped["LearningLessonORM"] = relationship(back_populates="questions")
    options: Mapped[list["LearningQuizOptionORM"]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="LearningQuizOptionORM.order_index",
    )
    answers: Mapped[list["LearningQuizAnswerORM"]] = relationship(
        back_populates="question",
    )


class LearningQuizOptionORM(Base):
    __tablename__ = "learning_quiz_options"
    __table_args__ = (
        UniqueConstraint(
            "question_id",
            "order_index",
            name="uq_learning_quiz_options_question_order",
        ),
    )

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    question_id: Mapped[str] = mapped_column(
        ForeignKey("learning_quiz_questions.id", ondelete="CASCADE"),
        index=True,
    )
    text: Mapped[str] = mapped_column(Text)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    order_index: Mapped[int] = mapped_column(Integer)

    question: Mapped["LearningQuizQuestionORM"] = relationship(back_populates="options")
    answers: Mapped[list["LearningQuizAnswerORM"]] = relationship(
        back_populates="selected_option",
    )


class LearningQuizAttemptORM(Base):
    __tablename__ = "learning_quiz_attempts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    lesson_id: Mapped[str] = mapped_column(
        ForeignKey("learning_lessons.id", ondelete="CASCADE"),
        index=True,
    )
    score: Mapped[int] = mapped_column(Integer)
    correct_answers: Mapped[int] = mapped_column(Integer)
    total_questions: Mapped[int] = mapped_column(Integer)
    passed: Mapped[bool] = mapped_column(Boolean, index=True)
    xp_awarded: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        index=True,
    )

    user: Mapped["UserORM"] = relationship(back_populates="lesson_quiz_attempts")
    lesson: Mapped["LearningLessonORM"] = relationship(back_populates="attempts")
    answers: Mapped[list["LearningQuizAnswerORM"]] = relationship(
        back_populates="attempt",
        cascade="all, delete-orphan",
    )


class LearningQuizAnswerORM(Base):
    __tablename__ = "learning_quiz_answers"
    __table_args__ = (
        UniqueConstraint(
            "attempt_id",
            "question_id",
            name="uq_learning_quiz_answers_attempt_question",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    attempt_id: Mapped[str] = mapped_column(
        ForeignKey("learning_quiz_attempts.id", ondelete="CASCADE"),
        index=True,
    )
    question_id: Mapped[str] = mapped_column(
        ForeignKey("learning_quiz_questions.id"),
        index=True,
    )
    selected_option_id: Mapped[str] = mapped_column(
        ForeignKey("learning_quiz_options.id"),
    )
    is_correct: Mapped[bool] = mapped_column(Boolean)

    attempt: Mapped["LearningQuizAttemptORM"] = relationship(back_populates="answers")
    question: Mapped["LearningQuizQuestionORM"] = relationship(back_populates="answers")
    selected_option: Mapped["LearningQuizOptionORM"] = relationship(back_populates="answers")


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
