"""add users and session ownership

Revision ID: 20260513_0003
Revises: 20260511_0002
Create Date: 2026-05-13 12:40:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260513_0003"
down_revision = "20260511_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("display_name", sa.String(length=64), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.add_column(
        "training_sessions",
        sa.Column("owner_user_id", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_training_sessions_owner_user_id",
        "training_sessions",
        ["owner_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_training_sessions_owner_user_id", table_name="training_sessions")
    op.drop_column("training_sessions", "owner_user_id")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
