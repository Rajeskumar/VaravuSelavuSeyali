"""add_email_verification

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-15 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default='true' backfills every pre-existing row as verified (they already
    # proved ownership by using the app before this feature existed) — only new signups
    # from here on start unverified, via the ORM model's Python-side default=False.
    op.add_column(
        'users',
        sa.Column('email_verified', sa.Boolean(), nullable=False, server_default=sa.true()),
        schema='trackspense',
    )

    op.create_table(
        'email_tokens',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_email', sa.String(length=255), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('purpose', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_email'], ['trackspense.users.email'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
        schema='trackspense',
    )
    op.create_index(op.f('ix_trackspense_email_tokens_user_email'), 'email_tokens', ['user_email'], unique=False, schema='trackspense')
    op.create_index(op.f('ix_trackspense_email_tokens_token_hash'), 'email_tokens', ['token_hash'], unique=True, schema='trackspense')


def downgrade() -> None:
    op.drop_index(op.f('ix_trackspense_email_tokens_token_hash'), table_name='email_tokens', schema='trackspense')
    op.drop_index(op.f('ix_trackspense_email_tokens_user_email'), table_name='email_tokens', schema='trackspense')
    op.drop_table('email_tokens', schema='trackspense')
    op.drop_column('users', 'email_verified', schema='trackspense')
