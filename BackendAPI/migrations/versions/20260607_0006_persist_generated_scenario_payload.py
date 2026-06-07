"""persist generated scenario payload

Revision ID: 20260607_0006
Revises: 20260515_0005
Create Date: 2026-06-07 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260607_0006"
down_revision = "20260515_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("scenario_attempts", sa.Column("template_id", sa.String(length=128), nullable=True))
    op.add_column("scenario_attempts", sa.Column("channel", sa.String(length=32), nullable=True))
    op.add_column("scenario_attempts", sa.Column("attacker_message", sa.Text(), nullable=True))
    op.add_column("scenario_attempts", sa.Column("options_json", sa.Text(), nullable=True))
    op.add_column("scenario_attempts", sa.Column("red_flags_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("scenario_attempts", "red_flags_json")
    op.drop_column("scenario_attempts", "options_json")
    op.drop_column("scenario_attempts", "attacker_message")
    op.drop_column("scenario_attempts", "channel")
    op.drop_column("scenario_attempts", "template_id")
