import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Integer, Date, ForeignKey, Text, JSON
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
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = {"schema": "trackspense"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=False, index=True)
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
    user_email = Column(String(255), ForeignKey("trackspense.users.email", ondelete="CASCADE"), nullable=False)
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
    day_of_month = Column(Integer, nullable=False)
    default_cost = Column(Numeric(12, 2), nullable=False)
    start_date = Column(Date, nullable=False)
    last_processed_date = Column(Date)
    status = Column(String(50), default="Active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
