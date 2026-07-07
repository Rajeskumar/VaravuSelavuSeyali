import pytest
from decimal import Decimal
from varavu_selavu_service.services.split_engine import (
    resolve_split, validate_payers, SplitError, SplitResult
)
import random

def test_equal_split_no_residual():
    amount = Decimal('90.00')
    member_ids = ['C', 'A', 'B']
    results = resolve_split(amount, 'equal', entries=[], member_ids=member_ids)
    
    assert len(results) == 3
    assert sum(r.amount_owed for r in results) == amount
    
    for r in results:
        assert r.amount_owed == Decimal('30.00')
        assert r.basis_type == 'equal'
        assert r.basis_value is None

def test_equal_split_with_residual():
    amount = Decimal('100.00')
    # member UUID ordering tie-break check
    # 100 / 3 = 33.3333... residual is 0.01
    # 'A' should get the extra cent.
    member_ids = ['C', 'A', 'B']
    results = resolve_split(amount, 'equal', entries=[], member_ids=member_ids)
    
    assert sum(r.amount_owed for r in results) == amount
    # Sorted alphabetically in output
    assert results[0].member_id == 'A'
    assert results[0].amount_owed == Decimal('33.34')
    assert results[1].member_id == 'B'
    assert results[1].amount_owed == Decimal('33.33')
    assert results[2].member_id == 'C'
    assert results[2].amount_owed == Decimal('33.33')

def test_exact_split_valid():
    amount = Decimal('90.00')
    entries = [
        {'member_id': 'A', 'value': 50.00},
        {'member_id': 'B', 'value': Decimal('40.00')}
    ]
    results = resolve_split(amount, 'exact', entries)
    
    assert len(results) == 2
    assert sum(r.amount_owed for r in results) == amount
    assert results[0].amount_owed == Decimal('50.00')
    assert results[1].amount_owed == Decimal('40.00')

def test_exact_split_invalid_sum():
    amount = Decimal('90.00')
    entries = [
        {'member_id': 'A', 'value': 50.00},
        {'member_id': 'B', 'value': 50.00}
    ]
    with pytest.raises(SplitError) as excinfo:
        resolve_split(amount, 'exact', entries)
    
    assert "Exact amounts do not sum to total" in str(excinfo.value)
    assert excinfo.value.details['total_exact'] == '100.00'

def test_percentage_split_valid():
    amount = Decimal('200.00')
    entries = [
        {'member_id': 'A', 'value': 33.33},
        {'member_id': 'B', 'value': 33.33},
        {'member_id': 'C', 'value': 33.34},
    ]
    results = resolve_split(amount, 'percentage', entries)
    
    assert sum(r.amount_owed for r in results) == amount
    assert results[0].amount_owed == Decimal('66.66') # 200 * 33.33% = 66.66
    assert results[1].amount_owed == Decimal('66.66') # 200 * 33.33% = 66.66
    assert results[2].amount_owed == Decimal('66.68') # 200 * 33.34% = 66.68

def test_percentage_split_invalid_sum():
    amount = Decimal('200.00')
    entries = [
        {'member_id': 'A', 'value': 50},
        {'member_id': 'B', 'value': 40},
    ]
    with pytest.raises(SplitError) as excinfo:
        resolve_split(amount, 'percentage', entries)
    
    assert "Percentages do not sum to 100" in str(excinfo.value)
    assert excinfo.value.details['total_percentage'] == '90.00'

def test_zero_share_omitted():
    amount = Decimal('100.00')
    entries = [
        {'member_id': 'A', 'value': 100},
        {'member_id': 'B', 'value': 0},
    ]
    results = resolve_split(amount, 'percentage', entries)
    
    assert len(results) == 1
    assert results[0].member_id == 'A'
    assert results[0].amount_owed == Decimal('100.00')

def test_validate_payers_valid():
    amount = Decimal('100.00')
    payers = [
        {'member_id': 'A', 'amount_paid': 60.00},
        {'member_id': 'B', 'amount_paid': 40.00}
    ]
    validate_payers(amount, payers) # Should not raise

