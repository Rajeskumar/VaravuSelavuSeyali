"""add_card_coach

Revision ID: b26d9152a1cb
Revises: c3d4e5f6a7b8
Create Date: 2026-08-17 10:00:00.000000

TS-CARD-101: schema for Card Coach (docs/features/card_coach/TrackSpense_Card_Rewards_Product_Spec.md).
Schema-only — no data seeded here. The curated card catalog (TS-CARD-102) is populated by a
separate, human-reviewed pass per spec §5, not by this migration.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b26d9152a1cb'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'card_catalog',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('issuer', sa.String(length=255), nullable=False),
        sa.Column('card_name', sa.String(length=255), nullable=False),
        sa.Column('reward_type', sa.String(length=20), nullable=False),
        sa.Column('points_currency_name', sa.String(length=255), nullable=True),
        sa.Column('point_value_estimate_usd', sa.Numeric(precision=6, scale=4), nullable=True),
        sa.Column('annual_fee', sa.Numeric(precision=8, scale=2), nullable=False),
        sa.Column('source_url', sa.String(length=500), nullable=False),
        sa.Column('last_verified_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        schema='trackspense',
    )

    op.create_table(
        'card_earning_rules',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('card_id', sa.UUID(), nullable=False),
        sa.Column('category_id', sa.String(length=100), nullable=False),
        sa.Column('multiplier', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('cap_amount', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('cap_period', sa.String(length=20), nullable=True),
        sa.Column('exclusions_note', sa.Text(), nullable=True),
        sa.Column('rotation_start', sa.Date(), nullable=True),
        sa.Column('rotation_end', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['card_id'], ['trackspense.card_catalog.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='trackspense',
    )
    op.create_index(op.f('ix_trackspense_card_earning_rules_card_id'), 'card_earning_rules', ['card_id'], unique=False, schema='trackspense')

    op.create_table(
        'user_cards',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_email', sa.String(length=255), nullable=False),
        sa.Column('card_id', sa.UUID(), nullable=False),
        sa.Column('added_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_email'], ['trackspense.users.email'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['card_id'], ['trackspense.card_catalog.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='trackspense',
    )
    op.create_index(op.f('ix_trackspense_user_cards_user_email'), 'user_cards', ['user_email'], unique=False, schema='trackspense')
    op.create_index(op.f('ix_trackspense_user_cards_card_id'), 'user_cards', ['card_id'], unique=False, schema='trackspense')

    op.create_table(
        'card_data_corrections',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_email', sa.String(length=255), nullable=False),
        sa.Column('card_id', sa.UUID(), nullable=False),
        sa.Column('note', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_email'], ['trackspense.users.email'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['card_id'], ['trackspense.card_catalog.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='trackspense',
    )
    op.create_index(op.f('ix_trackspense_card_data_corrections_user_email'), 'card_data_corrections', ['user_email'], unique=False, schema='trackspense')
    op.create_index(op.f('ix_trackspense_card_data_corrections_card_id'), 'card_data_corrections', ['card_id'], unique=False, schema='trackspense')


def downgrade() -> None:
    op.drop_index(op.f('ix_trackspense_card_data_corrections_card_id'), table_name='card_data_corrections', schema='trackspense')
    op.drop_index(op.f('ix_trackspense_card_data_corrections_user_email'), table_name='card_data_corrections', schema='trackspense')
    op.drop_table('card_data_corrections', schema='trackspense')

    op.drop_index(op.f('ix_trackspense_user_cards_card_id'), table_name='user_cards', schema='trackspense')
    op.drop_index(op.f('ix_trackspense_user_cards_user_email'), table_name='user_cards', schema='trackspense')
    op.drop_table('user_cards', schema='trackspense')

    op.drop_index(op.f('ix_trackspense_card_earning_rules_card_id'), table_name='card_earning_rules', schema='trackspense')
    op.drop_table('card_earning_rules', schema='trackspense')

    op.drop_table('card_catalog', schema='trackspense')
