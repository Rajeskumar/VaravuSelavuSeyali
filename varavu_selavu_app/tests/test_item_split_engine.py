import pytest
from decimal import Decimal
from varavu_selavu_service.services.split_engine import SplitError
from varavu_selavu_service.services.item_split_engine import resolve_itemized_split

def test_resolve_itemized_split_simple():
    items = [
        {"item_name": "Steak", "line_total": 40.0, "member_ratios": {"A": 1.0}},
        {"item_name": "Salad", "line_total": 20.0, "member_ratios": {"B": 1.0}},
        {"item_name": "Wine", "line_total": 30.0, "member_ratios": {"A": 0.5, "B": 0.5}}
    ]
    # Subtotals: A = 40 + 15 = 55. B = 20 + 15 = 35. Total subtotal = 90.
    # Tax = 9. Tip = 18. Total amount = 90 + 9 + 18 = 117.
    # Proportions: A = 55/90, B = 35/90
    results = resolve_itemized_split(items, tax=9.0, tip=18.0, discount=0.0, total_amount=117.0)
    
    assert len(results) == 2
    assert sum(r.amount_owed for r in results) == Decimal('117.00')
    
    a_res = next(r for r in results if r.member_id == "A")
    b_res = next(r for r in results if r.member_id == "B")
    
    # A raw = 55 + (9 * 55/90) + (18 * 55/90) = 55 + 5.5 + 11 = 71.5
    assert a_res.amount_owed == Decimal('71.50')
    
    # B raw = 35 + (9 * 35/90) + (18 * 35/90) = 35 + 3.5 + 7 = 45.5
    assert b_res.amount_owed == Decimal('45.50')

def test_resolve_itemized_split_rounding():
    items = [
        {"item_name": "App", "line_total": 10.0, "member_ratios": {"A": 1/3, "B": 1/3, "C": 1/3}}
    ]
    # Total amount = 10.
    results = resolve_itemized_split(items, tax=0.0, tip=0.0, discount=0.0, total_amount=10.0)
    
    assert len(results) == 3
    assert sum(r.amount_owed for r in results) == Decimal('10.00')
    
    # 3.34, 3.33, 3.33. Tied remainders, tie break on UUID. A gets 3.34.
    assert results[0].member_id == 'A'
    assert results[0].amount_owed == Decimal('3.34')
    assert results[1].member_id == 'B'
    assert results[1].amount_owed == Decimal('3.33')
    assert results[2].member_id == 'C'
    assert results[2].amount_owed == Decimal('3.33')

def test_resolve_itemized_split_invalid_ratios():
    items = [
        {"item_name": "App", "line_total": 10.0, "member_ratios": {"A": 0.5, "B": 0.4}}
    ]
    with pytest.raises(SplitError) as excinfo:
        resolve_itemized_split(items, tax=0.0, tip=0.0, discount=0.0, total_amount=10.0)
    assert "Ratios do not sum to 1.0" in str(excinfo.value)
