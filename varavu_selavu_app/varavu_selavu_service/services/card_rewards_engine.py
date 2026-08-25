"""TS-CARD-104/113 — CardRewardsEngine: the multiplier/cap/gap math for Card Coach, isolated from
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

Rule matching precedence (TS-CARD-113): an exact merchant match wins first, then an exact
category match, then the card's "All Purchases" flat rule; if none apply, the card earns nothing
for that spend. Merchant always wins over category when both could apply — it's the more
specific, deliberately-targeted rule an issuer carved out (e.g. Chase Sapphire Preferred's "5%
via Chase Travel" vs. its own "2% other travel"), whether the carve-out rate is higher or lower
than the general category rate. Merchant matching is case-insensitive exact-string against
Expense.merchant_name (raw as-entered text, no canonical/entity-resolution normalization yet —
a known v1 accuracy limitation, not attempted here).

Category "actual earned" is bucket-aware (spec discussion, Option B): it sums a single card's
(the user's default) earnings across every (category, merchant) bucket within that category,
resolving merchant-vs-category precedence per bucket — correct and unambiguous, since "actual"
only ever concerns one specific card. Category "optimal" (search across multiple cards) stays a
simple, single-card, category-only comparison — deliberately NOT merchant-aware, since "which
card is optimal" can be genuinely ambiguous once a category mixes merchant and non-merchant
spend across multiple cards. That ambiguity is exactly what the separate by-merchant view (also
in this module) exists to resolve precisely instead — a merchant-only comparison is never mixed.

Rotating-category date windows (rotation_start/rotation_end) are informational only in Phase 1
(spec §4.2/§8.3 — no real-time cap/rotation tracking), not filtered here.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel

ALL_PURCHASES = "All Purchases"


class RewardsEngineError(Exception):
    """Domain exception for malformed inputs — bad multiplier/category shapes, not "no match
    found" (which is a normal, valid outcome represented by a None result, not an error)."""


class CardRewardEstimate(BaseModel):
    card_id: str
    card_name: str
    reward_type: str
    # Exactly one of these is set for a single-bucket estimate (whichever rule matched); both are
    # None for a bucket-summed estimate spanning multiple rules (no single "the" match to report).
    matched_category_id: Optional[str] = None
    matched_merchant_name: Optional[str] = None
    multiplier: float  # blended effective rate when summed across buckets, not one rule's literal rate
    earned_raw: float  # dollars for cashback; points/miles units for points/miles cards
    earned_usd: Optional[float] = None  # None only for points/miles cards with no point_value_estimate_usd
    cap_note: Optional[str] = None


class _RewardGapBase(BaseModel):
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


class CategoryRewardGap(_RewardGapBase):
    category: str


class MerchantRewardGap(_RewardGapBase):
    merchant: str


def _validate_card(card: Dict[str, Any]) -> None:
    if not card.get("card_id") or not card.get("reward_type"):
        raise RewardsEngineError(f"Card missing card_id/reward_type: {card!r}")
    if card["reward_type"] not in ("cashback", "points", "miles"):
        raise RewardsEngineError(f"Unknown reward_type: {card['reward_type']!r}")


def _best_rule(card: Dict[str, Any], category: Optional[str], merchant: Optional[str]) -> Optional[Dict[str, Any]]:
    rules = card.get("earning_rules") or []
    if merchant:
        merchant_key = merchant.strip().lower()
        exact_merchant = next(
            (r for r in rules if r.get("merchant_name") and r["merchant_name"].strip().lower() == merchant_key),
            None,
        )
        if exact_merchant is not None:
            return exact_merchant
    if category:
        # Case-insensitive, same as merchant matching above — category historically only ever
        # came from validated UI/expense data (always exact-case), but Phase 2's prospective
        # suggestion tool feeds this from an LLM's free-text guess, so a stray case mismatch must
        # not silently fail to match.
        category_key = category.strip().lower()
        exact_category = next(
            (r for r in rules if r.get("category_id") and r["category_id"].strip().lower() == category_key),
            None,
        )
        if exact_category is not None:
            return exact_category
    return next((r for r in rules if r.get("category_id") == ALL_PURCHASES), None)


def _cap_note(card: Dict[str, Any], rule: Dict[str, Any]) -> Optional[str]:
    cap_amount = rule.get("cap_amount")
    if cap_amount is None:
        return None
    period = rule.get("cap_period") or "period"
    if rule.get("merchant_name"):
        scope_phrase = f"at {rule['merchant_name']}"
    else:
        scope_phrase = f"on {rule.get('category_id')}"
    note = f"{card.get('card_name', 'This card')}'s {rule.get('multiplier')}x/% rate {scope_phrase} applies up to ${cap_amount:,.0f}/{period} — you may have exceeded this cap"
    exclusions = rule.get("exclusions_note")
    if exclusions:
        note += f"; {exclusions}"
    return note


