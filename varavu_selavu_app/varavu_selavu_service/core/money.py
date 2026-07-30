"""Constrained money types for request models (P1-3).

Money is `Decimal`, never `float`: the DB columns are already `Numeric(12, 2)`,
and float arithmetic produces artifacts like `306.49999999999994` in totals.

Pydantic coerces the incoming JSON number to `Decimal` and enforces the bounds,
so an out-of-range or over-precise amount is rejected with 422 rather than being
silently rounded or stored.
"""

from decimal import Decimal, InvalidOperation
from typing import Annotated, Optional

from pydantic import Field

# Product ceiling for a single expense. The DB column holds up to
# 9,999,999,999.99; this is the far tighter "is this a plausible expense" bound.
MAX_AMOUNT = Decimal("1000000")

_MONEY_KWARGS = dict(max_digits=12, decimal_places=2, le=MAX_AMOUNT)

#: A charged amount: strictly positive.
MoneyAmount = Annotated[Decimal, Field(gt=0, **_MONEY_KWARGS)]

#: An amount that may legitimately be zero (a payer who paid nothing, zero tax).
NonNegativeMoney = Annotated[Decimal, Field(ge=0, **_MONEY_KWARGS)]

OptionalMoneyAmount = Annotated[Optional[Decimal], Field(gt=0, **_MONEY_KWARGS)]
OptionalNonNegativeMoney = Annotated[Optional[Decimal], Field(ge=0, **_MONEY_KWARGS)]


def to_decimal(value, default: Decimal = Decimal("0")) -> Decimal:
    """Coerces a JSON number/string to Decimal for arithmetic.

    Used where a payload field is an untyped dict value and so has not been
    through the constrained types above.
    """
    if value is None:
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return default


def validate_money_amount(value, *, field_name: str, allow_zero: bool = False) -> Decimal:
    """Applies the MoneyAmount bounds to a value from an untyped payload,
    raising 422 the way a constrained Pydantic field would."""
    from fastapi import HTTPException

    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(status_code=422, detail=f"{field_name} must be a number")

    if not amount.is_finite():
        raise HTTPException(status_code=422, detail=f"{field_name} must be a finite number")
    if allow_zero and amount < 0:
        raise HTTPException(status_code=422, detail=f"{field_name} must be zero or greater")
    if not allow_zero and amount <= 0:
        raise HTTPException(status_code=422, detail=f"{field_name} must be greater than 0")
    if amount > MAX_AMOUNT:
        raise HTTPException(status_code=422, detail=f"{field_name} must not exceed {MAX_AMOUNT:,}")
    if -amount.as_tuple().exponent > 2:
        raise HTTPException(status_code=422, detail=f"{field_name} must have at most 2 decimal places")
    return amount
