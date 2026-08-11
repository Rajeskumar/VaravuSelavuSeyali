"""add_budgets

Revision ID: a1b2c3d4e5f6
Revises: fcc03f738abe
Create Date: 2026-08-04 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'fcc03f738abe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'budgets',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_email', sa.String(length=255), nullable=False),
        sa.Column('scope', sa.String(length=20), nullable=False),
        sa.Column('target_type', sa.String(length=20), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=10), nullable=False),
        sa.Column('period_type', sa.String(length=20), nullable=False),
        sa.Column('rollover', sa.Boolean(), nullable=False),
        sa.Column('alert_thresholds', sa.JSON(), nullable=False),
        sa.Column('muted', sa.Boolean(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_email'], ['trackspense.users.email'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='trackspense',
    )
    op.create_index(op.f('ix_trackspense_budgets_user_email'), 'budgets', ['user_email'], unique=False, schema='trackspense')

    op.create_table(
        'budget_period_snapshots',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('budget_id', sa.UUID(), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('spent', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['budget_id'], ['trackspense.budgets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('budget_id', 'period_start', name='uq_budget_period_snapshots_budget_period'),
        schema='trackspense',
    )
    op.create_index(op.f('ix_trackspense_budget_period_snapshots_budget_id'), 'budget_period_snapshots', ['budget_id'], unique=False, schema='trackspense')


def downgrade() -> None:
    op.drop_index(op.f('ix_trackspense_budget_period_snapshots_budget_id'), table_name='budget_period_snapshots', schema='trackspense')
    op.drop_table('budget_period_snapshots', schema='trackspense')
    op.drop_index(op.f('ix_trackspense_budgets_user_email'), table_name='budgets', schema='trackspense')
    op.drop_table('budgets', schema='trackspense')
