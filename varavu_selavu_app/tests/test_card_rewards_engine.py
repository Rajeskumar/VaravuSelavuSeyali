import pytest

from varavu_selavu_service.services.card_rewards_engine import (
    ALL_PURCHASES,
    RewardsEngineError,
    estimate_reward,
    best_card_for_category,
    compute_category_gap,
    compute_merchant_gap,
    compute_coach_summary,
)

CASHBACK_CARD = {
    "card_id": "c1",
    "card_name": "Blue Cash Preferred",
    "reward_type": "cashback",
    "earning_rules": [
        {"category_id": ALL_PURCHASES, "multiplier": 1.0, "cap_amount": None, "cap_period": None, "exclusions_note": None},
        {"category_id": "Groceries", "multiplier": 6.0, "cap_amount": 6000, "cap_period": "annual", "exclusions_note": "excludes superstores and warehouse clubs"},
    ],
}

FLAT_CASHBACK_CARD = {
    "card_id": "c2",
    "card_name": "Chase Freedom Unlimited",
    "reward_type": "cashback",
    "earning_rules": [
        {"category_id": ALL_PURCHASES, "multiplier": 1.5, "cap_amount": None, "cap_period": None, "exclusions_note": None},
    ],
}

POINTS_CARD_WITH_VALUE = {
    "card_id": "c3",
    "card_name": "Chase Sapphire Preferred",
    "reward_type": "points",
    "point_value_estimate_usd": 0.0125,
    "earning_rules": [
        {"category_id": ALL_PURCHASES, "multiplier": 1.0, "cap_amount": None, "cap_period": None, "exclusions_note": None},
        {"category_id": "Dining out", "multiplier": 3.0, "cap_amount": None, "cap_period": None, "exclusions_note": None},
    ],
}

POINTS_CARD_NO_VALUE = {
    "card_id": "c4",
    "card_name": "Mystery Points Card",
    "reward_type": "miles",
    "point_value_estimate_usd": None,
    "earning_rules": [
        {"category_id": ALL_PURCHASES, "multiplier": 5.0, "cap_amount": None, "cap_period": None, "exclusions_note": None},
    ],
}

NO_RULES_CARD = {
    "card_id": "c5",
    "card_name": "No Rules Card",
    "reward_type": "cashback",
    "earning_rules": [],
}

# TS-CARD-113: merchant-specific rules
APPLE_CARD = {
    "card_id": "c6",
    "card_name": "Apple Card",
    "reward_type": "cashback",
    "earning_rules": [
        {"category_id": ALL_PURCHASES, "multiplier": 1.0, "cap_amount": None, "cap_period": None, "exclusions_note": None},
        {"category_id": None, "merchant_name": "Apple", "multiplier": 3.0, "cap_amount": None, "cap_period": None, "exclusions_note": None},
    ],
}

TRAVEL_PORTAL_CARD = {
    "card_id": "c7",
    "card_name": "Chase Sapphire-like",
    "reward_type": "cashback",
    "earning_rules": [
        {"category_id": ALL_PURCHASES, "multiplier": 1.0, "cap_amount": None, "cap_period": None, "exclusions_note": None},
        {"category_id": "Plane", "multiplier": 2.0, "cap_amount": None, "cap_period": None, "exclusions_note": None},
        {"category_id": None, "merchant_name": "Chase Travel", "multiplier": 5.0, "cap_amount": None, "cap_period": None, "exclusions_note": None},
    ],
}


def test_exact_category_match_wins_over_all_purchases():
    est = estimate_reward(CASHBACK_CARD, "Groceries", 100.0)
    assert est.matched_category_id == "Groceries"
    assert est.multiplier == 6.0
    assert est.earned_raw == 6.0
    assert est.earned_usd == 6.0


def test_falls_back_to_all_purchases_when_no_exact_match():
    est = estimate_reward(CASHBACK_CARD, "Dining out", 100.0)
    assert est.matched_category_id == ALL_PURCHASES
    assert est.multiplier == 1.0
    assert est.earned_usd == 1.0


