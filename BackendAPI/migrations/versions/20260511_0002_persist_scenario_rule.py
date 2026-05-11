"""persist scenario rule for restart-safe evaluation

Revision ID: 20260511_0002
Revises: 20260507_0001
Create Date: 2026-05-11 10:58:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260511_0002"
down_revision = "20260507_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "scenario_attempts",
        sa.Column("correct_option_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "scenario_attempts",
        sa.Column("correct_explanation", sa.Text(), nullable=True),
    )
    op.add_column(
        "scenario_attempts",
        sa.Column("incorrect_explanation", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scenario_attempts", "incorrect_explanation")
    op.drop_column("scenario_attempts", "correct_explanation")
    op.drop_column("scenario_attempts", "correct_option_id")
