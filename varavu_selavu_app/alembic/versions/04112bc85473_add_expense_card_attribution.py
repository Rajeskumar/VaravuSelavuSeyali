"""add expense card attribution

Revision ID: 04112bc85473
Revises: f4a7c2e91b3d
Create Date: 2026-08-24 18:36:37.614103

TS-CARD-114: optional per-expense "which held card did I use" attribution. Autogenerate also
picked up several pre-existing index/constraint drift items unrelated to this change (trigram
indexes and an email_tokens constraint that exist in the DB but aren't modeled in the ORM
metadata) — pruned so this migration only does the one thing its message says.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '04112bc85473'
down_revision: Union[str, None] = 'f4a7c2e91b3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('expenses', sa.Column('card_id', sa.UUID(), nullable=True), schema='trackspense')
    op.create_index(op.f('ix_trackspense_expenses_card_id'), 'expenses', ['card_id'], unique=False, schema='trackspense')
    op.create_foreign_key('expenses_card_id_fkey', 'expenses', 'card_catalog', ['card_id'], ['id'], source_schema='trackspense', referent_schema='trackspense', ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint('expenses_card_id_fkey', 'expenses', schema='trackspense', type_='foreignkey')
    op.drop_index(op.f('ix_trackspense_expenses_card_id'), table_name='expenses', schema='trackspense')
    op.drop_column('expenses', 'card_id', schema='trackspense')
