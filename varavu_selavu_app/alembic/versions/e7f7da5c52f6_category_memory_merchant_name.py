"""category_memory.merchant_name

Revision ID: e7f7da5c52f6
Revises: 98f3d6b1a740
Create Date: 2026-11-22 12:00:00.000000

Remembers the merchant saved with a categorized expense, so a memory-tier
suggestion from /expenses/categorize fills the merchant as well as the category.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7f7da5c52f6'
down_revision: Union[str, None] = '98f3d6b1a740'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'category_memory',
        sa.Column('merchant_name', sa.String(length=255), nullable=True),
        schema='trackspense',
    )


def downgrade() -> None:
    op.drop_column('category_memory', 'merchant_name', schema='trackspense')
