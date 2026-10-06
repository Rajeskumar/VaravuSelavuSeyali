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
(spec §4.2/§8.3), not filtered here.

Caps: when buckets carry a `month` ("YYYY-MM", see AnalysisService.compute_category_merchant_buckets
by_month=True), spend is priced through a CapLedger. A rule with cap_amount/cap_period earns its rate
only until the cap is used up within that cap window; spend above the cap earns the card's
"All Purchases" rate (or nothing). Without that, an all-time or 12-month view would credit, for
example, 6% on a year of groceries against a $6k/yr cap. Windows are calendar month/quarter/year,
an approximation since the card's anniversary date isn't known. Buckets with no `month` (the
legacy shape, and one-off prospective estimates) are priced uncapped as before, with only the
advisory cap note.
"""
from __future__ import annotations

from dataclasses import dataclass, field
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
    # True when a CapLedger actually limited this estimate (some spend earned the base rate).
    cap_hit: bool = False


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
    earned_raw = _raw_earning(card, spend, multiplier)
    return CardRewardEstimate(
        card_id=card["card_id"],
        card_name=card.get("card_name", ""),
        reward_type=card["reward_type"],
        matched_category_id=rule.get("category_id"),
        matched_merchant_name=rule.get("merchant_name"),
        multiplier=multiplier,
        earned_raw=earned_raw,
        earned_usd=_usd_value(card, earned_raw),
        cap_note=_cap_note(card, rule),
    )


def _raw_earning(card: Dict[str, Any], spend: float, multiplier: float) -> float:
    if card["reward_type"] == "cashback":
        return round(spend * multiplier / 100.0, 2)
    return round(spend * multiplier, 4)


def _usd_value(card: Dict[str, Any], earned_raw: float) -> Optional[float]:
    if card["reward_type"] == "cashback":
        return earned_raw
    point_value = card.get("point_value_estimate_usd")
    return round(earned_raw * point_value, 2) if point_value is not None else None


_PERIOD_LABELS = {"monthly": "month", "quarterly": "quarter", "annual": "year"}


def _cap_window(month: Optional[str], cap_period: Optional[str]) -> Optional[str]:
    """Calendar window a "YYYY-MM" month falls in for a cap period, or None when the cap can't
    be windowed (no month, or an unrecognised period), in which case it stays advisory."""
    if not month or not cap_period or len(month) < 7:
        return None
    period = cap_period.strip().lower()
    if period in ("monthly", "month"):
        return month[:7]
    if period in ("quarterly", "quarter"):
        return f"{month[:4]}-Q{(int(month[5:7]) - 1) // 3 + 1}"
    if period in ("annual", "annually", "yearly", "year"):
        return month[:4]
    return None


class CapLedger:
    """Tracks how much of each (card, rule, cap window) cap has been used, so spend fed through
    `price` in chronological order earns the bonus rate only up to the cap. One ledger should
    price every bucket of a report exactly once; pricing the same spend twice through one ledger
    would consume the cap twice."""

    def __init__(self) -> None:
        self._used: Dict[Tuple[str, str, str], float] = {}

    def price(
        self,
        card: Dict[str, Any],
        category: Optional[str],
        spend: float,
        merchant: Optional[str] = None,
        month: Optional[str] = None,
    ) -> Optional[CardRewardEstimate]:
        _validate_card(card)
        rule = _best_rule(card, category, merchant)
        if rule is None:
            return None
        cap_amount = rule.get("cap_amount")
        window = _cap_window(month, rule.get("cap_period")) if cap_amount is not None else None
        if window is None:
            return estimate_reward(card, category, spend, merchant=merchant)

        rule_key = (rule.get("merchant_name") or "").strip().lower() or f"cat:{rule.get('category_id')}"
        key = (card["card_id"], rule_key, window)
        used = self._used.get(key, 0.0)
        at_rate = max(min(spend, float(cap_amount) - used), 0.0)
        over = round(spend - at_rate, 2)
        self._used[key] = used + at_rate

        multiplier = float(rule["multiplier"])
        base_rule = next((r for r in card.get("earning_rules") or [] if r.get("category_id") == ALL_PURCHASES), None)
        base_multiplier = float(base_rule["multiplier"]) if base_rule is not None and base_rule is not rule else 0.0
        earned_raw = round(_raw_earning(card, at_rate, multiplier) + _raw_earning(card, over, base_multiplier), 4)
        if card["reward_type"] == "cashback":
            earned_raw = round(earned_raw, 2)

        cap_note = None
        if over > 0:
            period = _PERIOD_LABELS.get((rule.get("cap_period") or "").strip().lower(), rule.get("cap_period"))
            scope = f"at {rule['merchant_name']}" if rule.get("merchant_name") else f"on {rule.get('category_id')}"
            cap_note = (
                f"{card.get('card_name', 'This card')}'s {multiplier:g}x/% rate {scope} is capped at "
                f"${float(cap_amount):,.0f}/{period} — ${over:,.0f} earned the base rate"
            )
        blended = (
            round(earned_raw / spend * 100.0, 2) if card["reward_type"] == "cashback" else round(earned_raw / spend, 4)
        ) if spend else multiplier
        return CardRewardEstimate(
            card_id=card["card_id"],
            card_name=card.get("card_name", ""),
            reward_type=card["reward_type"],
            matched_category_id=rule.get("category_id"),
            matched_merchant_name=rule.get("merchant_name"),
            multiplier=blended,
            earned_raw=earned_raw,
            earned_usd=_usd_value(card, earned_raw),
            cap_note=cap_note,
            cap_hit=over > 0,
        )


@dataclass
class PricedBucket:
    """One spend bucket priced against the card actually used for it (attributed, else default).
    `card` is None when no card resolves; `estimate` is None when that card has no matching rule."""
    bucket: Dict[str, Any]
    card: Optional[Dict[str, Any]]
    estimate: Optional[CardRewardEstimate]


def price_actual_buckets(
    buckets: List[Dict[str, Any]],
    default_card: Optional[Dict[str, Any]],
    cards_by_id: Optional[Dict[str, Dict[str, Any]]] = None,
    ledger: Optional[CapLedger] = None,
) -> List[PricedBucket]:
    """Prices every bucket exactly once, oldest month first, so caps are consumed in the order the
    spend happened. Category, merchant and per-card "actual" figures are all aggregated from this
    one result so they can never disagree."""
    cards_by_id = cards_by_id or {}
    ledger = ledger or CapLedger()
    priced: List[PricedBucket] = []
    for b in sorted(buckets, key=lambda b: b.get("month") or ""):
        bucket_card_id = b.get("card_id")
        card = cards_by_id.get(bucket_card_id) if bucket_card_id else default_card
        est = None
        if card is not None:
            est = ledger.price(card, b.get("category"), b["total"], merchant=b.get("merchant"), month=b.get("month"))
        priced.append(PricedBucket(bucket=b, card=card, estimate=est))
    return priced


def _estimate_over_months(
    card: Dict[str, Any], category: Optional[str], merchant: Optional[str], spend_by_month: Dict[str, float],
) -> Optional[CardRewardEstimate]:
    """A single card's hypothetical estimate for spend spread over months, through its own cap
    ledger — the capped counterpart of estimate_reward for "optimal" comparisons."""
    ledger = CapLedger()
    estimates = [
        ledger.price(card, category, spend, merchant=merchant, month=month)
        for month, spend in sorted(spend_by_month.items())
        if spend > 0
    ]
    estimates = [e for e in estimates if e is not None]
    if not estimates:
        return None
    total_spend = sum(spend_by_month.values())
    earned_raw = round(sum(e.earned_raw for e in estimates), 4 if card["reward_type"] != "cashback" else 2)
    notes: List[str] = []
    for e in estimates:
        if e.cap_note and e.cap_note not in notes:
            notes.append(e.cap_note)
    first = estimates[0]
    blended = (
        round(earned_raw / total_spend * 100.0, 2) if card["reward_type"] == "cashback" else round(earned_raw / total_spend, 4)
    ) if total_spend else first.multiplier
    return CardRewardEstimate(
        card_id=card["card_id"],
        card_name=card.get("card_name", ""),
        reward_type=card["reward_type"],
        matched_category_id=first.matched_category_id,
        matched_merchant_name=first.matched_merchant_name,
        multiplier=blended,
        earned_raw=earned_raw,
        earned_usd=_usd_value(card, earned_raw),
        cap_note="; ".join(notes) if notes else None,
        cap_hit=any(e.cap_hit for e in estimates),
    )


def _spend_by_month(buckets: List[Dict[str, Any]]) -> Optional[Dict[str, float]]:
    """Month -> spend, or None if any bucket lacks a month (legacy shape: price uncapped)."""
    by_month: Dict[str, float] = {}
    for b in buckets:
        month = b.get("month")
        if not month:
            return None
        by_month[month] = by_month.get(month, 0.0) + b["total"]
    return by_month or None


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
    return _aggregate_actual(price_actual_buckets(buckets, default_card, cards_by_id))


def _aggregate_actual(priced: List[PricedBucket]) -> Optional[CardRewardEstimate]:
    """Sums already-priced buckets into one "actual earned" estimate (see
    _sum_card_earning_across_buckets for the single- vs multiple-card rules)."""
    total_spend = round(sum(p.bucket["total"] for p in priced), 2)
    if total_spend <= 0:
        return None

    total_earned_raw = 0.0
    total_earned_usd = 0.0
    has_usd = False
    cap_notes: List[str] = []
    matched_any = False
    cap_hit = False
    distinct_cards: Dict[str, Dict[str, Any]] = {}

    for p in priced:
        est = p.estimate
        if p.card is None or est is None:
            continue
        matched_any = True
        distinct_cards[p.card["card_id"]] = p.card
        total_earned_raw += est.earned_raw
        if est.earned_usd is not None:
            total_earned_usd += est.earned_usd
            has_usd = True
        cap_hit = cap_hit or est.cap_hit
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
        cap_hit=cap_hit,
    )


def best_card_for_category(
    cards: List[Dict[str, Any]], category: Optional[str], spend: float, merchant: Optional[str] = None,
    spend_by_month: Optional[Dict[str, float]] = None,
) -> Optional[CardRewardEstimate]:
    """The single highest dollar-value estimate among `cards`. Cards with no dollar-comparable
    estimate (points/miles with no point_value_estimate_usd) are never chosen here, even if
    they'd nominally out-earn in raw points — there's nothing to compare against.

    With `spend_by_month`, each card is priced cap-aware over those months (so "optimal" is
    capped the same way "actual" is); without it, `spend` is priced uncapped as before."""
    if spend_by_month:
        estimates = [_estimate_over_months(c, category, merchant, spend_by_month) for c in cards]
    else:
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
    priced: Optional[List[PricedBucket]] = None,
) -> CategoryRewardGap:
    total_spend = round(sum(b["total"] for b in buckets), 2)
    default_card = next((c for c in held_cards if c["card_id"] == default_card_id), None) if default_card_id else None
    # TS-CARD-114: computed whenever ANY bucket resolves to a real card — either its own
    # attribution or, absent that, the default — not only when a default card exists (a user
    # with no default but some explicitly-attributed spend still gets a real, if partial,
    # actual figure instead of an unconditional None). `priced` (from compute_coach_report's
    # single cap ledger) is used when given so caps shared across categories are honoured.
    actual = _aggregate_actual(priced) if priced is not None else _sum_card_earning_across_buckets(default_card, buckets, cards_by_id)
    # Deliberately simple/category-only — see module docstring for why "optimal" doesn't chase
    # merchant precedence the way "actual" does.
    by_month = _spend_by_month(buckets)
    optimal_in_wallet = best_card_for_category(held_cards, category, total_spend, spend_by_month=by_month) if held_cards else None
    optimal_catalog = best_card_for_category(catalog_cards, category, total_spend, spend_by_month=by_month) if catalog_cards else None

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
    priced: Optional[List[PricedBucket]] = None,
) -> MerchantRewardGap:
    total_spend = round(sum(b["total"] for b in buckets), 2)
    # Fallback category for cards with no rule for this merchant at all — the merchant's largest
    # contributing category, a small documented approximation for the rare case a card without a
    # merchant-specific rule must fall back on a category rule for a merchant spanning several.
    dominant_category = max(buckets, key=lambda b: b["total"])["category"] if buckets else None

    default_card = next((c for c in held_cards if c["card_id"] == default_card_id), None) if default_card_id else None
    actual = _aggregate_actual(priced) if priced is not None else _sum_card_earning_across_buckets(default_card, buckets, cards_by_id)
    by_month = _spend_by_month(buckets)
    optimal_in_wallet = best_card_for_category(held_cards, dominant_category, total_spend, merchant=merchant, spend_by_month=by_month) if held_cards else None
    optimal_catalog = best_card_for_category(catalog_cards, dominant_category, total_spend, merchant=merchant, spend_by_month=by_month) if catalog_cards else None

    return MerchantRewardGap(
        merchant=merchant,
        actual_spend=total_spend,
        actual=actual,
        optimal_in_wallet=optimal_in_wallet,
        optimal_catalog=optimal_catalog,
    )


class CardEarnings(BaseModel):
    """What one card actually earned over the period — the "which card benefited me most" view."""
    card_id: str
    card_name: str
    reward_type: str
    spend: float
    earned_raw: float  # dollars for cashback; points/miles units otherwise
    earned_usd: Optional[float] = None  # None for points/miles cards with no point value
    effective_rate: Optional[float] = None  # earned_usd / spend, as a percent
    top_category: Optional[str] = None
    is_default: bool = False
    still_held: bool = True
    cap_hit: bool = False


@dataclass
class CoachReport:
    category_gaps: List[CategoryRewardGap]
    merchant_gaps: List[MerchantRewardGap]
    by_card: List[CardEarnings] = field(default_factory=list)
    # Spend with no attributed card and no default card to fall back on — earns nothing in the
    # figures above, surfaced so the UI can say so instead of silently dropping it.
    unassigned_spend: float = 0.0
    # Spend with no card recorded that was priced as if it went on the default card. Lets the UI
    # say "assumed on your default card" instead of presenting it as rewards actually earned.
    default_assumed_spend: float = 0.0
    # Spend left out entirely because it's rarely payable by card (see NON_CARD_CATEGORIES).
    excluded_spend: float = 0.0


# Categories most people can't put on a credit card without a fee (rent, mortgage). Counting them
# credited a just-added card with rewards on $10,800 of rent and recommended cards for paying it.
NON_CARD_CATEGORIES = {"rent", "mortgage"}


def compute_card_breakdown(
    priced: List[PricedBucket],
    held_cards: List[Dict[str, Any]],
    default_card_id: Optional[str],
) -> Tuple[List[CardEarnings], float]:
    """Per-card earnings aggregated from the same priced buckets as the category view, ranked by
    dollar value (cards with no dollar value last, then by spend). Held cards with no spend in
    the period are included with zeros so the user sees their whole wallet."""
    held_ids = {c["card_id"] for c in held_cards}
    rows: Dict[str, Dict[str, Any]] = {}
    unassigned = 0.0
    for p in priced:
        if p.card is None:
            unassigned += p.bucket["total"]
            continue
        card = p.card
        row = rows.setdefault(card["card_id"], {
            "card": card, "spend": 0.0, "raw": 0.0, "usd": 0.0, "has_usd": False,
            "by_category": {}, "cap_hit": False,
        })
        row["spend"] += p.bucket["total"]
        if p.estimate is not None:
            row["raw"] += p.estimate.earned_raw
            if p.estimate.earned_usd is not None:
                row["usd"] += p.estimate.earned_usd
                row["has_usd"] = True
            row["cap_hit"] = row["cap_hit"] or p.estimate.cap_hit
            value = p.estimate.earned_usd if p.estimate.earned_usd is not None else p.estimate.earned_raw
            cat = p.bucket.get("category")
            row["by_category"][cat] = row["by_category"].get(cat, 0.0) + value

    for card in held_cards:
        rows.setdefault(card["card_id"], {
            "card": card, "spend": 0.0, "raw": 0.0, "usd": 0.0,
            "has_usd": card["reward_type"] == "cashback" or card.get("point_value_estimate_usd") is not None,
            "by_category": {}, "cap_hit": False,
        })

    result: List[CardEarnings] = []
    for card_id, row in rows.items():
        card = row["card"]
        spend = round(row["spend"], 2)
        earned_usd = round(row["usd"], 2) if row["has_usd"] else None
        top = max(row["by_category"].items(), key=lambda kv: kv[1])[0] if row["by_category"] else None
        result.append(CardEarnings(
            card_id=card_id,
            card_name=card.get("card_name", ""),
            reward_type=card["reward_type"],
            spend=spend,
            earned_raw=round(row["raw"], 2 if card["reward_type"] == "cashback" else 4),
            earned_usd=earned_usd,
            effective_rate=round(earned_usd / spend * 100.0, 2) if earned_usd is not None and spend > 0 else None,
            top_category=top,
            is_default=card_id == default_card_id,
            still_held=card_id in held_ids,
            cap_hit=row["cap_hit"],
        ))
    result.sort(key=lambda r: (r.earned_usd is None, -(r.earned_usd or 0.0), -r.spend))
    return result, round(unassigned, 2)


def compute_coach_report(
    buckets: List[Dict[str, Any]],
    held_cards: List[Dict[str, Any]],
    catalog_cards: List[Dict[str, Any]],
    default_card_id: Optional[str],
    attributed_cards: Optional[List[Dict[str, Any]]] = None,
) -> CoachReport:
    """buckets: [{"category": str, "merchant": Optional[str], "card_id": Optional[str],
    "total": float, "month"?: "YYYY-MM"}, ...] — AnalysisService.compute_category_merchant_buckets's
    shape (with by_month=True for cap-aware pricing).

    `attributed_cards` (TS-CARD-114): engine-shape cards for any card_id appearing on a bucket
    that isn't necessarily still in `held_cards` (the user may have removed it since) — "actual
    earned" reflects the card genuinely used at the time, independent of whether it's still held
    today. Held cards are included automatically; this only needs to cover the gap.

    Every bucket is priced once through a single cap ledger; category, merchant and per-card
    "actual" figures are all aggregated from that. A merchant only gets its own gap row when at
    least one held or catalog card has an explicit rule for it — otherwise the row would just
    repeat the category view with nothing new to say."""
    excluded_spend = round(sum(b["total"] for b in buckets if (b.get("category") or "").strip().lower() in NON_CARD_CATEGORIES), 2)
    buckets = [b for b in buckets if (b.get("category") or "").strip().lower() not in NON_CARD_CATEGORIES]
    cards_by_id = {c["card_id"]: c for c in held_cards}
    for c in attributed_cards or []:
        cards_by_id.setdefault(c["card_id"], c)
    default_card = cards_by_id.get(default_card_id) if default_card_id else None
    priced = price_actual_buckets(buckets, default_card, cards_by_id)
    default_assumed_spend = round(
        sum(p.bucket["total"] for p in priced if not p.bucket.get("card_id") and p.card is not None), 2
    )

    by_category: Dict[str, List[PricedBucket]] = {}
    for p in priced:
        by_category.setdefault(p.bucket["category"], []).append(p)
    category_gaps = [
        compute_category_gap(
            cat, [p.bucket for p in cat_priced], held_cards, catalog_cards, default_card_id, cards_by_id, priced=cat_priced,
        )
        for cat, cat_priced in by_category.items()
    ]
    category_gaps.sort(key=lambda g: g.actual_spend, reverse=True)

    merchants_with_rules = {
        rule["merchant_name"].strip().lower()
        for card in (held_cards + catalog_cards)
        for rule in (card.get("earning_rules") or [])
        if rule.get("merchant_name")
    }

    by_merchant: Dict[str, List[PricedBucket]] = {}
    for p in priced:
        merchant = p.bucket.get("merchant")
        if merchant and merchant.strip().lower() in merchants_with_rules:
            by_merchant.setdefault(merchant, []).append(p)
    merchant_gaps = [
        compute_merchant_gap(
            m, [p.bucket for p in m_priced], held_cards, catalog_cards, default_card_id, cards_by_id, priced=m_priced,
        )
        for m, m_priced in by_merchant.items()
    ]

    by_card, unassigned = compute_card_breakdown(priced, held_cards, default_card_id)
    return CoachReport(
        category_gaps, merchant_gaps, by_card, unassigned,
        default_assumed_spend=default_assumed_spend, excluded_spend=excluded_spend,
    )


def compute_coach_summary(
    buckets: List[Dict[str, Any]],
    held_cards: List[Dict[str, Any]],
    catalog_cards: List[Dict[str, Any]],
    default_card_id: Optional[str],
    attributed_cards: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[List[CategoryRewardGap], List[MerchantRewardGap]]:
    """(category_gaps, merchant_gaps) only — see compute_coach_report for the full report."""
    report = compute_coach_report(buckets, held_cards, catalog_cards, default_card_id, attributed_cards)
    return report.category_gaps, report.merchant_gaps