def test_no_applicable_rule_returns_none():
    assert estimate_reward(NO_RULES_CARD, "Groceries", 100.0) is None


def test_points_card_with_value_converts_to_usd():
    est = estimate_reward(POINTS_CARD_WITH_VALUE, "Dining out", 100.0)
    assert est.matched_category_id == "Dining out"
    assert est.multiplier == 3.0
    assert est.earned_raw == 300.0  # 3 points/dollar * $100
    assert est.earned_usd == pytest.approx(3.75)  # 300 points * $0.0125


def test_points_card_without_value_has_no_usd_estimate():
    est = estimate_reward(POINTS_CARD_NO_VALUE, "Anything", 100.0)
    assert est.earned_raw == 500.0  # 5 miles/dollar
    assert est.earned_usd is None


def test_cap_note_includes_amount_and_exclusions():
    est = estimate_reward(CASHBACK_CARD, "Groceries", 100.0)
    assert "6000" in est.cap_note or "$6,000" in est.cap_note
    assert "annual" in est.cap_note
    assert "superstores" in est.cap_note


def test_no_cap_note_when_uncapped():
    est = estimate_reward(FLAT_CASHBACK_CARD, "Groceries", 100.0)
    assert est.cap_note is None


def test_invalid_card_shape_raises():
    with pytest.raises(RewardsEngineError):
        estimate_reward({"card_id": "x", "reward_type": "bitcoin", "earning_rules": []}, "Groceries", 10.0)


def test_best_card_for_category_picks_highest_dollar_value():
    best = best_card_for_category([CASHBACK_CARD, FLAT_CASHBACK_CARD], "Groceries", 100.0)
    assert best.card_id == "c1"  # 6% beats 1.5%


def test_best_card_for_category_excludes_points_cards_without_value():
    best = best_card_for_category([POINTS_CARD_NO_VALUE, FLAT_CASHBACK_CARD], "Groceries", 100.0)
    assert best.card_id == "c2"


def test_best_card_for_category_returns_none_when_nothing_comparable():
    assert best_card_for_category([POINTS_CARD_NO_VALUE, NO_RULES_CARD], "Groceries", 100.0) is None


def test_best_card_for_category_empty_list():
    assert best_card_for_category([], "Groceries", 100.0) is None


# --- TS-CARD-113: merchant precedence ---

def test_merchant_rule_wins_over_category_rule():
    est = estimate_reward(APPLE_CARD, "Electronics", 100.0, merchant="Apple")
    assert est.matched_merchant_name == "Apple"
    assert est.matched_category_id is None
    assert est.multiplier == 3.0


def test_merchant_match_is_case_insensitive():
    est = estimate_reward(APPLE_CARD, "Electronics", 100.0, merchant="APPLE")
    assert est.matched_merchant_name == "Apple"
    assert est.multiplier == 3.0


def test_falls_back_to_category_when_merchant_has_no_rule():
    est = estimate_reward(APPLE_CARD, "Groceries", 100.0, merchant="Whole Foods")
    assert est.matched_merchant_name is None
    assert est.matched_category_id == ALL_PURCHASES  # no "Groceries" rule on this card either


def test_merchant_rule_wins_even_when_category_rule_also_exists_and_is_lower():
    # "Plane" category = 2x, but "Chase Travel" merchant = 5x — merchant must win regardless of
    # which is numerically bigger; it's about specificity, not magnitude.
    est = estimate_reward(TRAVEL_PORTAL_CARD, "Plane", 100.0, merchant="Chase Travel")
    assert est.matched_merchant_name == "Chase Travel"
    assert est.multiplier == 5.0


def test_no_merchant_given_falls_back_to_category_even_if_card_has_merchant_rules():
    est = estimate_reward(APPLE_CARD, "Electronics", 100.0, merchant=None)
    assert est.matched_merchant_name is None
    assert est.matched_category_id == ALL_PURCHASES


# --- compute_category_gap (bucket-aware "actual", simple "optimal") ---