def test_validate_payers_invalid():
    amount = Decimal('100.00')
    payers = [
        {'member_id': 'A', 'amount_paid': 60.00}
    ]
    with pytest.raises(SplitError) as excinfo:
        validate_payers(amount, payers)
    
    assert "Payers total does not match expense amount" in str(excinfo.value)

def test_invariant_property_testing():
    # Test over random amounts and participant counts
    for _ in range(100):
        amount = Decimal(str(round(random.uniform(0.01, 10000.00), 2)))
        num_participants = random.randint(1, 20)
        member_ids = [f'user_{i}' for i in range(num_participants)]
        
        results = resolve_split(amount, 'equal', entries=[], member_ids=member_ids)
        
        # Check invariants
        assert sum(r.amount_owed for r in results) == amount
        assert all(r.amount_owed >= Decimal('0.00') for r in results)

def test_shares_split_valid():
    amount = Decimal('90.00')
    entries = [
        {'member_id': 'A', 'value': 2},
        {'member_id': 'B', 'value': 1},
        {'member_id': 'C', 'value': 1}
    ]
    results = resolve_split(amount, 'shares', entries)
    assert len(results) == 3
    assert sum(r.amount_owed for r in results) == amount
    
    # 90 across 4 shares: A=45, B=22.50, C=22.50
    # Output sorted by member_id
    assert results[0].member_id == 'A'
    assert results[0].amount_owed == Decimal('45.00')
    assert results[1].member_id == 'B'
    assert results[1].amount_owed == Decimal('22.50')
    assert results[2].member_id == 'C'
    assert results[2].amount_owed == Decimal('22.50')

def test_shares_split_invalid_fraction():
    amount = Decimal('90.00')
    entries = [{'member_id': 'A', 'value': 1.5}]
    with pytest.raises(SplitError) as excinfo:
        resolve_split(amount, 'shares', entries)
    assert "Share values must be integers" in str(excinfo.value)

def test_adjustment_split_valid():
    amount = Decimal('90.00')
    entries = [
        {'member_id': 'A', 'value': 12},
        {'member_id': 'B', 'value': 0},
        {'member_id': 'C', 'value': 0}
    ]
    results = resolve_split(amount, 'adjustment', entries)
    assert len(results) == 3
    assert sum(r.amount_owed for r in results) == amount
    
    # Base = (90-12)/3 = 26
    assert results[0].member_id == 'A'
    assert results[0].amount_owed == Decimal('38.00')
    assert results[1].member_id == 'B'
    assert results[1].amount_owed == Decimal('26.00')
    assert results[2].member_id == 'C'
    assert results[2].amount_owed == Decimal('26.00')

def test_adjustment_split_invalid_exceeds():
    amount = Decimal('90.00')
    entries = [
        {'member_id': 'A', 'value': 100},
        {'member_id': 'B', 'value': 0}
    ]
    with pytest.raises(SplitError) as excinfo:
        resolve_split(amount, 'adjustment', entries)
    assert "Adjustments exceed total amount" in str(excinfo.value)
    assert excinfo.value.details['amount'] == '90.00'
    assert excinfo.value.details['total_adjustment'] == '100.00'

def test_shares_adjustment_invariant_property_testing():
    for _ in range(50):
        amount = Decimal(str(round(random.uniform(0.01, 1000.00), 2)))
        num_participants = random.randint(2, 10)
        member_ids = [f'user_{i}' for i in range(num_participants)]
        
        # Test shares
        shares_entries = [{'member_id': mid, 'value': random.randint(1, 10)} for mid in member_ids]
        res_shares = resolve_split(amount, 'shares', shares_entries)
        assert sum(r.amount_owed for r in res_shares) == amount
        
        # Test adjustment
        adj_amount = round(float(amount) * random.uniform(0, 0.9), 2) # ensure < amount
        # assign adjustments randomly that sum to adj_amount roughly
        adj_entries = []
        remaining = adj_amount
        for i, mid in enumerate(member_ids[:-1]):
            val = round(remaining * random.uniform(0, 1), 2)
            adj_entries.append({'member_id': mid, 'value': val})
            remaining -= val
        adj_entries.append({'member_id': member_ids[-1], 'value': round(remaining, 2)})
        
        res_adj = resolve_split(amount, 'adjustment', adj_entries)
        assert sum(r.amount_owed for r in res_adj) == amount
