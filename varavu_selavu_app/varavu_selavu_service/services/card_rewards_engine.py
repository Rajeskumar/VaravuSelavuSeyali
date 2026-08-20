"""TS-CARD-104 — CardRewardsEngine: the multiplier/cap/gap math for Card Coach, isolated from
AnalysisService/CardService so it's independently unit-testable, mirroring how SplitEngine keeps
split math out of GroupExpenseService (spec §13.3). Pure functions/dataclasses only — no DB
session, no FastAPI dependency. Callers (TS-CARD-106's /cards/coach endpoint) pass in plain
dicts already fetched from CardService/AnalysisService.

Reward math (spec §8.3):
- cashback cards: multiplier is a percentage. earned_usd = spend * multiplier / 100.
- points/miles cards: multiplier is points-per-dollar. earned_raw = spend * multiplier (points),
  and earned_usd = earned_raw * point_value_estimate_usd *only* when that estimate is set —
  never fabricated. A points/miles card with no point_value_estimate_usd can't be compared in
  dollar terms and is excluded from "best card" selection (which ranks by dollar value), but its
  raw point total is still surfaced.

Category matching: an exact CardEarningRule.category_id match wins; otherwise the card's
"All Purchases" flat-rate rule applies; if a card has neither, it earns nothing for that
category. Rotating-category date windows (rotation_start/rotation_end) are informational only in
Phase 1 (spec §4.2/§8.3 — no real-time cap/rotation tracking), not filtered here.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel

ALL_PURCHASES = "All Purchases"


class RewardsEngineError(Exception):
    """Domain exception for malformed inputs — bad multiplier/category shapes, not "no match
    found" (which is a normal, valid outcome represented by a None result, not an error)."""


class CardRewardEstimate(BaseModel):
    card_id: str
    card_name: str
    reward_type: str
    matched_category_id: str  # the category_id actually matched — either the exact category or ALL_PURCHASES
    multiplier: float
    earned_raw: float  # dollars for cashback; points/miles units for points/miles cards
    earned_usd: Optional[float] = None  # None only for points/miles cards with no point_value_estimate_usd
    cap_note: Optional[str] = None


class CategoryRewardGap(BaseModel):
    category: str
    actual_spend: float
    actual: Optional[CardRewardEstimate] = None
    optimal_in_wallet: Optional[CardRewardEstimate] = None
    optimal_catalog: Optional[CardRewardEstimate] = None

    @property
    def gap_usd(self) -> float:
        """optimal_in_wallet vs actual — the "you left $X on the table with cards you already
        hold" figure (spec §4.1 item 2). 0 whenever there's no real baseline to compare against
        (no default card set, or either side has no dollar-comparable estimate) — this must never
        assume $0 actual earnings just because the baseline is unknown, since that would overstate
        the gap and present a guess as fact."""
        if self.actual is None or self.actual.earned_usd is None:
            return 0.0
        if self.optimal_in_wallet is None or self.optimal_in_wallet.earned_usd is None:
            return 0.0
        return round(max(self.optimal_in_wallet.earned_usd - self.actual.earned_usd, 0.0), 2)


def _validate_card(card: Dict[str, Any]) -> None:
    if not card.get("card_id") or not card.get("reward_type"):
        raise RewardsEngineError(f"Card missing card_id/reward_type: {card!r}")
    if card["reward_type"] not in ("cashback", "points", "miles"):
        raise RewardsEngineError(f"Unknown reward_type: {card['reward_type']!r}")


def _best_rule_for_category(card: Dict[str, Any], category: str) -> Optional[Dict[str, Any]]:
    rules = card.get("earning_rules") or []
    exact = next((r for r in rules if r.get("category_id") == category), None)
    if exact is not None:
        return exact
    return next((r for r in rules if r.get("category_id") == ALL_PURCHASES), None)


def _cap_note(card: Dict[str, Any], rule: Dict[str, Any]) -> Optional[str]:
    cap_amount = rule.get("cap_amount")
    if cap_amount is None:
        return None
    period = rule.get("cap_period") or "period"
    note = f"{card.get('card_name', 'This card')}'s {rule.get('multiplier')}x/% rate on {rule.get('category_id')} applies up to ${cap_amount:,.0f}/{period} — you may have exceeded this cap"
    exclusions = rule.get("exclusions_note")
    if exclusions:
        note += f"; {exclusions}"
    return note


def estimate_reward(card: Dict[str, Any], category: str, spend: float) -> Optional[CardRewardEstimate]:
    """Reward this one card would earn on `spend` in `category`. None if the card has no
    applicable rule (no exact-category rule and no "All Purchases" fallback)."""
    _validate_card(card)
    rule = _best_rule_for_category(card, category)
    if rule is None:
        return None

    multiplier = float(rule["multiplier"])
    earned_raw = round(spend * multiplier / 100.0, 2) if card["reward_type"] == "cashback" else round(spend * multiplier, 4)

    earned_usd: Optional[float]
    if card["reward_type"] == "cashback":
        earned_usd = earned_raw
    else:
        point_value = card.get("point_value_estimate_usd")
        earned_usd = round(earned_raw * point_value, 2) if point_value is not None else None

    return CardRewardEstimate(
        card_id=card["card_id"],
        card_name=card.get("card_name", ""),
        reward_type=card["reward_type"],
        matched_category_id=rule["category_id"],
        multiplier=multiplier,
        earned_raw=earned_raw,
        earned_usd=earned_usd,
        cap_note=_cap_note(card, rule),
    )


def best_card_for_category(cards: List[Dict[str, Any]], category: str, spend: float) -> Optional[CardRewardEstimate]:
    """The single highest dollar-value estimate among `cards` for this category. Cards with no
    dollar-comparable estimate (points/miles with no point_value_estimate_usd) are never chosen
    here, even if they'd nominally out-earn in raw points — there's nothing to compare against."""
    estimates = [estimate_reward(c, category, spend) for c in cards]
    comparable = [e for e in estimates if e is not None and e.earned_usd is not None]
    if not comparable:
        return None
    return max(comparable, key=lambda e: e.earned_usd)


def compute_category_gap(
    category: str,
    spend: float,
    held_cards: List[Dict[str, Any]],
    catalog_cards: List[Dict[str, Any]],
    default_card_id: Optional[str],
) -> CategoryRewardGap:
    default_card = next((c for c in held_cards if c["card_id"] == default_card_id), None) if default_card_id else None
    actual = estimate_reward(default_card, category, spend) if default_card else None
    optimal_in_wallet = best_card_for_category(held_cards, category, spend) if held_cards else None
    optimal_catalog = best_card_for_category(catalog_cards, category, spend) if catalog_cards else None

    return CategoryRewardGap(
        category=category,
        actual_spend=round(spend, 2),
        actual=actual,
        optimal_in_wallet=optimal_in_wallet,
        optimal_catalog=optimal_catalog,
    )


def compute_coach_summary(
    category_totals: List[Dict[str, Any]],
    held_cards: List[Dict[str, Any]],
    catalog_cards: List[Dict[str, Any]],
    default_card_id: Optional[str],
) -> List[CategoryRewardGap]:
    """category_totals: [{"category": str, "total": float}, ...] — AnalysisService's shape."""
    return [
        compute_category_gap(row["category"], float(row["total"]), held_cards, catalog_cards, default_card_id)
        for row in category_totals
    ]
