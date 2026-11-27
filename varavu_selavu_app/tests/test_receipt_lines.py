"""TS-FIX-102: paid-price receipt lines (services/receipt_lines.py)."""
from decimal import Decimal

import pytest

from varavu_selavu_service.services import receipt_lines as rl


def _norm(items, **header):
    return rl.normalize_scan(header, items)


def _prices(items):
    return [(i["line_total"], i["discount"], i["original_price"]) for i in items]


# S-05
def test_coupon_folds_into_the_line_above():
    header, items, review, _ = _norm([{"item_name": "Milk", "line_total": 10.00},
                                      {"item_name": "MFR CPN", "line_total": -2.00}])
    assert _prices(items) == [(8.0, 2.0, 10.0)]
    assert header["discount"] == 0 and header["savings"] == 2.0 and review == []


# S-06
def test_whole_receipt_discount_is_divided_by_price_cent_exact():
    header, items, _, _ = _norm([{"item_name": "A", "line_total": 10.00}, {"item_name": "B", "line_total": 20.00}],
                                discount=3.00)
    assert _prices(items) == [(9.0, 1.0, 10.0), (18.0, 2.0, 20.0)]
    assert header["discount"] == 0 and header["savings"] == 3.0

    _, items, _, _ = _norm([{"item_name": n, "line_total": 1.00} for n in "ABC"], discount=1.00)
    assert sum(Decimal(str(i["discount"])) for i in items) == Decimal("1.00")
    assert sorted(i["line_total"] for i in items) == [0.66, 0.67, 0.67]


# S-07
def test_coupon_with_no_line_above_or_too_large_is_divided_by_price():
    _, items, _, _ = _norm([{"item_name": "Coupon", "line_total": -3.00},
                            {"item_name": "A", "line_total": 10.00}, {"item_name": "B", "line_total": 20.00}])
    assert _prices(items) == [(9.0, 1.0, 10.0), (18.0, 2.0, 20.0)]

    _, items, _, _ = _norm([{"item_name": "A", "line_total": 6.00}, {"item_name": "B", "line_total": 3.00},
                            {"item_name": "Coupon", "line_total": -5.00}])
    assert sum(Decimal(str(i["line_total"])) for i in items) == Decimal("4.00")
    assert all(i["line_total"] >= 0 for i in items)


def test_free_item_stays_zero_and_nothing_goes_negative():
    _, items, _, warnings = _norm([{"item_name": "Free bag", "line_total": 0.00},
                                   {"item_name": "A", "line_total": 3.00}], discount=10.00)
    assert all(i["line_total"] >= 0 and i["discount"] >= 0 for i in items)
    assert items[0]["line_total"] == 0.0
    assert any("larger than the items" in w for w in warnings)


def test_parser_negative_adjustment_line_is_treated_as_a_discount():
    _, items, review, _ = _norm([{"item_name": "A", "line_total": 10.00},
                                 {"item_name": "Receipt adjustment", "line_total": -1.00}])
    assert _prices(items) == [(9.0, 1.0, 10.0)] and review == []


def test_scanned_line_discount_is_subtracted_once_and_unit_price_is_paid():
    _, items, _, _ = _norm([{"item_name": "Soda", "quantity": 2, "unit_price": 5.00, "line_total": 10.00,
                             "discount": 2.00}])
    assert _prices(items) == [(8.0, 2.0, 10.0)]
    assert items[0]["unit_price"] == 4.0  # price history reads the paid unit price (AC-006)


# S-20
def test_refunds_are_listed_for_review_not_folded():
    _, items, review, warnings = _norm([
        {"item_name": "Shirt", "line_total": 20.00},
        {"item_name": "RETURN SHIRT", "line_total": -15.00},
        {"item_name": "BOTTLE DEPOSIT REFUND", "line_total": -0.10},
        {"item_name": "Store credit", "line_total": -1.00, "is_refund": True},
    ])
    assert _prices(items) == [(20.0, 0.0, 20.0)]
    assert [r["item_name"] for r in review] == ["RETURN SHIRT", "BOTTLE DEPOSIT REFUND", "Store credit"]
    assert all(r["amount"] > 0 and r["reason"] == "refund" for r in review)
    assert any("Returns or refunds" in w for w in warnings)


def test_totals_rule_has_no_discount_term():
    items = [{"line_total": "8.00", "discount": "2.00"}]
    assert rl.reconcile_totals(items, "8.00")["reconciled"]
    assert not rl.reconcile_totals(items, "6.00")["reconciled"]
    assert rl.reconcile_totals(items, "8.02")["reconciled"]
    assert not rl.reconcile_totals(items, "8.03")["reconciled"]


@pytest.mark.parametrize("group,expected", [
    (False, [(9.0, 1.0, 10.0), (18.0, 2.0, 20.0)]),  # personal: header discount only
    (True, [(8.0, 2.0, 10.0), (20.0, 0.0, 20.0)]),   # group: line discounts only
])
def test_legacy_conversion_replays_the_old_arithmetic(group, expected):
    items = [{"item_name": "A", "line_total": 10.00, "discount": 2.00 if group else 0},
             {"item_name": "B", "line_total": 20.00, "discount": 0}]
    out = rl.convert_legacy(items, 0 if group else 3.00, line_discounts=group)
    assert _prices(out) == expected


def test_distribute_cents_is_exact():
    for total in (1, 7, 100, 9999):
        for weights in ([1, 1, 1], [3, 0, 7], [0, 0], [5]):
            assert sum(rl.distribute_cents(total, weights)) == total


def test_unreadable_scanned_numbers_never_crash_a_scan():
    # SEC-2: AI/OCR output like "$3.99", NaN or Infinity is flagged, not a 500 after the quota is charged.
    _, items, _, warnings = _norm([{"item_name": "A", "line_total": "$3.99"}, {"item_name": "B", "line_total": float("nan")},
                                   {"item_name": "C", "line_total": float("inf")}, "junk", {"item_name": "D", "line_total": 2.0}],
                                  discount="abc")
    assert [i["item_name"] for i in items] == ["D"]
    assert len([w for w in warnings if "Could not read" in w]) == 4
