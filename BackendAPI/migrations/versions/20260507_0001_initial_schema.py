"""initial schema

Revision ID: 20260507_0001
Revises:
Create Date: 2026-05-07 11:20:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260507_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "training_sessions",
        sa.Column("session_id", sa.String(length=64), nullable=False),
        sa.Column("total_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_correct", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("correct_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("incorrect_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("per_attack_stats_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("session_id"),
    )

    op.create_table(
        "scenario_attempts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("scenario_id", sa.String(length=64), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=False),
        sa.Column("attack_type", sa.String(length=32), nullable=False),
        sa.Column("difficulty", sa.String(length=16), nullable=False),
        sa.Column("selected_option_id", sa.String(length=64), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.Column("score_delta", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("recommendation_attack_type", sa.String(length=32), nullable=True),
        sa.Column("recommendation_difficulty", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["training_sessions.session_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_scenario_attempts_scenario_id",
        "scenario_attempts",
        ["scenario_id"],
        unique=True,
    )
    op.create_index("ix_scenario_attempts_session_id", "scenario_attempts", ["session_id"], unique=False)

    op.create_table(
        "session_events",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("tone", sa.String(length=16), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["training_sessions.session_id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_session_events_session_id", "session_events", ["session_id"], unique=False)
    op.create_index("ix_session_events_timestamp", "session_events", ["timestamp"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_session_events_timestamp", table_name="session_events")
    op.drop_index("ix_session_events_session_id", table_name="session_events")
    op.drop_table("session_events")

    op.drop_index("ix_scenario_attempts_session_id", table_name="scenario_attempts")
    op.drop_index("ix_scenario_attempts_scenario_id", table_name="scenario_attempts")
    op.drop_table("scenario_attempts")

    op.drop_table("training_sessions")
