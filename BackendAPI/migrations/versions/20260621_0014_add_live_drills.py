"""add live drills

Revision ID: 20260621_0014
Revises: 20260620_0013
Create Date: 2026-06-21 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260621_0014"
down_revision = "20260620_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "live_drills",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(length=64), sa.ForeignKey("training_sessions.session_id"), nullable=False),
        sa.Column("scenario_id", sa.String(length=64), nullable=False),
        sa.Column("delivery_channel", sa.String(length=16), nullable=False, server_default="email"),
        sa.Column("recipient", sa.String(length=254), nullable=False),
        sa.Column("subject", sa.String(length=180), nullable=False),
        sa.Column("tracking_token", sa.String(length=96), nullable=False, unique=True),
        sa.Column("tracking_url", sa.Text(), nullable=False),
        sa.Column("delivery_status", sa.String(length=24), nullable=False, server_default="dry_run"),
        sa.Column("delivery_error", sa.Text(), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_live_drills_user_id", "live_drills", ["user_id"])
    op.create_index("ix_live_drills_session_id", "live_drills", ["session_id"])
    op.create_index("ix_live_drills_scenario_id", "live_drills", ["scenario_id"])
    op.create_index("ix_live_drills_tracking_token", "live_drills", ["tracking_token"])
    op.create_index("ix_live_drills_created_at", "live_drills", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_live_drills_created_at", table_name="live_drills")
    op.drop_index("ix_live_drills_tracking_token", table_name="live_drills")
    op.drop_index("ix_live_drills_scenario_id", table_name="live_drills")
    op.drop_index("ix_live_drills_session_id", table_name="live_drills")
    op.drop_index("ix_live_drills_user_id", table_name="live_drills")
    op.drop_table("live_drills")
