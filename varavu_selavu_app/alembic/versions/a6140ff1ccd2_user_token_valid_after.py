"""users.token_valid_after: lets logout/reset/password-change/delete end access tokens early

Revision ID: a6140ff1ccd2
Revises: 930218b82f02
Create Date: 2026-10-06
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a6140ff1ccd2"
down_revision: Union[str, None] = "930218b82f02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("token_valid_after", sa.DateTime(timezone=True), nullable=True),
        schema="trackspense",
    )


def downgrade() -> None:
    op.drop_column("users", "token_valid_after", schema="trackspense")
