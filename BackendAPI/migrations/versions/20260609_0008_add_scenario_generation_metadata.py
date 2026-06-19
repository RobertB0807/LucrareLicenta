"""add scenario generation metadata

Revision ID: 20260609_0008
Revises: 20260608_0007
Create Date: 2026-06-09 12:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260609_0008"
down_revision = "20260608_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "scenario_attempts",
        sa.Column(
            "content_source",
            sa.String(length=16),
            nullable=False,
            server_default="rule_based",
        ),
    )
    op.add_column(
        "scenario_attempts",
        sa.Column("llm_model", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "scenario_attempts",
        sa.Column("generation_ms", sa.Integer(), nullable=True),
    )
    op.add_column(
        "scenario_attempts",
        sa.Column("fallback_reason", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scenario_attempts", "fallback_reason")
    op.drop_column("scenario_attempts", "generation_ms")
    op.drop_column("scenario_attempts", "llm_model")
    op.drop_column("scenario_attempts", "content_source")
