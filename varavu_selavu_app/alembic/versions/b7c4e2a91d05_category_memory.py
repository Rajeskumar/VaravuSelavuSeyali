"""category_memory

Revision ID: b7c4e2a91d05
Revises: ed311d0245e7
Create Date: 2026-09-26 11:30:00.000000

Per-user "you categorized this as X last time" memory, the first tier of the
non-LLM categorizer (services/categorization_service.py).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c4e2a91d05'
down_revision: Union[str, None] = 'ed311d0245e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'category_memory',
        sa.Column('user_email', sa.String(length=255), nullable=False),
        sa.Column('key', sa.String(length=120), nullable=False),
        sa.Column('main_category', sa.String(length=100), nullable=False),
        sa.Column('category_id', sa.String(length=100), nullable=False),
        sa.Column('hits', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_email'], ['trackspense.users.email'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_email', 'key'),
        schema='trackspense',
    )


def downgrade() -> None:
    op.drop_table('category_memory', schema='trackspense')
