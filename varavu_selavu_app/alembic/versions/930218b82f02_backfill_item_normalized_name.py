"""backfill expense_items.normalized_name

Revision ID: 930218b82f02
Revises: b7c4e2a91d05
Create Date: 2026-10-05 12:00:00.000000

Receipt items saved without a normalized_name were invisible to month-scoped item insights
(the Items tab filters on it). New writes now default it to item_name; this fills the gap for
rows already saved. Data-only and idempotent; downgrade is a no-op because the old NULLs carried
no information.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '930218b82f02'
down_revision: Union[str, None] = 'b7c4e2a91d05'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE trackspense.expense_items SET normalized_name = item_name "
        "WHERE normalized_name IS NULL OR btrim(normalized_name) = ''"
    )


def downgrade() -> None:
    pass
