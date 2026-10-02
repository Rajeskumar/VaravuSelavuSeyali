"""Card Coach cap enforcement (CapLedger) and the per-card "earned by card" breakdown."""
import pytest

from varavu_selavu_service.services.card_rewards_engine import (
    ALL_PURCHASES,
    CapLedger,
    best_card_for_category,
    compute_coach_report,
    estimate_reward,
)


def _rule(category=None, multiplier=1.0, cap_amount=None, cap_period=None, merchant=None):
    return {
        "category_id": category, "merchant_name": merchant, "multiplier": multiplier,
        "cap_amount": cap_amount, "cap_period": cap_period, "exclusions_note": None,
    }


# 5% on Groceries up to $1,500/quarter, 1% everything else.
CAPPED = {
    "card_id": "capped", "card_name": "Capped Grocery", "reward_type": "cashback",
    "earning_rules": [_rule(ALL_PURCHASES, 1.0), _rule("Groceries", 5.0, 1500, "quarterly")],
}
FLAT2 = {
    "card_id": "flat2", "card_name": "Flat 2%", "reward_type": "cashback",
    "earning_rules": [_rule(ALL_PURCHASES, 2.0)],
}


def _b(category, total, month, card_id=None, merchant=None):
    return {"category": category, "merchant": merchant, "card_id": card_id, "total": total, "month": month}


def test_quarterly_cap_limits_bonus_then_base_rate():
    ledger = CapLedger()
    ests = [ledger.price(CAPPED, "Groceries", 1000, month=m) for m in ("2026-01", "2026-02", "2026-03")]
    # $1,500 at 5% = $75, remaining $1,500 at 1% = $15.
    assert sum(e.earned_usd for e in ests) == pytest.approx(90.0)
    assert [e.cap_hit for e in ests] == [False, True, True]
    assert "capped at $1,500/quarter" in ests[1].cap_note


def test_cap_resets_each_quarter():
    ledger = CapLedger()
    a = ledger.price(CAPPED, "Groceries", 1500, month="2026-03")
    b = ledger.price(CAPPED, "Groceries", 1500, month="2026-04")
    assert a.earned_usd == pytest.approx(75.0) and b.earned_usd == pytest.approx(75.0)
    assert not a.cap_hit and not b.cap_hit


def test_annual_and_monthly_windows():
    annual = {**CAPPED, "earning_rules": [_rule(ALL_PURCHASES, 1.0), _rule("Groceries", 6.0, 6000, "annual")]}
    ledger = CapLedger()
    total = sum(ledger.price(annual, "Groceries", 1000, month=f"2026-{m:02d}").earned_usd for m in range(1, 13))
    assert total == pytest.approx(6000 * 0.06 + 6000 * 0.01)

    monthly = {**CAPPED, "earning_rules": [_rule(ALL_PURCHASES, 1.0), _rule("Groceries", 5.0, 500, "monthly")]}
    ledger = CapLedger()
    assert ledger.price(monthly, "Groceries", 800, month="2026-01").earned_usd == pytest.approx(25 + 3)
    assert ledger.price(monthly, "Groceries", 500, month="2026-02").earned_usd == pytest.approx(25)


def test_no_base_rule_earns_nothing_over_cap():
    card = {**CAPPED, "earning_rules": [_rule("Groceries", 5.0, 1500, "quarterly")]}
    assert CapLedger().price(card, "Groceries", 2000, month="2026-01").earned_usd == pytest.approx(75.0)


def test_cap_on_all_purchases_rule_itself_earns_nothing_over_cap():
    card = {**FLAT2, "earning_rules": [_rule(ALL_PURCHASES, 2.0, 1000, "annual")]}
    assert CapLedger().price(card, "Travel", 1500, month="2026-01").earned_usd == pytest.approx(20.0)