def test_compute_category_gap_full_picture():
    held = [FLAT_CASHBACK_CARD, CASHBACK_CARD]
    catalog = [FLAT_CASHBACK_CARD, CASHBACK_CARD, POINTS_CARD_WITH_VALUE]
    buckets = [{"category": "Groceries", "merchant": None, "total": 612.40}]

    gap = compute_category_gap("Groceries", buckets, held, catalog, default_card_id="c2")

    assert gap.actual.card_id == "c2"  # user's default card
    assert gap.actual.earned_usd == pytest.approx(9.186, abs=0.01)  # 1.5% of 612.40
    assert gap.optimal_in_wallet.card_id == "c1"  # best of held cards (6%)
    assert gap.optimal_catalog.card_id == "c1"
    assert gap.gap_usd > 0


def test_compute_category_gap_actual_uses_merchant_rule_for_default_card():
    """The Option B correctness fix: a category's "actual" figure must reflect a merchant
    carve-out on the default card, not silently apply the category rate to everything."""
    buckets = [
        {"category": "Electronics", "merchant": "Apple", "total": 100.0},
        {"category": "Electronics", "merchant": "Best Buy", "total": 50.0},
    ]
    gap = compute_category_gap("Electronics", buckets, [APPLE_CARD], [APPLE_CARD], default_card_id="c6")
    # Apple bucket: 3% of 100 = 3.00 (merchant rule). Best Buy bucket: 1% of 50 = 0.50 (flat fallback).
    assert gap.actual.earned_usd == pytest.approx(3.50)
    assert gap.actual_spend == 150.0
    # Blended effective rate = 3.50 / 150 * 100 = 2.333...%
    assert gap.actual.multiplier == pytest.approx(2.33, abs=0.01)
    # No single rule "the" match for a bucket-summed estimate.
    assert gap.actual.matched_category_id is None
    assert gap.actual.matched_merchant_name is None


def test_compute_category_gap_no_default_card_means_no_actual():
    buckets = [{"category": "Groceries", "merchant": None, "total": 100.0}]
    gap = compute_category_gap("Groceries", buckets, [CASHBACK_CARD], [CASHBACK_CARD], default_card_id=None)
    assert gap.actual is None
    assert gap.optimal_in_wallet is not None
    assert gap.gap_usd == 0.0


def test_compute_category_gap_no_held_cards():
    buckets = [{"category": "Groceries", "merchant": None, "total": 100.0}]
    gap = compute_category_gap("Groceries", buckets, [], [CASHBACK_CARD], default_card_id=None)
    assert gap.actual is None
    assert gap.optimal_in_wallet is None
    assert gap.optimal_catalog is not None
    assert gap.gap_usd == 0.0


def test_gap_usd_never_negative():
    buckets = [{"category": "Groceries", "merchant": None, "total": 100.0}]
    gap = compute_category_gap("Groceries", buckets, [CASHBACK_CARD], [CASHBACK_CARD], default_card_id="c1")
    assert gap.actual.card_id == gap.optimal_in_wallet.card_id == "c1"
    assert gap.gap_usd == 0.0


# --- compute_merchant_gap ---

def test_compute_merchant_gap_basic():
    buckets = [{"category": "Electronics", "merchant": "Apple", "total": 100.0}]
    gap = compute_merchant_gap("Apple", buckets, [APPLE_CARD], [APPLE_CARD], default_card_id="c6")
    assert gap.merchant == "Apple"
    assert gap.actual.earned_usd == 3.0  # merchant rule, not the 1% flat rate
    assert gap.optimal_in_wallet.card_id == "c6"
    assert gap.optimal_in_wallet.earned_usd == 3.0


def test_compute_merchant_gap_optimal_excludes_cards_without_the_merchant_rule():
    buckets = [{"category": "Electronics", "merchant": "Apple", "total": 100.0}]
    gap = compute_merchant_gap("Apple", buckets, [APPLE_CARD, FLAT_CASHBACK_CARD], [APPLE_CARD, FLAT_CASHBACK_CARD], default_card_id="c2")
    # Default card (FLAT_CASHBACK_CARD) has no Apple rule and no Electronics rule -> flat 1.5%.
    assert gap.actual.earned_usd == pytest.approx(1.5)
    # Optimal correctly finds Apple Card's 3% merchant rule beats Freedom Unlimited's flat 1.5%.
    assert gap.optimal_in_wallet.card_id == "c6"
    assert gap.gap_usd == pytest.approx(1.5)


