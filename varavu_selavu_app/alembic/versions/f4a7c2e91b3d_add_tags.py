"""add tags

Revision ID: f4a7c2e91b3d
Revises: e77bb25a3074
Create Date: 2026-08-24 09:00:00.000000

TS-TAG-101: schema for Custom Tags (docs/features/custom_tags/tags-prd-v0.2.0.md §8). No changes
to `expenses` — tags are a separate cross-cutting label, not a column on the expense itself.

`tags.normalized_name` is the dedupe key (PRD §9.1) — enforced by a unique constraint per user,
not a DB-level uniqueness on `name` (a user's original casing is preserved in `name`).
`expense_tags.user_email` is denormalized from `tags.user_email` — see the model docstring in
db/models.py for why this redundancy is deliberate (it's the mechanism enforcing PRD §9.2's
per-tagger privacy guarantee on shared group expenses).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4a7c2e91b3d'
down_revision: Union[str, None] = 'e77bb25a3074'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tags',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_email', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('normalized_name', sa.String(length=50), nullable=False),
        sa.Column('color', sa.String(length=7), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_email'], ['trackspense.users.email'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_email', 'normalized_name', name='uq_tags_user_normalized'),
        schema='trackspense',
    )
    op.create_index(op.f('ix_trackspense_tags_user_email'), 'tags', ['user_email'], unique=False, schema='trackspense')
    op.create_index('idx_tags_user_status', 'tags', ['user_email', 'status'], unique=False, schema='trackspense')

    op.create_table(
        'expense_tags',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tag_id', sa.UUID(), nullable=False),
        sa.Column('expense_id', sa.UUID(), nullable=False),
        sa.Column('user_email', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['tag_id'], ['trackspense.tags.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['expense_id'], ['trackspense.expenses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('tag_id', 'expense_id', name='uq_expense_tags'),
        schema='trackspense',
    )
    op.create_index('idx_expense_tags_expense', 'expense_tags', ['expense_id'], unique=False, schema='trackspense')
    op.create_index('idx_expense_tags_tag', 'expense_tags', ['tag_id'], unique=False, schema='trackspense')
    op.create_index('idx_expense_tags_user', 'expense_tags', ['user_email'], unique=False, schema='trackspense')


def downgrade() -> None:
    op.drop_index('idx_expense_tags_user', table_name='expense_tags', schema='trackspense')
    op.drop_index('idx_expense_tags_tag', table_name='expense_tags', schema='trackspense')
    op.drop_index('idx_expense_tags_expense', table_name='expense_tags', schema='trackspense')
    op.drop_table('expense_tags', schema='trackspense')

    op.drop_index('idx_tags_user_status', table_name='tags', schema='trackspense')
    op.drop_index(op.f('ix_trackspense_tags_user_email'), table_name='tags', schema='trackspense')
    op.drop_table('tags', schema='trackspense')
