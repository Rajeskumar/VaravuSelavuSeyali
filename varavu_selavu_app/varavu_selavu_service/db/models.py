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
    # Python-side default (False) applies to every new signup going forward; the migration
    # backfills pre-existing rows to True via a server_default so this doesn't suddenly nag
    # the entire existing user base the day it ships.
    email_verified = Column(Boolean, nullable=False, default=False)


class EmailToken(Base):
    """One-time tokens for email-verification and password-reset links. Only a SHA-256
    hash of the token is stored — the raw token lives solely in the emailed URL, the same
    handling a password gets, since possessing it is equivalent to proving email ownership
    (verify) or authorizing an account takeover (reset)."""

    __tablename__ = "email_tokens"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    purpose = Column(String(20), nullable=False)  # "verify_email" | "reset_password"
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)


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
    # TS-CARD-114: which CardCatalog card was actually used for this expense — optional, set
    # only when the user explicitly picks one of their held cards at add/edit time. NULL means
    # "not attributed"; CardRewardsEngine falls back to the user's default held card for
    # "actual earned" math on unattributed spend rather than requiring this on every expense
    # (spec's original friction concern — see docs/features/card_coach's Add Expense scope
    # note). SET NULL (not CASCADE) on delete: removing a held/custom card must never delete
    # the expense it paid for, it should just drop back to "unattributed".
    card_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.card_catalog.id", ondelete="SET NULL"), nullable=True, index=True)
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


class Budget(Base):
    """TS-BUD-101: a per-user monthly spending limit, overall or per-category, tracked against
    the same unified personal/combined ledger AnalysisService already computes (spec §8) — no
    third calculation path. `category` is null for an overall budget. Dedup on
    (user_email, scope, target_type, category, period_type) is enforced in BudgetService rather
    than a DB constraint, matching RecurringService.upsert_template's find-existing-or-create
    pattern (a plain unique constraint can't dedupe nullable `category` rows portably across
    Postgres and the sqlite test engine)."""
    __tablename__ = "budgets"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=False, index=True)
    scope = Column(String(20), nullable=False, default="personal")  # personal | combined
    target_type = Column(String(20), nullable=False)  # overall | category
    category = Column(String(100), nullable=True)  # null when target_type == overall
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(10), nullable=False, default="USD")
    period_type = Column(String(20), nullable=False, default="monthly")
    rollover = Column(Boolean, nullable=False, default=False)
    alert_thresholds = Column(JSON, nullable=False, default=list)
    muted = Column(Boolean, nullable=False, default=False)
    start_date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)


class BudgetPeriodSnapshot(Base):
    """TS-BUD-101: immutable per-(budget, period) record, written lazily the first time a past
    (already-ended) period is read (BudgetService._get_or_create_snapshot) — no scheduler
    required. Once written, a snapshot is never recomputed, satisfying FR-7/FR-8 ("history for
    past periods is immutable") and surviving budget edits/deletes (soft-deleted budgets keep
    their snapshots for Analysis history)."""
    __tablename__ = "budget_period_snapshots"
    __table_args__ = (
        UniqueConstraint("budget_id", "period_start", name="uq_budget_period_snapshots_budget_period"),
        {"schema": "trackspense"}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    budget_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.budgets.id", ondelete="CASCADE"), nullable=False, index=True)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    spent = Column(Numeric(12, 2), nullable=False)
    status = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RefreshToken(Base):
    """Refresh-token rotation state, replacing the process-local in-memory set that couldn't
    span the backend's multiple Cloud Run instances or survive a restart (remediation-outcome.md
    "Known gap — refresh-token revocation doesn't scale past one instance").

    `family_id` is constant across every token descending from one login. Reuse of an
    already-rotated (`revoked_at` set) token outside GRACE_PERIOD is treated as theft and
    revokes the whole family (RFC 9700-style cascading revocation — AuthService.rotate_refresh_token).
    Reuse *within* GRACE_PERIOD is treated as a legitimate concurrent-tab/device refresh race,
    not an attack, and is allowed to mint another descendant in the same family instead of
    logging the user out."""
    __tablename__ = "refresh_tokens"
    __table_args__ = {"schema": "trackspense"}

    jti = Column(UUID(as_uuid=True), primary_key=True)
    family_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=False, index=True)
    issued_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    # "rotated" | "exchanged" | "logout" | "reuse_detected" — only "rotated"/"exchanged" get
    # the grace-period leniency in AuthService.rotate_refresh_token/exchange_legacy_refresh_token;
    # a token revoked by explicit logout or because reuse was already caught must stay dead
    # immediately and permanently, not for another GRACE_PERIOD.
    revoked_reason = Column(String(20), nullable=True)
    # Informational only (not read by any revocation/reuse logic) — which token superseded
    # this one, for tracing a session's lineage during troubleshooting.
    replaced_by = Column(UUID(as_uuid=True), nullable=True)


