"""Per-user daily quotas and a global daily spend cap for LLM-backed endpoints.

The app is free to use, so every LLM call is a cost with no revenue behind it. Each call goes
through reserve -> call -> settle:

* `reserve` checks the kill switch, the user's access level, the global spend cap, and then
  atomically claims one unit of the user's daily allowance for that feature. The claim is a
  single conditional upsert, so concurrent requests cannot overshoot the limit.
* `settle` records the tokens the provider reported and an estimated cost. The daily SUM of
  that cost is what the global cap compares against.
* `refund` gives the unit back when the call failed on our side, so users are not charged
  for provider outages.

Counters live in Postgres (`trackspense.ai_usage_daily`) rather than the slowapi limiter's
per-process memory, so they are shared across Cloud Run instances and survive cold starts.
Days are UTC.
"""

import logging
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, time as dtime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy import func, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.models import AiUsageDaily, User
from varavu_selavu_service.db.session import get_db

logger = logging.getLogger(__name__)

FEATURE_CHAT = "chat"
FEATURE_RECEIPT = "receipt"
FEATURE_CATEGORIZE = "categorize"
FEATURES = (FEATURE_CHAT, FEATURE_RECEIPT, FEATURE_CATEGORIZE)

# Estimated USD per 1M tokens as (input, output). These are estimates used only for the
# global spend cap, so they err high; update them when provider pricing changes. A model not
# listed here is charged at the most expensive rate so it can never slip under the cap.
MODEL_PRICES_PER_1M: dict[str, tuple[float, float]] = {
    "gemini-3.1-flash-lite": (0.25, 1.50),
    "gemini-2.5-flash-lite": (0.10, 0.40),
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.5-pro": (1.25, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
}
_FALLBACK_PRICE = max(MODEL_PRICES_PER_1M.values(), key=lambda p: p[0] + p[1])

# Used when a provider response carries no usage metadata, so an unreported call still counts
# toward the global cap instead of being free. Deliberately generous.
_FALLBACK_TOKENS: dict[str, tuple[int, int]] = {
    FEATURE_CHAT: (8000, 800),
    FEATURE_RECEIPT: (3000, 1500),
    FEATURE_CATEGORIZE: (400, 60),
}

# The global-spend SUM runs on every reserve, so cache it briefly per process. A few seconds
# of staleness can overshoot the cap by at most a few calls.
_SPEND_CACHE_TTL_SEC = 30
_spend_cache: dict = {"day": None, "value": 0.0, "at": 0.0}
_spend_lock = threading.Lock()


def reset_spend_cache() -> None:
    with _spend_lock:
        _spend_cache.update(day=None, value=0.0, at=0.0)


def estimate_cost_usd(model: Optional[str], input_tokens: int, output_tokens: int) -> float:
    if model and model.startswith(("llama", "ollama")):
        return 0.0
    price_in, price_out = MODEL_PRICES_PER_1M.get(model or "", _FALLBACK_PRICE)
    return (input_tokens * price_in + output_tokens * price_out) / 1_000_000


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


def next_reset_iso(day: date) -> str:
    return datetime.combine(day + timedelta(days=1), dtime.min, tzinfo=timezone.utc).isoformat()


class AiQuotaError(HTTPException):
    """HTTPException whose detail is a structured dict the clients switch on via `code`."""

    def __init__(self, status_code: int, code: str, message: str, **extra):
        self.code = code
        super().__init__(status_code=status_code, detail={"code": code, "message": message, **extra})


@dataclass
class Reservation:
    user_email: str
    feature: str
    day: date
    settled: bool = False


