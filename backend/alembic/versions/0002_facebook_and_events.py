"""facebook pages (platform + external_id) and keyword_events

Revision ID: 0002
Revises: 0001

Idempotent on purpose: 0001 builds tables with metadata.create_all(), so a FRESH database
already has this schema when it reaches 0002; an EXISTING database (created by the old 0001)
gets upgraded here. From now on, never edit 0001 and never use create_all in new revisions.
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    cols = {c["name"] for c in insp.get_columns("connected_accounts")}
    if "external_id" not in cols:
        op.add_column("connected_accounts", sa.Column("platform", sa.String(16), nullable=False, server_default="instagram"))
        op.add_column("connected_accounts", sa.Column("external_id", sa.String(64), nullable=True))
        op.execute("UPDATE connected_accounts SET platform = 'instagram', external_id = ig_account_id")
        op.alter_column("connected_accounts", "external_id", existing_type=sa.String(64), nullable=False)
        for ix in insp.get_indexes("connected_accounts"):
            if ix["column_names"] == ["ig_account_id"]:
                op.drop_index(ix["name"], table_name="connected_accounts")
        op.drop_column("connected_accounts", "ig_account_id")
        op.create_index("ix_connected_accounts_external_id", "connected_accounts", ["external_id"])
        op.create_unique_constraint("uq_account_platform_external", "connected_accounts", ["platform", "external_id"])

    if "keyword_events" not in insp.get_table_names():
        op.create_table(
            "keyword_events",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("connected_account_id", sa.String(36), sa.ForeignKey("connected_accounts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("keyword_id", sa.String(36), sa.ForeignKey("keywords.id", ondelete="SET NULL"), nullable=True),
            sa.Column("event_type", sa.String(32), nullable=False),
            sa.Column("external_user_id", sa.String(64), nullable=True),
            sa.Column("comment_id", sa.String(64), nullable=True),
            sa.Column("media_id", sa.String(64), nullable=True),
            sa.Column("meta", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_kwevents_account_time", "keyword_events", ["connected_account_id", "created_at"])
        op.create_index("ix_kwevents_keyword_time", "keyword_events", ["keyword_id", "created_at"])


def downgrade() -> None:
    op.drop_table("keyword_events")
    # Facebook accounts cannot be represented in the old schema.
    op.execute("DELETE FROM connected_accounts WHERE platform <> 'instagram'")
    op.drop_constraint("uq_account_platform_external", "connected_accounts", type_="unique")
    op.drop_index("ix_connected_accounts_external_id", table_name="connected_accounts")
    op.add_column("connected_accounts", sa.Column("ig_account_id", sa.String(64), nullable=True))
    op.execute("UPDATE connected_accounts SET ig_account_id = external_id")
    op.alter_column("connected_accounts", "ig_account_id", existing_type=sa.String(64), nullable=False)
    op.create_index("ix_connected_accounts_ig_account_id", "connected_accounts", ["ig_account_id"], unique=True)
    op.drop_column("connected_accounts", "external_id")
    op.drop_column("connected_accounts", "platform")
