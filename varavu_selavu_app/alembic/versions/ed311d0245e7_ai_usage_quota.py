"""ai_usage_quota

Revision ID: ed311d0245e7
Revises: 04112bc85473
Create Date: 2026-09-26 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ed311d0245e7'
down_revision: Union[str, None] = '04112bc85473'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('ai_access', sa.String(length=20), nullable=False, server_default='default'),
        schema='trackspense',
    )
    op.add_column(
        'users',
        sa.Column('ai_limits_override', sa.JSON(), nullable=True),
        schema='trackspense',
    )

    op.create_table(
        'ai_usage_daily',
        sa.Column('user_email', sa.String(length=255), nullable=False),
        sa.Column('feature', sa.String(length=20), nullable=False),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('input_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('output_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('est_cost_usd', sa.Numeric(precision=12, scale=6), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['user_email'], ['trackspense.users.email'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_email', 'feature', 'day'),
        schema='trackspense',
    )
    # The global spend cap sums est_cost_usd across all users for one day.
    op.create_index('ix_trackspense_ai_usage_daily_day', 'ai_usage_daily', ['day'], unique=False, schema='trackspense')


def downgrade() -> None:
    op.drop_index('ix_trackspense_ai_usage_daily_day', table_name='ai_usage_daily', schema='trackspense')
    op.drop_table('ai_usage_daily', schema='trackspense')
    op.drop_column('users', 'ai_limits_override', schema='trackspense')
    op.drop_column('users', 'ai_access', schema='trackspense')
