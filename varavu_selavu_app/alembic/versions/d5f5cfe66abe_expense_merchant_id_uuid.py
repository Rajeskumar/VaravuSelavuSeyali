"""expense merchant_id uuid fk

Revision ID: d5f5cfe66abe
Revises: c5c9d0accc5a
Create Date: 2026-07-17 09:05:00.000000

TS-ENT-106: expenses.merchant_id VARCHAR(255) -> UUID FK to canonical_merchants.
Confirmed dead column pre-migration (no Pydantic model exposes it, no service
ever populates the dict key it's read from — see
repo/postgres_repo.py's now-removed merchant_id pass-through, companion change
in the same PR). Add/backfill-null/drop/rename rather than in-place ALTER TYPE,
per spec §14.2, to avoid lock/coercion issues on a column that (in production)
may carry arbitrary legacy string junk even though it's never read.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd5f5cfe66abe'
down_revision: Union[str, None] = 'c5c9d0accc5a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'expenses',
        sa.Column('merchant_id_uuid', postgresql.UUID(as_uuid=True), nullable=True),
        schema='trackspense',
    )
    # No backfill possible — the old column was never a real FK (arbitrary/empty
    # string junk at best), so every row's new column starts NULL.
    op.drop_column('expenses', 'merchant_id', schema='trackspense')
    op.alter_column('expenses', 'merchant_id_uuid', new_column_name='merchant_id', schema='trackspense')
    op.create_foreign_key(
        'fk_expenses_canon_merchant', 'expenses', 'canonical_merchants',
        ['merchant_id'], ['id'], source_schema='trackspense', referent_schema='trackspense',
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_expenses_canon_merchant', 'expenses', schema='trackspense', type_='foreignkey')
    op.alter_column('expenses', 'merchant_id', new_column_name='merchant_id_uuid', schema='trackspense')
    op.add_column(
        'expenses',
        sa.Column('merchant_id', sa.String(length=255), nullable=True),
        schema='trackspense',
    )
    op.drop_column('expenses', 'merchant_id_uuid', schema='trackspense')
