"""Public tool arguments: no identity or approval capability is client supplied."""

import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Literal
from pydantic import (
    BaseModel,
    ConfigDict,
    BeforeValidator,
    Field,
    model_validator,
    field_validator,
)
from varavu_selavu_service.core.text_sanitize import sanitize_text
from varavu_selavu_service.services.category_catalog import resolve


def decimal_string(value, places=2):
    if not isinstance(value, str) or not re.fullmatch(
        r"[0-9]{1,10}(?:\.[0-9]{1," + str(places) + r"})?", value
    ):
        raise ValueError("Use a plain decimal string")
    return Decimal(value)


Money = Annotated[
    Decimal,
    BeforeValidator(decimal_string, json_schema_input_type=str),
    Field(ge=0, le=1000000),
]
PositiveMoney = Annotated[
    Decimal,
    BeforeValidator(decimal_string, json_schema_input_type=str),
    Field(gt=0, le=1000000),
]
Quantity = Annotated[
    Decimal,
    BeforeValidator(lambda v: decimal_string(v, 3), json_schema_input_type=str),
    Field(gt=0, le=10000),
]


def strict_text(value):
    if not isinstance(value, str):
        raise ValueError("Text required")
    return sanitize_text(value)


Description = Annotated[
    str, BeforeValidator(strict_text), Field(min_length=1, max_length=200)
]
Merchant = Annotated[
    str, BeforeValidator(strict_text), Field(min_length=1, max_length=100)
]
Notes = Annotated[str, BeforeValidator(strict_text), Field(max_length=500)]


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class EmptyInput(StrictInput):
    pass


class ReceiptItem(StrictInput):
    name: Description
    quantity: Quantity = Decimal("1")
    unit_price: Money | None = None
    line_total: Money
    discount: Money = Decimal("0")
    category_id: str | None = None

    @field_validator("category_id")
    @classmethod
    def valid_category(cls, v):
        if v is not None:
            resolve(v)
        return v


class VerifyExpense(StrictInput):
    @classmethod
    def __get_pydantic_json_schema__(cls, core_schema, handler):
        schema = handler(core_schema)
        schema["oneOf"] = [
            {
                "properties": {
                    "kind": {"const": "simple"},
                    "amount": {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": ["kind", "amount", "description"],
                "not": {
                    "anyOf": [
                        {"required": [name]}
                        for name in (
                            "total",
                            "subtotal",
                            "tax",
                            "tip",
                            "discount",
                            "payment_method",
                            "items",
                            "accept_unreconciled",
                        )
                    ]
                },
            },
            {
                "properties": {
                    "kind": {"const": "itemized"},
                    "total": {"type": "string"},
                    "merchant": {"type": "string"},
                    "items": {"minItems": 1},
                },
                "required": ["kind", "total", "merchant", "items"],
            },
        ]
        return schema

    kind: Literal["simple", "itemized"]
    idempotency_key: str = Field(pattern=r"^[A-Za-z0-9_-]{16,128}$")
    date: str
    currency: str = "USD"
    category_id: str
    description: Description | None = None
    merchant: Merchant | None = None
    notes: Notes | None = None
    amount: PositiveMoney | None = None
    total: PositiveMoney | None = None
    subtotal: Money | None = None
    tax: Money = Decimal("0")
    tip: Money = Decimal("0")
    discount: Money = Decimal("0")
    payment_method: Literal["card", "cash", "other", "unknown"] = "unknown"
    items: list[ReceiptItem] = Field(default_factory=list, max_length=200)
    accept_unreconciled: bool = False

    @field_validator("date")
    @classmethod
    def valid_date(cls, v):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise ValueError("date_out_of_range")
        d = date.fromisoformat(v)
        today = datetime.now(timezone.utc).date()
        # Same window as the web/mobile forms: no future dates, nothing older than a year.
        if d > today + timedelta(days=1) or d < today - timedelta(days=366):
            raise ValueError("date_out_of_range")
        return v

    @field_validator("currency")
    @classmethod
    def valid_currency(cls, v):
        if v.upper() != "USD":
            raise ValueError("unsupported_currency")
        return "USD"

    @field_validator("category_id")
    @classmethod
    def valid_category(cls, v):
        resolve(v)
        return v

    @model_validator(mode="after")
    def validate_kind(self):
        if self.kind == "simple":
            if self.amount is None or self.description is None:
                raise ValueError("Simple expenses need amount and description")
            receipt_fields = {
                "total",
                "subtotal",
                "tax",
                "tip",
                "discount",
                "payment_method",
                "items",
                "accept_unreconciled",
            }
            if receipt_fields & self.model_fields_set:
                raise ValueError("Receipt fields require kind=itemized")
        else:
            if (
                self.total is None
                or not self.merchant
                or not self.items
                or self.amount is not None
            ):
                raise ValueError(
                    "Receipts need total, merchant and items, without amount"
                )
            if not self.description:
                self.description = f"Purchase at {self.merchant}"
        return self


class OperationInput(StrictInput):
    operation_id: str = Field(pattern=r"^op_[a-f0-9]{32}$")


class DateRange(StrictInput):
    start_date: str = Field(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
    end_date: str = Field(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")

    @model_validator(mode="after")
    def dates(self):
        start, end = date.fromisoformat(self.start_date), date.fromisoformat(
            self.end_date
        )
        if end == date.max or end < start or (end - start).days >= 366:
            raise ValueError("range_too_large")
        return self


class ListExpenses(DateRange):
    category_id: str | None = None
    merchant: str | None = Field(default=None, max_length=100)
    text: str | None = Field(default=None, max_length=100)
    min_amount: Money | None = None
    max_amount: Money | None = None
    sort: Literal["date_desc", "date_asc", "amount_desc", "amount_asc"] = "date_desc"
    limit: int = Field(default=20, ge=1, le=50)
    cursor: str | None = Field(default=None, max_length=2048)

    @model_validator(mode="after")
    def amounts(self):
        if (
            self.min_amount is not None
            and self.max_amount is not None
            and self.min_amount > self.max_amount
        ):
            raise ValueError("Minimum exceeds maximum")
        return self


class GetExpense(StrictInput):
    expense_id: str = Field(max_length=40)
    items_cursor: str | None = Field(default=None, max_length=2048)


class SummaryInput(StrictInput):
    year: int | None = Field(default=None, ge=1, le=9998)
    month: int | None = Field(default=None, ge=1, le=12)
    start_date: str | None = Field(default=None, pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
    end_date: str | None = Field(default=None, pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")

    @model_validator(mode="after")
    def period(self):
        if self.year is not None:
            if self.start_date or self.end_date:
                raise ValueError("Choose one period format")
        elif not self.start_date or not self.end_date or self.month is not None:
            raise ValueError("Supply year or start_date/end_date")
        else:
            DateRange(start_date=self.start_date, end_date=self.end_date)
        return self


class BreakdownInput(SummaryInput):
    category_id: str | None = None
    compare_to_previous: bool = False


class ParseReceipt(StrictInput):
    lines: list[Annotated[str, Field(max_length=200)]] = Field(
        min_length=1, max_length=400
    )
