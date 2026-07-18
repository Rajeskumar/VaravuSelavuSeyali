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
    # TS-GRP-130: payment deep-link handles (client-constructed URLs only —
    # TrackSpense never touches money or these providers' APIs).
    venmo_handle = Column(String(100))
    paypal_handle = Column(String(100))
    upi_id = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="SET NULL"), index=True)
    group_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.groups.id", ondelete="SET NULL"), index=True)
    split_type = Column(String(20))
    # TS-GRP-131: FX rate at creation time (expense.currency -> group.currency),
    # snapshotted once and never recomputed retroactively. NULL = same currency.
    fx_rate_to_group_currency = Column(Numeric(12, 6), nullable=True)
    purchased_at = Column(DateTime(timezone=True), index=True)
    merchant_name = Column(String(255))
    # TS-ENT-106: canonical merchant this expense resolved to (NULL until the
    # resolution pipeline links it). merchant_name remains the raw as-entered
    # string, kept forever for audit/dedup — see docs/features/smart_entity.
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.canonical_merchants.id", ondelete="SET NULL"), nullable=True)
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
    # TS-ANL-201: dual-write column, populated alongside normalized_name going
    # forward (see InsightsAggregationService) — no read path uses this yet.
    # See docs/features/smart_entity for the cutover plan.
    canonical_item_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.canonical_items.id", ondelete="CASCADE"), nullable=True, index=True)
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
    # TS-ANL-201: dual-write column, populated alongside merchant_name going
    # forward (see InsightsAggregationService) — no read path uses this yet.
    canonical_merchant_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.canonical_merchants.id", ondelete="CASCADE"), nullable=True, index=True)
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
    # TS-GRP-129: set when this specific share has been settled via
    # POST /.../settle_share. ON DELETE SET NULL so undoing the settlement
    # (DELETE /settlements/{id}) reverts the split to unsettled.
    settled_via_settlement_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.settlements.id", ondelete="SET NULL"), nullable=True)

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


class GroupNotificationPreference(Base):
    """TS-GRP-125: per-(user, group) mute + per-event-type suppression list."""
    __tablename__ = "group_notification_preferences"
    __table_args__ = (
        UniqueConstraint("user_email", "group_id", name="uq_group_notif_prefs_user_group"),
        {"schema": "trackspense"}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=False, index=True)
    group_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.groups.id", ondelete="CASCADE"), nullable=False, index=True)
    muted = Column(Boolean, nullable=False, default=False)
    muted_events = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ExpenseComment(Base):
    """TS-GRP-126: flat, chronological comments per group expense (Splitwise-style, not threaded)."""
    __tablename__ = "expense_comments"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    expense_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.expenses.id", ondelete="CASCADE"), nullable=False, index=True)
    member_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.group_members.id", ondelete="CASCADE"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    edited_at = Column(DateTime(timezone=True), nullable=True)


class CanonicalMerchant(Base):
    """TS-ENT-101: one master record per real merchant. `user_email` NULL means a
    global/curated (seed dictionary) row, shared read-only across all users —
    otherwise it's scoped to the one user who created it (spec §17.1)."""
    __tablename__ = "canonical_merchants"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=True, index=True)
    canonical_name = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=False)
    default_category_id = Column(String(100))
    is_global = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class CanonicalItem(Base):
    """TS-ENT-101: one master record per real product, store-agnostic."""
    __tablename__ = "canonical_items"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=True, index=True)
    canonical_name = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=False)
    brand = Column(String(255))
    default_category_id = Column(String(100))
    unit_type = Column(String(50))
    is_global = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class EntityAlias(Base):
    """TS-ENT-101: every raw variant that maps to a canonical entity — the
    Resolution Pipeline's memory (spec §6.2 tier 2). `entity_id` is a logical FK
    (no DB constraint) to canonical_merchants.id or canonical_items.id depending
    on `entity_type`, since a single FK column can't target two tables."""
    __tablename__ = "entity_aliases"
    __table_args__ = (
        UniqueConstraint("user_email", "entity_type", "raw_key", name="uq_entity_aliases_user_type_rawkey"),
        {"schema": "trackspense"},
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=True, index=True)
    entity_type = Column(String(20), nullable=False)  # 'merchant' | 'item'
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    raw_key = Column(String(255), nullable=False)
    source = Column(String(30), nullable=False)  # 'seed' | 'user_confirm' | 'auto_high' | 'rule' | 'llm' | 'backfill'
    confidence = Column(Numeric(4, 3))
    confirmed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class FxRate(Base):
    """TS-GRP-131: daily-granularity FX rate cache, keyed by (date, from, to)."""
    __tablename__ = "fx_rates"
    __table_args__ = (
        UniqueConstraint("rate_date", "from_currency", "to_currency", name="uq_fx_rates_date_pair"),
        {"schema": "trackspense"}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rate_date = Column(Date, nullable=False, index=True)
    from_currency = Column(String(10), nullable=False)
    to_currency = Column(String(10), nullable=False)
    rate = Column(Numeric(18, 8), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

