"""settlements.client_request_id

Revision ID: 9e92415b634b
Revises: 8e1f1b7751c5
Create Date: 2026-11-27 12:00:00.000000

TS-FIX-104: a client-chosen id makes recording a settlement idempotent. Nullable with no backfill; existing rows and
older clients leave it NULL, and NULLs never collide in the unique index. Old code ignores the column, so rolling the
app back needs no downgrade. Run before the backend that writes it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9e92415b634b'
down_revision: Union[str, None] = '8e1f1b7751c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('settlements', sa.Column('client_request_id', sa.String(length=64), nullable=True), schema='trackspense')
    op.create_index('uq_settlements_client_request', 'settlements', ['group_id', 'created_by', 'client_request_id'],
                    unique=True, schema='trackspense')


def downgrade() -> None:
    op.drop_index('uq_settlements_client_request', table_name='settlements', schema='trackspense')
    op.drop_column('settlements', 'client_request_id', schema='trackspense')
