"""add learning path progress

Revision ID: 20260608_0007
Revises: 20260607_0006
Create Date: 2026-06-08 16:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260608_0007"
down_revision = "20260607_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_learning_path_progress",
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("completed_lessons_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("xp", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("longest_streak", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_activity_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_learning_path_progress")