def estimate_reward(
    card: Dict[str, Any], category: Optional[str], spend: float, merchant: Optional[str] = None,
) -> Optional[CardRewardEstimate]:
    """Reward this one card would earn on `spend`, resolving merchant-vs-category-vs-flat
    precedence (TS-CARD-113). None if the card has no applicable rule at all."""
    _validate_card(card)
    rule = _best_rule(card, category, merchant)
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
        matched_category_id=rule.get("category_id"),
        matched_merchant_name=rule.get("merchant_name"),
        multiplier=multiplier,
        earned_raw=earned_raw,
        earned_usd=earned_usd,
        cap_note=_cap_note(card, rule),
    )


def _sum_card_earning_across_buckets(
    default_card: Optional[Dict[str, Any]],
    buckets: List[Dict[str, Any]],
    cards_by_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Optional[CardRewardEstimate]:
    """"Actual earned" summed across (category, merchant, card_id) buckets, resolving
    merchant-vs-category precedence independently per bucket.

    TS-CARD-114: each bucket carries its own attributed card_id (None means unattributed).
    `cards_by_id` resolves an attributed bucket to the specific card the user said they used;
    unattributed buckets fall back to `default_card`, exactly matching pre-TS-CARD-114 behavior
    for a user who never uses the picker (every bucket unattributed -> every bucket uses
    `default_card` -> identical output to the old single-card-only version of this function).

    When buckets resolve to more than one distinct actual card, summing raw point/mile units
    across heterogeneous reward currencies would be meaningless (Chase points + cashback dollars
    aren't the same unit) — so a multi-card blend only ever reports the dollar-comparable total
    (`earned_usd`, safe to sum since USD is USD regardless of source card) under a "Multiple
    cards" label, dropping `earned_raw`'s single-currency meaning entirely rather than fabricate
    a number in a made-up shared unit. A bucket with no resolvable card (no attribution and no
    default) contributes nothing, same as an unmatched rule always has — "actual" has always
    tolerated partial coverage without a separate "how much did we actually price" signal."""
    cards_by_id = cards_by_id or {}
    total_spend = round(sum(b["total"] for b in buckets), 2)
    if total_spend <= 0:
        return None

    total_earned_raw = 0.0
    total_earned_usd = 0.0
    has_usd = False
    cap_notes: List[str] = []
    matched_any = False
    distinct_cards: Dict[str, Dict[str, Any]] = {}

    for b in buckets:
        bucket_card_id = b.get("card_id")
        card = cards_by_id.get(bucket_card_id) if bucket_card_id else default_card
        if card is None:
            continue
        _validate_card(card)
        est = estimate_reward(card, b.get("category"), b["total"], merchant=b.get("merchant"))
        if est is None:
            continue
        matched_any = True
        distinct_cards[card["card_id"]] = card
        total_earned_raw += est.earned_raw
        if est.earned_usd is not None:
            total_earned_usd += est.earned_usd
            has_usd = True
        if est.cap_note and est.cap_note not in cap_notes:
            cap_notes.append(est.cap_note)

    if not matched_any:
        return None

    earned_usd = round(total_earned_usd, 2) if has_usd else None
    mixed = len(distinct_cards) > 1

    if mixed:
        # Only the dollar total is honest across heterogeneous reward currencies (see docstring).
        if earned_usd is None:
            return None
        card_id, card_name, reward_type = "", "Multiple cards", "cashback"
        earned_raw = earned_usd
        multiplier = round((earned_usd / total_spend) * 100.0, 2) if total_spend else 0.0
    else:
        only_card = next(iter(distinct_cards.values()))
        card_id, card_name, reward_type = only_card["card_id"], only_card.get("card_name", ""), only_card["reward_type"]
        earned_raw = round(total_earned_raw, 2)
        # Blended effective rate — always recoverable as earned/spend, honest even when multiple
        # underlying rules contributed (no single rule's literal multiplier applies to the sum).
        if has_usd:
            multiplier = round((total_earned_usd / total_spend) * 100.0, 2) if total_spend else 0.0
        else:
            multiplier = round(total_earned_raw / total_spend, 4) if total_spend else 0.0

    return CardRewardEstimate(
        card_id=card_id,
        card_name=card_name,
        reward_type=reward_type,
        matched_category_id=None,
        matched_merchant_name=None,
        multiplier=multiplier,
        earned_raw=earned_raw,
        earned_usd=earned_usd,
        cap_note="; ".join(cap_notes) if cap_notes else None,
    )


def best_card_for_category(
    cards: List[Dict[str, Any]], category: Optional[str], spend: float, merchant: Optional[str] = None,
) -> Optional[CardRewardEstimate]:
    """The single highest dollar-value estimate among `cards`. Cards with no dollar-comparable
    estimate (points/miles with no point_value_estimate_usd) are never chosen here, even if
    they'd nominally out-earn in raw points — there's nothing to compare against."""
    estimates = [estimate_reward(c, category, spend, merchant=merchant) for c in cards]
    comparable = [e for e in estimates if e is not None and e.earned_usd is not None]
    if not comparable:
        return None
    return max(comparable, key=lambda e: e.earned_usd)


def compute_category_gap(
    category: str,
    buckets: List[Dict[str, Any]],
    held_cards: List[Dict[str, Any]],
    catalog_cards: List[Dict[str, Any]],
    default_card_id: Optional[str],
    cards_by_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> CategoryRewardGap:
    total_spend = round(sum(b["total"] for b in buckets), 2)
    default_card = next((c for c in held_cards if c["card_id"] == default_card_id), None) if default_card_id else None
    # TS-CARD-114: computed whenever ANY bucket resolves to a real card — either its own
    # attribution or, absent that, the default — not only when a default card exists (a user
    # with no default but some explicitly-attributed spend still gets a real, if partial,
    # actual figure instead of an unconditional None).
    actual = _sum_card_earning_across_buckets(default_card, buckets, cards_by_id)
    # Deliberately simple/category-only — see module docstring for why "optimal" doesn't chase
    # merchant precedence the way "actual" does.
    optimal_in_wallet = best_card_for_category(held_cards, category, total_spend) if held_cards else None
    optimal_catalog = best_card_for_category(catalog_cards, category, total_spend) if catalog_cards else None

    return CategoryRewardGap(
        category=category,
        actual_spend=total_spend,
        actual=actual,
        optimal_in_wallet=optimal_in_wallet,
        optimal_catalog=optimal_catalog,
    )


def compute_merchant_gap(
    merchant: str,
    buckets: List[Dict[str, Any]],
    held_cards: List[Dict[str, Any]],
    catalog_cards: List[Dict[str, Any]],
    default_card_id: Optional[str],
    cards_by_id: Optional[Dict[str, Dict[str, Any]]] = None,
) -> MerchantRewardGap:
    total_spend = round(sum(b["total"] for b in buckets), 2)
    # Fallback category for cards with no rule for this merchant at all — the merchant's largest
    # contributing category, a small documented approximation for the rare case a card without a
    # merchant-specific rule must fall back on a category rule for a merchant spanning several.
    dominant_category = max(buckets, key=lambda b: b["total"])["category"] if buckets else None

    default_card = next((c for c in held_cards if c["card_id"] == default_card_id), None) if default_card_id else None
    actual = _sum_card_earning_across_buckets(default_card, buckets, cards_by_id)
    optimal_in_wallet = best_card_for_category(held_cards, dominant_category, total_spend, merchant=merchant) if held_cards else None
    optimal_catalog = best_card_for_category(catalog_cards, dominant_category, total_spend, merchant=merchant) if catalog_cards else None

    return MerchantRewardGap(
        merchant=merchant,
        actual_spend=total_spend,
        actual=actual,
        optimal_in_wallet=optimal_in_wallet,
        optimal_catalog=optimal_catalog,
    )


def compute_coach_summary(
    buckets: List[Dict[str, Any]],
    held_cards: List[Dict[str, Any]],
    catalog_cards: List[Dict[str, Any]],
    default_card_id: Optional[str],
    attributed_cards: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[List[CategoryRewardGap], List[MerchantRewardGap]]:
    """buckets: [{"category": str, "merchant": Optional[str], "card_id": Optional[str],
    "total": float}, ...] — AnalysisService.compute_category_merchant_buckets's shape.

    `attributed_cards` (TS-CARD-114): engine-shape cards for any card_id appearing on a bucket
    that isn't necessarily still in `held_cards` (the user may have removed it since) — "actual
    earned" reflects the card genuinely used at the time, independent of whether it's still held
    today. Held cards are included automatically; this only needs to cover the gap.

    Returns (category_gaps, merchant_gaps). A merchant only gets its own gap row when at least
    one held or catalog card has an explicit rule for it — otherwise the row would just repeat
    the category view with nothing new to say."""
    cards_by_id = {c["card_id"]: c for c in held_cards}
    for c in attributed_cards or []:
        cards_by_id.setdefault(c["card_id"], c)

    by_category: Dict[str, List[Dict[str, Any]]] = {}
    for b in buckets:
        by_category.setdefault(b["category"], []).append(b)
    category_gaps = [
        compute_category_gap(cat, cat_buckets, held_cards, catalog_cards, default_card_id, cards_by_id)
        for cat, cat_buckets in by_category.items()
    ]

    merchants_with_rules = {
        rule["merchant_name"].strip().lower()
        for card in (held_cards + catalog_cards)
        for rule in (card.get("earning_rules") or [])
        if rule.get("merchant_name")
    }

    by_merchant: Dict[str, List[Dict[str, Any]]] = {}
    for b in buckets:
        merchant = b.get("merchant")
        if merchant and merchant.strip().lower() in merchants_with_rules:
            by_merchant.setdefault(merchant, []).append(b)
    merchant_gaps = [
        compute_merchant_gap(m, m_buckets, held_cards, catalog_cards, default_card_id, cards_by_id)
        for m, m_buckets in by_merchant.items()
    ]

    return category_gaps, merchant_gaps