# --- compute_coach_summary ---

def test_compute_coach_summary_splits_category_and_merchant_gaps():
    buckets = [
        {"category": "Electronics", "merchant": "Apple", "total": 100.0},
        {"category": "Electronics", "merchant": "Best Buy", "total": 50.0},
        {"category": "Dining out", "merchant": None, "total": 40.0},
    ]
    held = [APPLE_CARD]
    category_gaps, merchant_gaps = compute_coach_summary(buckets, held, held, default_card_id="c6")

    categories = {g.category for g in category_gaps}
    assert categories == {"Electronics", "Dining out"}

    # Only "Apple" gets a merchant row — it's the only merchant any held/catalog card has an
    # explicit rule for. "Best Buy" has spend but no card rule references it, so no row.
    merchants = {g.merchant for g in merchant_gaps}
    assert merchants == {"Apple"}


def test_compute_coach_summary_no_merchant_rows_when_no_card_has_merchant_rules():
    buckets = [{"category": "Groceries", "merchant": "Whole Foods", "total": 100.0}]
    category_gaps, merchant_gaps = compute_coach_summary(buckets, [CASHBACK_CARD], [CASHBACK_CARD], default_card_id="c1")
    assert len(category_gaps) == 1
    assert merchant_gaps == []


# --- TS-CARD-114: per-expense card attribution in "actual earned" ---

def test_unattributed_buckets_fall_back_to_default_card_unchanged():
    """A user who never uses the card picker (every bucket unattributed) must get byte-identical
    output to the pre-TS-CARD-114 default-card-only behavior."""
    buckets = [{"category": "Groceries", "merchant": None, "card_id": None, "total": 100.0}]
    gap = compute_category_gap("Groceries", buckets, [CASHBACK_CARD], [CASHBACK_CARD], default_card_id="c1")
    assert gap.actual.card_id == "c1"
    assert gap.actual.earned_usd == 6.0


def test_bucket_attribution_overrides_default_card():
    # Default is the 1.5% flat card, but this $100 of Groceries was actually put on the 6% card.
    buckets = [{"category": "Groceries", "merchant": None, "card_id": "c1", "total": 100.0}]
    cards_by_id = {"c1": CASHBACK_CARD, "c2": FLAT_CASHBACK_CARD}
    gap = compute_category_gap("Groceries", buckets, [CASHBACK_CARD, FLAT_CASHBACK_CARD], [], default_card_id="c2", cards_by_id=cards_by_id)
    assert gap.actual.card_id == "c1"
    assert gap.actual.earned_usd == 6.0  # 6% of $100 on the attributed card, not 1.5% of the default


def test_partial_attribution_without_any_default_card():
    """No default card set at all, but one bucket is explicitly attributed — actual should still
    be computed from just that attributed spend, not unconditionally None."""
    buckets = [{"category": "Groceries", "merchant": None, "card_id": "c1", "total": 100.0}]
    cards_by_id = {"c1": CASHBACK_CARD}
    gap = compute_category_gap("Groceries", buckets, [CASHBACK_CARD], [], default_card_id=None, cards_by_id=cards_by_id)
    assert gap.actual is not None
    assert gap.actual.card_id == "c1"
    assert gap.actual.earned_usd == 6.0