def test_cap_shared_across_categories_hitting_the_same_rule():
    card = {**FLAT2, "earning_rules": [_rule(ALL_PURCHASES, 2.0, 1000, "annual")]}
    report = compute_coach_report(
        [_b("Travel", 800, "2026-01"), _b("Shopping", 800, "2026-02")], [card], [], "flat2",
    )
    earned = {g.category: g.actual.earned_usd for g in report.category_gaps}
    assert earned == {"Travel": pytest.approx(16.0), "Shopping": pytest.approx(4.0)}


def test_monthless_buckets_stay_uncapped_legacy():
    est = estimate_reward(CAPPED, "Groceries", 3000)
    assert est.earned_usd == pytest.approx(150.0)
    assert "you may have exceeded" in est.cap_note
    report = compute_coach_report(
        [{"category": "Groceries", "merchant": None, "card_id": None, "total": 3000}], [CAPPED], [], "capped",
    )
    assert report.category_gaps[0].actual.earned_usd == pytest.approx(150.0)


def test_optimal_is_capped_like_actual():
    by_month = {"2026-01": 1000, "2026-02": 1000, "2026-03": 1000}
    best = best_card_for_category([CAPPED, FLAT2], "Groceries", 3000, spend_by_month=by_month)
    # Capped card earns $90 over the quarter, flat 2% earns $60 — capped still wins, at $90 not $150.
    assert best.card_id == "capped" and best.earned_usd == pytest.approx(90.0)
    big = {m: 3000 for m in by_month}
    best = best_card_for_category([CAPPED, FLAT2], "Groceries", 9000, spend_by_month=big)
    # $75 + $75 base = $150 vs flat $180: flat wins once the cap is accounted for.
    assert best.card_id == "flat2"


def test_breakdown_ranks_cards_and_matches_category_totals():
    buckets = [
        _b("Groceries", 1000, "2026-01"),                     # default (capped) card
        _b("Groceries", 1000, "2026-02"),
        _b("Travel", 2000, "2026-02", card_id="flat2"),       # attributed
        _b("Dining out", 100, "2026-03", card_id="flat2"),
    ]
    report = compute_coach_report(buckets, [CAPPED, FLAT2], [], "capped")
    by_card = {c.card_id: c for c in report.by_card}
    assert by_card["capped"].earned_usd == pytest.approx(75 + 5)  # $1,500 at 5% + $500 at 1%
    assert by_card["capped"].cap_hit and by_card["capped"].is_default
    assert by_card["flat2"].earned_usd == pytest.approx(42.0)
    assert by_card["flat2"].top_category == "Travel"
    assert by_card["flat2"].effective_rate == pytest.approx(2.0)
    assert [c.card_id for c in report.by_card] == ["capped", "flat2"]
    category_total = sum(g.actual.earned_usd for g in report.category_gaps if g.actual)
    assert category_total == pytest.approx(sum(c.earned_usd for c in report.by_card))


def test_unassigned_spend_reported_and_unused_held_cards_listed():
    buckets = [_b("Groceries", 120, "2026-01"), _b("Travel", 80, "2026-01", card_id="flat2")]
    report = compute_coach_report(buckets, [CAPPED, FLAT2], [], default_card_id=None)
    assert report.unassigned_spend == pytest.approx(120)
    by_card = {c.card_id: c for c in report.by_card}
    assert by_card["flat2"].earned_usd == pytest.approx(1.6)
    assert by_card["capped"].spend == 0 and by_card["capped"].earned_usd == 0


def test_points_card_without_value_sorts_last():
    points = {"card_id": "pts", "card_name": "Points", "reward_type": "points", "earning_rules": [_rule(ALL_PURCHASES, 3.0)]}
    report = compute_coach_report(
        [_b("Travel", 1000, "2026-01", card_id="pts"), _b("Travel", 10, "2026-01", card_id="flat2")],
        [points, FLAT2], [], None,
    )
    assert [c.card_id for c in report.by_card] == ["flat2", "pts"]
    assert report.by_card[1].earned_usd is None and report.by_card[1].earned_raw == pytest.approx(3000)