class AiQuotaService:
    def __init__(self, db: Session, settings: Optional[Settings] = None):
        self.db = db
        self.settings = settings or Settings()

    # ------------------------------------------------------------------ limits

    def default_limit(self, feature: str) -> int:
        return {
            FEATURE_CHAT: self.settings.AI_CHAT_DAILY_LIMIT,
            FEATURE_RECEIPT: self.settings.AI_RECEIPT_DAILY_LIMIT,
            FEATURE_CATEGORIZE: self.settings.AI_CATEGORIZE_DAILY_LIMIT,
        }[feature]

    def limit_for(self, user: User, feature: str) -> Optional[int]:
        """None means unlimited."""
        if user.ai_access == "unlimited":
            return None
        if user.ai_access == "blocked":
            return 0
        override = (user.ai_limits_override or {}).get(feature)
        if override is not None:
            return int(override)
        return self.default_limit(feature)

    # ------------------------------------------------------------ global spend

    def global_spend_today(self, day: date) -> float:
        now = time.monotonic()
        with _spend_lock:
            if _spend_cache["day"] == day and now - _spend_cache["at"] < _SPEND_CACHE_TTL_SEC:
                return _spend_cache["value"]
        value = float(
            self.db.query(func.coalesce(func.sum(AiUsageDaily.est_cost_usd), 0))
            .filter(AiUsageDaily.day == day)
            .scalar()
            or 0
        )
        with _spend_lock:
            _spend_cache.update(day=day, value=value, at=now)
        return value

    def is_paused(self, day: date) -> bool:
        return self.global_spend_today(day) >= self.settings.AI_GLOBAL_DAILY_BUDGET_USD

    # ----------------------------------------------------------------- reserve

    def _load_user(self, user_email: str) -> User:
        user = self.db.query(User).filter(User.email == user_email).first()
        if user is None:
            raise HTTPException(status_code=401, detail="Unknown user")
        return user

    def reserve(self, user_email: str, feature: str) -> Reservation:
        if feature not in FEATURES:
            raise ValueError(f"Unknown AI feature: {feature}")
        day = utc_today()
        resets_at = next_reset_iso(day)

        if not self.settings.AI_ENABLED:
            raise AiQuotaError(503, "ai_disabled", "AI features are turned off right now.", feature=feature)

        user = self._load_user(user_email)
        if user.ai_access == "blocked":
            raise AiQuotaError(403, "ai_blocked", "AI features are not available on this account.", feature=feature)
        if self.settings.AI_REQUIRE_VERIFIED_EMAIL and not user.email_verified:
            raise AiQuotaError(
                403, "email_not_verified", "Verify your email address to use AI features.", feature=feature
            )
        if self.is_paused(day):
            raise AiQuotaError(
                503, "ai_paused", "AI is taking a break. Please try again later.", feature=feature, resets_at=resets_at
            )

        limit = self.limit_for(user, feature)
        if limit is not None and limit <= 0:
            raise self._exceeded(feature, limit, 0, resets_at)

        # One conditional upsert claims the unit: a fresh row starts at 1, an existing row is
        # incremented only while below the limit. No row returned means the limit was hit.
        insert = pg_insert if self.db.bind.dialect.name == "postgresql" else sqlite_insert
        stmt = insert(AiUsageDaily).values(user_email=user_email, feature=feature, day=day, count=1)
        stmt = stmt.on_conflict_do_update(
            index_elements=[AiUsageDaily.user_email, AiUsageDaily.feature, AiUsageDaily.day],
            set_={"count": AiUsageDaily.count + 1},
            where=(AiUsageDaily.count < limit) if limit is not None else None,
        ).returning(AiUsageDaily.count)
        claimed = self.db.execute(stmt).scalar()
        self.db.commit()
        if claimed is None:
            raise self._exceeded(feature, limit, limit, resets_at)
        return Reservation(user_email=user_email, feature=feature, day=day)

    @staticmethod
    def _exceeded(feature: str, limit: int, used: int, resets_at: str) -> AiQuotaError:
        return AiQuotaError(
            429,
            "ai_quota_exceeded",
            "You've reached today's limit for this AI feature.",
            feature=feature,
            limit=limit,
            used=used,
            resets_at=resets_at,
        )

    # ---------------------------------------------------------- settle/refund

    def settle(
        self,
        reservation: Reservation,
        model: Optional[str],
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
    ) -> float:
        if reservation.settled:
            return 0.0
        if not input_tokens and not output_tokens:
            input_tokens, output_tokens = _FALLBACK_TOKENS[reservation.feature]
        input_tokens, output_tokens = int(input_tokens or 0), int(output_tokens or 0)
        cost = estimate_cost_usd(model, input_tokens, output_tokens)
        self.db.execute(
            update(AiUsageDaily)
            .where(
                AiUsageDaily.user_email == reservation.user_email,
                AiUsageDaily.feature == reservation.feature,
                AiUsageDaily.day == reservation.day,
            )
            .values(
                input_tokens=AiUsageDaily.input_tokens + input_tokens,
                output_tokens=AiUsageDaily.output_tokens + output_tokens,
                est_cost_usd=AiUsageDaily.est_cost_usd + Decimal(str(round(cost, 6))),
            )
        )
        self.db.commit()
        reservation.settled = True

        with _spend_lock:
            if _spend_cache["day"] == reservation.day:
                _spend_cache["value"] += cost
            total = _spend_cache["value"] if _spend_cache["day"] == reservation.day else None
        logger.info(
            "ai_usage user=%s feature=%s model=%s in_tok=%d out_tok=%d cost_usd=%.6f",
            reservation.user_email, reservation.feature, model, input_tokens, output_tokens, cost,
        )
        budget = self.settings.AI_GLOBAL_DAILY_BUDGET_USD
        if total is not None and budget > 0 and total >= 0.8 * budget:
            logger.warning("ai_spend_high day=%s est_total_usd=%.4f budget_usd=%.2f", reservation.day, total, budget)
        return cost

    def refund(self, reservation: Reservation) -> None:
        if reservation.settled:
            return
        self.db.execute(
            update(AiUsageDaily)
            .where(
                AiUsageDaily.user_email == reservation.user_email,
                AiUsageDaily.feature == reservation.feature,
                AiUsageDaily.day == reservation.day,
                AiUsageDaily.count > 0,
            )
            .values(count=AiUsageDaily.count - 1)
        )
        self.db.commit()
        reservation.settled = True

    # ------------------------------------------------------------------ usage

    def usage(self, user_email: str) -> dict:
        day = utc_today()
        user = self._load_user(user_email)
        rows = {
            r.feature: r.count
            for r in self.db.query(AiUsageDaily).filter(AiUsageDaily.user_email == user_email, AiUsageDaily.day == day)
        }
        features = {}
        for feature in FEATURES:
            limit = self.limit_for(user, feature)
            used = rows.get(feature, 0)
            features[feature] = {
                "used": used,
                "limit": limit,
                "remaining": None if limit is None else max(limit - used, 0),
            }
        return {
            "features": features,
            "resets_at": next_reset_iso(day),
            "ai_enabled": self.settings.AI_ENABLED,
            "paused": self.is_paused(day),
            "blocked": user.ai_access == "blocked",
            "email_verified": bool(user.email_verified),
            "requires_verified_email": self.settings.AI_REQUIRE_VERIFIED_EMAIL,
        }


def get_ai_quota_service(db: Session = Depends(get_db)) -> AiQuotaService:
    return AiQuotaService(db)
