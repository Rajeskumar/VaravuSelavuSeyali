"""expense_items.original_price

Revision ID: 8e1f1b7751c5
Revises: e7f7da5c52f6
Create Date: 2026-11-26 12:00:00.000000

TS-FIX-102: a receipt line keeps its price before discount. line_total becomes the paid price and
discount a record only. Nullable with no backfill: NULL marks a line saved in the old format
(line_total before discount), which the app converts when the receipt is shown or edited.
Old code ignores the column, so rolling the app back needs no downgrade.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8e1f1b7751c5'
down_revision: Union[str, None] = 'e7f7da5c52f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'expense_items',
        sa.Column('original_price', sa.Numeric(precision=12, scale=2), nullable=True),
        schema='trackspense',
    )


def downgrade() -> None:
    op.drop_column('expense_items', 'original_price', schema='trackspense')
