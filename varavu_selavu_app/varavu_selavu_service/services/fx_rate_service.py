import logging
import uuid
from datetime import date as date_type, datetime, timezone
from decimal import Decimal
from typing import Optional

import requests
from sqlalchemy.orm import Session

from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.models import FxRate

logger = logging.getLogger("varavu_selavu.fx_rate")


class FxRateService:
    """TS-GRP-131: daily-granularity FX rate lookup with a DB-backed cache.

    Rates are looked up once per (date, from, to) triple and never
    recomputed — an expense's FX rate is a historical fact, snapshotted at
    creation time on `Expense.fx_rate_to_group_currency`.
    """

    def __init__(self, db: Session):
        self.db = db
        self.settings = Settings()

    def get_rate(self, from_currency: str, to_currency: str, as_of: Optional[date_type] = None) -> Decimal:
        from_currency = (from_currency or "USD").upper()
        to_currency = (to_currency or "USD").upper()
        if from_currency == to_currency:
            return Decimal("1.0")

        rate_date = as_of or datetime.now(timezone.utc).date()

        cached = (
            self.db.query(FxRate)
            .filter(FxRate.rate_date == rate_date, FxRate.from_currency == from_currency, FxRate.to_currency == to_currency)
            .first()
        )
        if cached is not None:
            return Decimal(str(cached.rate))

        rate = self._fetch_rate(from_currency, to_currency)
        row = FxRate(
            id=uuid.uuid4(),
            rate_date=rate_date,
            from_currency=from_currency,
            to_currency=to_currency,
            rate=rate,
        )
        self.db.add(row)
        try:
            self.db.commit()
        except Exception:
            # Another concurrent request may have inserted the same (date, pair) row
            # first (unique constraint) — that's fine, just re-read it.
            self.db.rollback()
            existing = (
                self.db.query(FxRate)
                .filter(FxRate.rate_date == rate_date, FxRate.from_currency == from_currency, FxRate.to_currency == to_currency)
                .first()
            )
            if existing is not None:
                return Decimal(str(existing.rate))
        return rate

    def _fetch_rate(self, from_currency: str, to_currency: str) -> Decimal:
        try:
            resp = requests.get(f"{self.settings.FX_RATE_API_URL}/{from_currency}", timeout=5)
            resp.raise_for_status()
            data = resp.json()
            rate = data.get("rates", {}).get(to_currency)
            if rate is None:
                raise ValueError(f"No rate for {to_currency} in provider response")
            return Decimal(str(rate))
        except Exception:
            # A lookup failure must never block expense creation — fall back to a
            # 1:1 rate and log loudly so it's visible in ops, not silently wrong.
            logger.exception(
                "FX rate lookup failed for %s->%s; falling back to 1:1", from_currency, to_currency
            )
            return Decimal("1.0")
