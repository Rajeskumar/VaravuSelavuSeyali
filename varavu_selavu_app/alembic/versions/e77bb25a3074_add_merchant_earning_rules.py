"""add merchant earning rules

Revision ID: e77bb25a3074
Revises: 81c6ede153d2
Create Date: 2026-08-22 10:00:00.000000

TS-CARD-113: merchant-specific card earning rules (e.g. Chase Sapphire Preferred's "5% via
Chase Travel," Apple Card's "3% at Apple"), in addition to category rules. A rule is now either
category-scoped (merchant_name NULL, category_id set — all existing rows) or merchant-scoped
(category_id NULL, merchant_name set) — category_id becomes nullable to allow the latter.
CardService/route validation enforces exactly one of the two is set on write; no DB constraint,
matching how category_id validation against the real taxonomy is already enforced in code, not
in the schema.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e77bb25a3074'
down_revision: Union[str, None] = '81c6ede153d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'card_earning_rules',
        sa.Column('merchant_name', sa.String(length=255), nullable=True),
        schema='trackspense',
    )
    op.create_index(
        op.f('ix_trackspense_card_earning_rules_merchant_name'),
        'card_earning_rules', ['merchant_name'], unique=False, schema='trackspense',
    )
    op.alter_column('card_earning_rules', 'category_id', existing_type=sa.String(length=100), nullable=True, schema='trackspense')


def downgrade() -> None:
    op.alter_column('card_earning_rules', 'category_id', existing_type=sa.String(length=100), nullable=False, schema='trackspense')
    op.drop_index(op.f('ix_trackspense_card_earning_rules_merchant_name'), table_name='card_earning_rules', schema='trackspense')
    op.drop_column('card_earning_rules', 'merchant_name', schema='trackspense')
