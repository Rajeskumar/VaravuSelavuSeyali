"""Serialize duplicate-relevant writes across all personal expense entry points."""

import hashlib
import unicodedata
from decimal import Decimal
from sqlalchemy import select, text
from varavu_selavu_service.db.models import User


def lock_personal_user(db, email):
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SET LOCAL lock_timeout = '5s'"))
        db.execute(text("SET LOCAL statement_timeout = '15s'"))
    row = db.execute(
        select(User.email).where(User.email == email).with_for_update()
    ).first()
    if row is None:
        raise ValueError("User not found")


def duplicate_fingerprint(currency, amount, merchant, description):
    name = " ".join(
        unicodedata.normalize("NFKC", merchant or description or "").casefold().split()
    )
    content = f'{currency or "USD"}\x1f{Decimal(str(amount)):.2f}\x1f{name}'
    return hashlib.sha256(content.encode()).hexdigest()
