import pytest

from varavu_selavu_service.services.card_rewards_engine import (
    ALL_PURCHASES,
    RewardsEngineError,
    estimate_reward,
    best_card_for_category,
    compute_category_gap,
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
    # POINTS_CARD_NO_VALUE would nominally "earn" 500 miles (uncomparable) vs FLAT_CASHBACK_CARD's $1.50 —
    # must never be selected since there's no dollar figure to compare.
    best = best_card_for_category([POINTS_CARD_NO_VALUE, FLAT_CASHBACK_CARD], "Groceries", 100.0)
    assert best.card_id == "c2"


def test_best_card_for_category_returns_none_when_nothing_comparable():
    assert best_card_for_category([POINTS_CARD_NO_VALUE, NO_RULES_CARD], "Groceries", 100.0) is None


def test_best_card_for_category_empty_list():
    assert best_card_for_category([], "Groceries", 100.0) is None


def test_compute_category_gap_full_picture():
    held = [FLAT_CASHBACK_CARD, CASHBACK_CARD]
    catalog = [FLAT_CASHBACK_CARD, CASHBACK_CARD, POINTS_CARD_WITH_VALUE]

    gap = compute_category_gap("Groceries", 612.40, held, catalog, default_card_id="c2")

    assert gap.actual.card_id == "c2"  # user's default card
    assert gap.actual.earned_usd == pytest.approx(9.186, abs=0.01)  # 1.5% of 612.40
    assert gap.optimal_in_wallet.card_id == "c1"  # best of held cards (6%)
    assert gap.optimal_catalog.card_id == "c1"  # still best across catalog for groceries
    assert gap.gap_usd > 0  # optimal in wallet beats what was actually used


def test_compute_category_gap_no_default_card_means_no_actual():
    gap = compute_category_gap("Groceries", 100.0, [CASHBACK_CARD], [CASHBACK_CARD], default_card_id=None)
    assert gap.actual is None
    assert gap.optimal_in_wallet is not None
    assert gap.gap_usd == 0.0  # can't compute a gap without an "actual" baseline


def test_compute_category_gap_no_held_cards():
    gap = compute_category_gap("Groceries", 100.0, [], [CASHBACK_CARD], default_card_id=None)
    assert gap.actual is None
    assert gap.optimal_in_wallet is None
    assert gap.optimal_catalog is not None
    assert gap.gap_usd == 0.0


def test_gap_usd_never_negative():
    # default card happens to already be the best one held -> gap is exactly 0, not negative
    gap = compute_category_gap("Groceries", 100.0, [CASHBACK_CARD], [CASHBACK_CARD], default_card_id="c1")
    assert gap.actual.card_id == gap.optimal_in_wallet.card_id == "c1"
    assert gap.gap_usd == 0.0


def test_compute_coach_summary_multiple_categories():
    category_totals = [
        {"category": "Groceries", "total": 612.40},
        {"category": "Dining out", "total": 200.0},
    ]
    held = [FLAT_CASHBACK_CARD, CASHBACK_CARD, POINTS_CARD_WITH_VALUE]
    results = compute_coach_summary(category_totals, held, held, default_card_id="c2")

    assert len(results) == 2
    assert results[0].category == "Groceries"
    assert results[1].category == "Dining out"
    # Dining out: no card has an exact "Dining out" rule except the points card (3x, $0.0125/pt = 3.75%),
    # which should beat both flat cashback options (1% / 1.5%).
    assert results[1].optimal_in_wallet.card_id == "c3"
