"""add_refresh_tokens

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'refresh_tokens',
        sa.Column('jti', sa.UUID(), nullable=False),
        sa.Column('family_id', sa.UUID(), nullable=False),
        sa.Column('user_email', sa.String(length=255), nullable=False),
        sa.Column('issued_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_reason', sa.String(length=20), nullable=True),
        sa.Column('replaced_by', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['user_email'], ['trackspense.users.email'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('jti'),
        schema='trackspense',
    )
    op.create_index(op.f('ix_trackspense_refresh_tokens_family_id'), 'refresh_tokens', ['family_id'], unique=False, schema='trackspense')
    op.create_index(op.f('ix_trackspense_refresh_tokens_user_email'), 'refresh_tokens', ['user_email'], unique=False, schema='trackspense')
    op.create_index(op.f('ix_trackspense_refresh_tokens_expires_at'), 'refresh_tokens', ['expires_at'], unique=False, schema='trackspense')


def downgrade() -> None:
    op.drop_index(op.f('ix_trackspense_refresh_tokens_expires_at'), table_name='refresh_tokens', schema='trackspense')
    op.drop_index(op.f('ix_trackspense_refresh_tokens_user_email'), table_name='refresh_tokens', schema='trackspense')
    op.drop_index(op.f('ix_trackspense_refresh_tokens_family_id'), table_name='refresh_tokens', schema='trackspense')
    op.drop_table('refresh_tokens', schema='trackspense')
