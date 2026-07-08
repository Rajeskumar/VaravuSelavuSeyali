import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Integer, Date, ForeignKey, Text, JSON, UniqueConstraint, CheckConstraint, Boolean, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from varavu_selavu_service.db.session import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255))
    phone = Column(String(50))
    address = Column(String(500))
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="SET NULL"), index=True)
    group_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.groups.id", ondelete="SET NULL"), index=True)
    split_type = Column(String(20))
    purchased_at = Column(DateTime(timezone=True), index=True)
    merchant_name = Column(String(255))
    merchant_id = Column(String(255))
    category_id = Column(String(100), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(10), default="USD")
    tax = Column(Numeric(12, 2), default=0)
    tip = Column(Numeric(12, 2), default=0)
    discount = Column(Numeric(12, 2), default=0)
    payment_method = Column(String(100))
    description = Column(Text)
    notes = Column(Text)
    fingerprint = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ExpenseItem(Base):
    __tablename__ = "expense_items"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    expense_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.expenses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="SET NULL"))
    line_no = Column(Integer, nullable=False)
    item_name = Column(String(255), nullable=False)
    normalized_name = Column(String(255))
    category_id = Column(String(100))
    quantity = Column(Numeric(10, 2))
    unit = Column(String(50))
    unit_price = Column(Numeric(12, 2))
    line_total = Column(Numeric(12, 2), nullable=False)
    tax = Column(Numeric(12, 2), default=0)
    discount = Column(Numeric(12, 2), default=0)
    attributes_json = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RecurringTemplate(Base):
    __tablename__ = "recurring_templates"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)
    merchant_name = Column(String(255))
    day_of_month = Column(Integer, nullable=False)
    default_cost = Column(Numeric(12, 2), nullable=False)
    start_date = Column(Date, nullable=False)
    last_processed_date = Column(Date)
    status = Column(String(50), default="Active")
    group_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.groups.id", ondelete="CASCADE"), nullable=True)
    split_config = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ItemInsight(Base):
    __tablename__ = "item_insights"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=False, index=True)
    normalized_name = Column(String(255), nullable=False, index=True)
    avg_unit_price = Column(Numeric(12, 2))
    min_price = Column(Numeric(12, 2))
    max_price = Column(Numeric(12, 2))
    total_quantity_bought = Column(Numeric(10, 2), default=0)
    total_spent = Column(Numeric(12, 2), default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ItemPriceHistory(Base):
    __tablename__ = "item_price_history"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_insight_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.item_insights.id", ondelete="CASCADE"), nullable=False, index=True)
    expense_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.expenses.id", ondelete="CASCADE"), nullable=False, index=True)
    store_name = Column(String(255))
    date = Column(DateTime(timezone=True), nullable=False, index=True)
    unit_price = Column(Numeric(12, 2), nullable=False)
    quantity = Column(Numeric(10, 2), default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class MerchantInsight(Base):
    __tablename__ = "merchant_insights"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=False, index=True)
    merchant_name = Column(String(255), nullable=False, index=True)
    total_spent = Column(Numeric(12, 2), default=0)
    transaction_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MerchantAggregate(Base):
    __tablename__ = "merchant_aggregates"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    merchant_insight_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.merchant_insights.id", ondelete="CASCADE"), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)
    total_spent = Column(Numeric(12, 2), default=0)
    transaction_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class Group(Base):
    __tablename__ = "groups"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    group_type = Column(String(20), nullable=False, default='other')
    cover = Column(String(50))
    currency = Column(String(10), nullable=False, default='USD')
    simplify_debts = Column(Boolean, nullable=False, default=False)
    default_split_json = Column(JSON)
    created_by = Column(String(255), ForeignKey("trackspense.users.email", ondelete="SET NULL"))
    status = Column(String(20), nullable=False, default='active')
    archived_at = Column(DateTime(timezone=True), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (
        UniqueConstraint("group_id", "user_email", name="uq_group_members_group_user"),
        {"schema": "trackspense"}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.groups.id", ondelete="CASCADE"), nullable=False)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="SET NULL"), index=True)
    display_name = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default='member')
    status = Column(String(20), nullable=False, default='active')
    joined_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class GroupInvitation(Base):
    __tablename__ = "group_invitations"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.groups.id", ondelete="CASCADE"), nullable=False)
    member_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.group_members.id", ondelete="CASCADE"), nullable=False)
    invited_email = Column(String(255))
    token = Column(String(64), unique=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    accepted_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class ExpensePayer(Base):
    __tablename__ = "expense_payers"
    __table_args__ = (
        UniqueConstraint("expense_id", "member_id", name="uq_expense_payers_expense_member"),
        {"schema": "trackspense"}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    expense_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.expenses.id", ondelete="CASCADE"), nullable=False)
    member_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.group_members.id", ondelete="CASCADE"), nullable=False, index=True)
    amount_paid = Column(Numeric(12, 2), nullable=False)

class ExpenseSplit(Base):
    __tablename__ = "expense_splits"
    __table_args__ = (
        UniqueConstraint("expense_id", "member_id", name="uq_expense_splits_expense_member"),
        {"schema": "trackspense"}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    expense_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.expenses.id", ondelete="CASCADE"), nullable=False)
    member_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.group_members.id", ondelete="CASCADE"), nullable=False, index=True)
    amount_owed = Column(Numeric(12, 2), nullable=False)
    basis_type = Column(String(20), nullable=False)
    basis_value = Column(Numeric(12, 4))

class ExpenseItemSplit(Base):
    __tablename__ = "expense_item_splits"
    __table_args__ = (
        UniqueConstraint("expense_item_id", "member_id", name="uq_expense_item_splits_item_member"),
        {"schema": "trackspense"}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    expense_item_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.expense_items.id", ondelete="CASCADE"), nullable=False)
    member_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.group_members.id", ondelete="CASCADE"), nullable=False, index=True)
    ratio = Column(Numeric(7, 4), CheckConstraint("ratio > 0 AND ratio <= 1", name="chk_expense_item_splits_ratio"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)

class Settlement(Base):
    __tablename__ = "settlements"
    __table_args__ = (
        CheckConstraint("from_member_id <> to_member_id", name="chk_settlements_from_neq_to"),
        {"schema": "trackspense"}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.groups.id", ondelete="CASCADE"), nullable=False, index=True)
    from_member_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.group_members.id", ondelete="CASCADE"), nullable=False)
    to_member_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.group_members.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    method = Column(String(50))
    settled_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    notes = Column(Text)
    created_by = Column(String(255), ForeignKey("trackspense.users.email", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class GroupActivity(Base):
    __tablename__ = "group_activity"
    __table_args__ = (
        Index("idx_group_activity_group_id_created", "group_id", "created_at"),
        {"schema": "trackspense"}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.groups.id", ondelete="CASCADE"), nullable=False)
    actor_member_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.group_members.id", ondelete="SET NULL"))
    action = Column(String(50), nullable=False)
    entity_id = Column(UUID(as_uuid=True))
    payload_json = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class DeviceToken(Base):
    __tablename__ = "device_tokens"
    __table_args__ = (
        UniqueConstraint("user_email", "expo_push_token", name="uq_device_tokens_user_token"),
        {"schema": "trackspense"}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=False, index=True)
    expo_push_token = Column(String(255), nullable=False, index=True)
    platform = Column(String(10), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

