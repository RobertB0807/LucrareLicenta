"""add user learning profiles

Revision ID: 20260514_0004
Revises: 20260513_0003
Create Date: 2026-05-14 10:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260514_0004"
down_revision = "20260513_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_learning_profiles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("attack_type", sa.String(length=32), nullable=False),
        sa.Column("difficulty", sa.String(length=16), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("correct", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("mastery_score", sa.Float(), nullable=False, server_default="50.0"),
        sa.Column("last_result_correct", sa.Boolean(), nullable=True),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "attack_type",
            "difficulty",
            name="uq_user_learning_profiles_user_attack_difficulty",
        ),
    )
    op.create_index("ix_user_learning_profiles_user_id", "user_learning_profiles", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_user_learning_profiles_user_id", table_name="user_learning_profiles")
    op.drop_table("user_learning_profiles")