def test_unattributed_bucket_with_no_default_contributes_nothing_but_attributed_ones_still_count():
    buckets = [
        {"category": "Groceries", "merchant": None, "card_id": "c1", "total": 100.0},
        {"category": "Groceries", "merchant": None, "card_id": None, "total": 900.0},
    ]
    cards_by_id = {"c1": CASHBACK_CARD}
    gap = compute_category_gap("Groceries", buckets, [CASHBACK_CARD], [], default_card_id=None, cards_by_id=cards_by_id)
    # Only the $100 attributed bucket contributes — the $900 unattributed bucket has nothing to
    # fall back on (no default) and is silently skipped, same tolerance "actual" always had for
    # partial rule coverage.
    assert gap.actual.earned_usd == 6.0
    assert gap.actual_spend == 1000.0  # the gap's own total spend is still the full, true amount


def test_mixed_card_attribution_reports_blended_usd_under_multiple_cards_label():
    buckets = [
        {"category": "Groceries", "merchant": None, "card_id": "c1", "total": 100.0},  # 6% -> $6
        {"category": "Groceries", "merchant": None, "card_id": "c2", "total": 100.0},  # 1.5% -> $1.5
    ]
    cards_by_id = {"c1": CASHBACK_CARD, "c2": FLAT_CASHBACK_CARD}
    gap = compute_category_gap("Groceries", buckets, [CASHBACK_CARD, FLAT_CASHBACK_CARD], [], default_card_id="c1", cards_by_id=cards_by_id)
    assert gap.actual.card_name == "Multiple cards"
    assert gap.actual.earned_usd == pytest.approx(7.5)
    # earned_raw aliases to the dollar total for a mixed blend — raw points/cashback units
    # aren't comparable across different physical cards, so no other number would be honest.
    assert gap.actual.earned_raw == pytest.approx(7.5)


def test_mixed_attribution_with_no_dollar_comparable_card_returns_none():
    """Both attributed cards are points/miles with no point_value_estimate_usd — nothing
    comparable can be summed across them, so the blend must be None, not a fabricated raw sum."""
    other_points_card_no_value = {
        "card_id": "c8", "card_name": "Other Miles Card", "reward_type": "miles",
        "point_value_estimate_usd": None,
        "earning_rules": [{"category_id": ALL_PURCHASES, "multiplier": 2.0, "cap_amount": None, "cap_period": None, "exclusions_note": None}],
    }
    buckets = [
        {"category": "Travel", "merchant": None, "card_id": "c4", "total": 100.0},
        {"category": "Travel", "merchant": None, "card_id": "c8", "total": 100.0},
    ]
    cards_by_id = {"c4": POINTS_CARD_NO_VALUE, "c8": other_points_card_no_value}
    gap = compute_category_gap("Travel", buckets, [POINTS_CARD_NO_VALUE, other_points_card_no_value], [], default_card_id=None, cards_by_id=cards_by_id)
    assert gap.actual is None


def test_attributed_card_no_longer_held_still_resolves_via_cards_by_id():
    """The user removed this card from their wallet since the expense was logged — held_cards no
    longer contains it, but cards_by_id (which compute_coach_gaps fills from a direct catalog
    lookup for exactly this case) still resolves it. "Actual earned" reflects history, not the
    current wallet."""
    buckets = [{"category": "Groceries", "merchant": None, "card_id": "c1", "total": 100.0}]
    cards_by_id = {"c1": CASHBACK_CARD}  # not in held_cards below
    gap = compute_category_gap("Groceries", buckets, [FLAT_CASHBACK_CARD], [], default_card_id="c2", cards_by_id=cards_by_id)
    assert gap.actual.card_id == "c1"
    assert gap.actual.earned_usd == 6.0


def test_compute_coach_summary_builds_cards_by_id_from_held_and_attributed():
    buckets = [{"category": "Groceries", "merchant": None, "card_id": "c1", "total": 100.0}]
    # c1 (CASHBACK_CARD) isn't held — only reachable via attributed_cards.
    category_gaps, _ = compute_coach_summary(
        buckets, held_cards=[FLAT_CASHBACK_CARD], catalog_cards=[], default_card_id="c2",
        attributed_cards=[CASHBACK_CARD],
    )
    groceries_gap = next(g for g in category_gaps if g.category == "Groceries")
    assert groceries_gap.actual.card_id == "c1"
    assert groceries_gap.actual.earned_usd == 6.0
