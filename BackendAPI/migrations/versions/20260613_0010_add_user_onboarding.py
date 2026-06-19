"""add user onboarding state

Revision ID: 20260613_0010
Revises: 20260612_0009
Create Date: 2026-06-13 18:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260613_0010"
down_revision = "20260612_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "onboarding_completed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "users",
        sa.Column("onboarding_experience", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("learning_goal", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("assessment_score", sa.Integer(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("assessment_level", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Accounts created before this feature keep their current application flow.
    op.execute(
        sa.text(
            "UPDATE users SET onboarding_completed = :completed"
        ).bindparams(completed=True)
    )


def downgrade() -> None:
    op.drop_column("users", "onboarding_completed_at")
    op.drop_column("users", "assessment_level")
    op.drop_column("users", "assessment_score")
    op.drop_column("users", "learning_goal")
    op.drop_column("users", "onboarding_experience")
    op.drop_column("users", "onboarding_completed")
