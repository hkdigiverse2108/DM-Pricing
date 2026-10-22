"""keywords.media_url (the post link a user pasted)

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("keywords")}
    if "media_url" not in cols:  # a fresh DB built by 0001's create_all already has it
        op.add_column("keywords", sa.Column("media_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("keywords", "media_url")
