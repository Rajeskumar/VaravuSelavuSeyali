"""add_user_cards_is_default

Revision ID: 3eb188c707f9
Revises: b26d9152a1cb
Create Date: 2026-08-17 11:00:00.000000

TS-CARD-104 follow-up: there's no per-expense card tracking, so CardRewardsEngine's "actual
earned" figure (spec §8.3) needs a single held card to attribute all spend to. CardService
enforces exactly one UserCard per user has is_default=True (the first card added becomes
default automatically; adding/marking another one flips the previous default off).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3eb188c707f9'
down_revision: Union[str, None] = 'b26d9152a1cb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'user_cards',
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.false()),
        schema='trackspense',
    )
    op.alter_column('user_cards', 'is_default', server_default=None, schema='trackspense')


def downgrade() -> None:
    op.drop_column('user_cards', 'is_default', schema='trackspense')
