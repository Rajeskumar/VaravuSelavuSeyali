"""Preserve three-decimal receipt quantities."""

from alembic import op
import sqlalchemy as sa

revision = "98f3d6b1a740"
down_revision = "b49a6c2df803"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "expense_items",
        "quantity",
        type_=sa.Numeric(12, 3),
        existing_type=sa.Numeric(10, 2),
        schema="trackspense",
    )


def downgrade():
    op.execute(
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM trackspense.expense_items WHERE quantity != round(quantity,2) OR abs(quantity) >= 100000000) THEN RAISE EXCEPTION 'Quantity downgrade would lose data'; END IF; END $$"
    )
    op.alter_column(
        "expense_items",
        "quantity",
        type_=sa.Numeric(10, 2),
        existing_type=sa.Numeric(12, 3),
        schema="trackspense",
    )
