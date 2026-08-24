"""add custom cards

Revision ID: 81c6ede153d2
Revises: 609704f8daf2
Create Date: 2026-08-21 09:00:00.000000

TS-CARD-112: user-added custom cards, per the Card Coach spec's follow-up decision to let users
track cards outside the curated catalog. Reuses card_catalog/card_earning_rules rather than a
parallel schema — `created_by_user_email` NULL means a curated/admin-sourced row (all rows
before this migration); non-null means one user's private, self-reported card. This keeps
CardRewardsEngine, CardService.get_engine_ready_held_cards, and every existing query path working
unchanged — a custom card is just a card_catalog row once it exists. Callers that must not leak
one user's custom card to another (catalog search, "optimal in catalog") filter on this column.

source_url/last_verified_at become nullable — a self-reported card has no issuer source to cite.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '81c6ede153d2'
down_revision: Union[str, None] = '609704f8daf2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'card_catalog',
        sa.Column('created_by_user_email', sa.String(length=255), nullable=True),
        schema='trackspense',
    )
    op.create_foreign_key(
        'card_catalog_created_by_user_email_fkey',
        'card_catalog', 'users',
        ['created_by_user_email'], ['email'],
        source_schema='trackspense', referent_schema='trackspense',
        ondelete='CASCADE',
    )
    op.create_index(
        op.f('ix_trackspense_card_catalog_created_by_user_email'),
        'card_catalog', ['created_by_user_email'], unique=False, schema='trackspense',
    )
    op.alter_column('card_catalog', 'source_url', existing_type=sa.String(length=500), nullable=True, schema='trackspense')
    op.alter_column('card_catalog', 'last_verified_at', existing_type=sa.DateTime(timezone=True), nullable=True, schema='trackspense')


def downgrade() -> None:
    op.alter_column('card_catalog', 'last_verified_at', existing_type=sa.DateTime(timezone=True), nullable=False, schema='trackspense')
    op.alter_column('card_catalog', 'source_url', existing_type=sa.String(length=500), nullable=False, schema='trackspense')
    op.drop_index(op.f('ix_trackspense_card_catalog_created_by_user_email'), table_name='card_catalog', schema='trackspense')
    op.drop_constraint('card_catalog_created_by_user_email_fkey', 'card_catalog', schema='trackspense', type_='foreignkey')
    op.drop_column('card_catalog', 'created_by_user_email', schema='trackspense')