class CardCatalog(Base):
    """TS-CARD-101: one curated credit/charge card, manually sourced and human-reviewed per
    docs/features/card_coach/TrackSpense_Card_Rewards_Product_Spec.md §5 — never populated by
    an automated scrape. `source_url`/`last_verified_at` are surfaced in the UI alongside every
    figure derived from this row (spec §9.4) so TrackSpense never asserts more confidence in a
    reward rate than it actually has.

    TS-CARD-112: `created_by_user_email` NULL means this row is curated as above; non-null means
    it's one user's private, self-reported "custom card" (source_url/last_verified_at are then
    also NULL — no issuer source to cite). CardRewardsEngine and the held-cards join work
    unchanged either way; callers that must not leak a custom card across users (catalog search,
    "optimal in catalog") filter on this column explicitly."""
    __tablename__ = "card_catalog"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    issuer = Column(String(255), nullable=False)
    card_name = Column(String(255), nullable=False)
    reward_type = Column(String(20), nullable=False)  # cashback | points | miles
    points_currency_name = Column(String(255), nullable=True)
    # Editorial dollar-per-point estimate for points/miles cards (spec §8.3) — set by whoever
    # curates the catalog entry, not derived from any live redemption-value feed.
    point_value_estimate_usd = Column(Numeric(6, 4), nullable=True)
    annual_fee = Column(Numeric(8, 2), nullable=False, default=0)
    source_url = Column(String(500), nullable=True)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_by_user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CardEarningRule(Base):
    """TS-CARD-101: one reward-rate rule for a CardCatalog card — a flat 'All Purchases' rate,
    a capped/bonused category rate, or a time-boxed rotating-category rate. One-to-many per card
    (spec §6) so e.g. Chase Freedom Flex can carry both its flat rate and several rotating rules.

    TS-CARD-113: a rule is either category-scoped (merchant_name NULL, category_id set — every
    row before this) or merchant-scoped (category_id NULL, merchant_name set, e.g. "5% via Chase
    Travel", "3% at Apple") — never both. Enforced in CardService/route validation, not a DB
    constraint, matching how category_id's taxonomy validation already works. Merchant rules take
    precedence over category rules when both could apply to the same spend (CardRewardsEngine) —
    a merchant is always the more specific, deliberately-targeted selector an issuer carved out,
    whether the carve-out rate is higher or lower than the general category rate."""
    __tablename__ = "card_earning_rules"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    card_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.card_catalog.id", ondelete="CASCADE"), nullable=False, index=True)
    # Matches the existing expense category taxonomy's sub-category id, or the literal
    # "All Purchases" sentinel for a card's flat/base rate (spec §6, §8.3). NULL for a
    # merchant-scoped rule.
    category_id = Column(String(100), nullable=True)
    # Matched case-insensitively against Expense.merchant_name (raw as-entered text — no
    # canonical/entity-resolution matching yet, a known v1 accuracy limitation). NULL for a
    # category-scoped rule.
    merchant_name = Column(String(255), nullable=True, index=True)
    multiplier = Column(Numeric(5, 2), nullable=False)
    cap_amount = Column(Numeric(10, 2), nullable=True)
    cap_period = Column(String(20), nullable=True)  # quarterly | annual
    exclusions_note = Column(Text, nullable=True)
    rotation_start = Column(Date, nullable=True)
    rotation_end = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class UserCard(Base):
    """TS-CARD-101: a user's claim to hold a CardCatalog card. Deliberately carries nothing about
    the user's actual card account — no numbers, no issuer credentials, no balances — matching
    the feature's no-new-PII goal (spec §2, §6).

    `is_default` (TS-CARD-104 follow-up): there's no per-expense card tracking and
    `Expense.payment_method` is free text, not linked to any UserCard, so §8.3's "actual earned"
    figure has no reliable way to attribute spend to a specific held card per expense. Exactly
    one held card can be flagged default (CardService enforces this) and CardRewardsEngine uses
    it as the sole basis for "actual earned" — see docs/features/card_coach/...Spec.md §8.3."""
    __tablename__ = "user_cards"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=False, index=True)
    card_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.card_catalog.id", ondelete="CASCADE"), nullable=False, index=True)
    is_default = Column(Boolean, nullable=False, default=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CardDataCorrection(Base):
    """TS-CARD-101: a user-filed report that a CardCatalog record looks stale/wrong (spec §5
    item 6, §9.4) — crowdsources freshness without any bot traffic against issuer sites. Purely
    a manual-review queue; nothing here is auto-applied back onto the catalog."""
    __tablename__ = "card_data_corrections"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=False, index=True)
    card_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.card_catalog.id", ondelete="CASCADE"), nullable=False, index=True)
    note = Column(Text, nullable=False)
    status = Column(String(50), nullable=False, default="open")  # open | reviewed | resolved
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Tag(Base):
    """TS-TAG-101: a user-defined, cross-cutting label (PRD §8) — orthogonal to Category (what
    kind of spend) and Group (who shares it). Private to the user who created it; there is no
    shared/group-visible tag (PRD §5.1, §9.2).

    `normalized_name` is the dedupe key (PRD §9.1, revised in v0.2.0): lowercase, trimmed,
    internal whitespace collapsed to a single space — deliberately NOT stripped of punctuation,
    so "Trip 1" and "Trip-1" stay distinct tags. This is an intentionally weak normalization;
    catching near-duplicate variants ("Trip1" vs "Trip 1") is a client-side fuzzy-match
    *suggestion* at input time (PRD §7.1), not a storage-level merge — a wrong hint is
    recoverable, a wrong merge is not.

    Usage stats (`usage_count`/`last_used_at`) are deliberately NOT stored here (PRD §8.1) — at
    the 100-tag-per-user cap, both are cheap to derive from `expense_tags` in the same query that
    powers autocomplete, and storing them would need correct maintenance across four mutation
    paths (apply/remove/bulk apply/bulk remove) for no measurable benefit."""
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("user_email", "normalized_name", name="uq_tags_user_normalized"),
        Index("idx_tags_user_status", "user_email", "status"),
        {"schema": "trackspense"},
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(50), nullable=False)
    normalized_name = Column(String(50), nullable=False)
    color = Column(String(7), nullable=True)  # hex; null = assigned from palette
    status = Column(String(20), nullable=False, default="Active")  # Active | Archived
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ExpenseTag(Base):
    """TS-TAG-101: link row between a Tag and an Expense (PRD §8). `user_email` is denormalized
    from `tags.user_email` — derivable via a join, but carrying it here makes the G7 privacy
    guarantee (a tag applied to a shared group expense is visible ONLY to the tagger, never other
    group members) enforceable with a single predicate on every read path, without a join. Given
    this column is the actual mechanism protecting that guarantee, the redundancy is deliberate
    (PRD §8, §9.2) — every read path returning tags for an expense MUST filter on it."""
    __tablename__ = "expense_tags"
    __table_args__ = (
        UniqueConstraint("tag_id", "expense_id", name="uq_expense_tags"),
        Index("idx_expense_tags_expense", "expense_id"),
        Index("idx_expense_tags_tag", "tag_id"),
        Index("idx_expense_tags_user", "user_email"),
        {"schema": "trackspense"},
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tag_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.tags.id", ondelete="CASCADE"), nullable=False)
    expense_id = Column(UUID(as_uuid=True), ForeignKey("trackspense.expenses.id", ondelete="CASCADE"), nullable=False)
    user_email = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

