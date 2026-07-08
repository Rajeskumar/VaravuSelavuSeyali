"""Groups Phase 3: notification prefs, comments, settle-by-expense, payment
handles, FX rate support

Revision ID: 66285244529e
Revises: eb058f5aab6d
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = '66285244529e'
down_revision: Union[str, None] = 'eb058f5aab6d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # TS-GRP-130: payment deep-link handles on the user's own profile
    op.add_column('users', sa.Column('venmo_handle', sa.String(100), nullable=True), schema='trackspense')
    op.add_column('users', sa.Column('paypal_handle', sa.String(100), nullable=True), schema='trackspense')
    op.add_column('users', sa.Column('upi_id', sa.String(100), nullable=True), schema='trackspense')

    # TS-GRP-131: FX rate snapshot on the expense + a daily rate cache table
    op.add_column('expenses', sa.Column('fx_rate_to_group_currency', sa.Numeric(12, 6), nullable=True), schema='trackspense')
    op.create_table(
        'fx_rates',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('rate_date', sa.Date(), nullable=False),
        sa.Column('from_currency', sa.String(10), nullable=False),
        sa.Column('to_currency', sa.String(10), nullable=False),
        sa.Column('rate', sa.Numeric(18, 8), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('rate_date', 'from_currency', 'to_currency', name='uq_fx_rates_date_pair'),
        schema='trackspense',
    )
    op.create_index('ix_trackspense_fx_rates_rate_date', 'fx_rates', ['rate_date'], schema='trackspense')

    # TS-GRP-129: settle-by-expense linkage
    op.add_column(
        'expense_splits',
        sa.Column('settled_via_settlement_id', UUID(as_uuid=True), nullable=True),
        schema='trackspense',
    )
    op.create_foreign_key(
        'fk_expense_splits_settled_via_settlement',
        'expense_splits', 'settlements',
        ['settled_via_settlement_id'], ['id'],
        source_schema='trackspense', referent_schema='trackspense',
        ondelete='SET NULL',
    )

    # TS-GRP-125: notification preferences
    op.create_table(
        'group_notification_preferences',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_email', sa.String(255), sa.ForeignKey('trackspense.users.email', ondelete='CASCADE'), nullable=False),
        sa.Column('group_id', UUID(as_uuid=True), sa.ForeignKey('trackspense.groups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('muted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('muted_events', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('user_email', 'group_id', name='uq_group_notif_prefs_user_group'),
        schema='trackspense',
    )
    op.create_index(
        'ix_trackspense_group_notification_preferences_user_email',
        'group_notification_preferences', ['user_email'], schema='trackspense',
    )
    op.create_index(
        'ix_trackspense_group_notification_preferences_group_id',
        'group_notification_preferences', ['group_id'], schema='trackspense',
    )

    # TS-GRP-126: expense comments
    op.create_table(
        'expense_comments',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('expense_id', UUID(as_uuid=True), sa.ForeignKey('trackspense.expenses.id', ondelete='CASCADE'), nullable=False),
        sa.Column('member_id', UUID(as_uuid=True), sa.ForeignKey('trackspense.group_members.id', ondelete='CASCADE'), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True),
        schema='trackspense',
    )
    op.create_index('ix_trackspense_expense_comments_expense_id', 'expense_comments', ['expense_id'], schema='trackspense')


def downgrade() -> None:
    op.drop_index('ix_trackspense_expense_comments_expense_id', table_name='expense_comments', schema='trackspense')
    op.drop_table('expense_comments', schema='trackspense')

    op.drop_index('ix_trackspense_group_notification_preferences_group_id', table_name='group_notification_preferences', schema='trackspense')
    op.drop_index('ix_trackspense_group_notification_preferences_user_email', table_name='group_notification_preferences', schema='trackspense')
    op.drop_table('group_notification_preferences', schema='trackspense')

    op.drop_constraint('fk_expense_splits_settled_via_settlement', 'expense_splits', schema='trackspense', type_='foreignkey')
    op.drop_column('expense_splits', 'settled_via_settlement_id', schema='trackspense')

    op.drop_index('ix_trackspense_fx_rates_rate_date', table_name='fx_rates', schema='trackspense')
    op.drop_table('fx_rates', schema='trackspense')
    op.drop_column('expenses', 'fx_rate_to_group_currency', schema='trackspense')

    op.drop_column('users', 'upi_id', schema='trackspense')
    op.drop_column('users', 'paypal_handle', schema='trackspense')
    op.drop_column('users', 'venmo_handle', schema='trackspense')
