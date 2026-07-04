import decimal
from decimal import Decimal
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class SplitError(Exception):
    """Domain exception raised when split invariant checks fail."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.details = details or {}

class SplitResult(BaseModel):
    member_id: str
    amount_owed: Decimal
    basis_type: str
    basis_value: Optional[Decimal]

def validate_payers(amount: Decimal, payers: List[Dict[str, Any]]) -> None:
    """
    Validates that the sum of amount_paid across all payers equals the expense amount.
    """
    expense_amount = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
    total_paid = Decimal('0.00')
    
    for p in payers:
        paid = p.get('amount_paid')
        if paid is None:
            raise SplitError("Payer missing amount_paid")
        val = Decimal(str(paid)).quantize(Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
        if val < Decimal('0.00'):
            raise SplitError("amount_paid cannot be negative")
        total_paid += val
    
    if total_paid != expense_amount:
        raise SplitError(
            "Payers total does not match expense amount",
            {"amount": str(expense_amount), "total_paid": str(total_paid)}
        )

def resolve_split(amount: Decimal, split_type: str, entries: List[Dict[str, Any]], member_ids: Optional[List[str]] = None) -> List[SplitResult]:
    """
    Resolves split inputs into cent-exact per-member amount_owed values.
    
    amount: the total expense amount.
    split_type: 'equal', 'exact', or 'percentage'.
    entries: list of dicts with 'member_id' and 'value' (for exact/percentage).
    member_ids: list of member IDs participating (used for 'equal' split if entries are not provided).
    """
    amount = Decimal(str(amount)).quantize(Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
    
    if amount < Decimal('0.00'):
        raise SplitError("Amount cannot be negative")
        
    if split_type not in ["equal", "exact", "percentage"]:
        raise SplitError(f"Unsupported split_type: {split_type}")

    raw_shares = []
    
    if split_type == "equal":
        # For equal split, we can use member_ids directly if provided, or extract from entries
        participants = member_ids if member_ids is not None else [e.get('member_id') for e in entries]
        
        # Filter out None values in case of malformed input
        participants = [p for p in participants if p is not None]
        
        if not participants:
            raise SplitError("No participants provided for equal split")
            
        n = len(participants)
        raw_amt = amount / Decimal(n)
        for member_id in participants:
            raw_shares.append({
                "member_id": member_id,
                "raw_amount": raw_amt,
                "basis_type": "equal",
                "basis_value": None
            })
            
    elif split_type == "exact":
        if not entries:
            raise SplitError("No entries provided for exact split")
            
        total_exact = Decimal('0.00')
        for e in entries:
            member_id = e.get('member_id')
            if not member_id:
                raise SplitError("Entry missing member_id")
                
            val_raw = e.get('value', 0)
            val = Decimal(str(val_raw))
            if val < Decimal('0.00'):
                raise SplitError("Exact values cannot be negative")
                
            total_exact += val
            raw_shares.append({
                "member_id": member_id,
                "raw_amount": val,
                "basis_type": "exact",
                "basis_value": val
            })
            
        if total_exact != amount:
            raise SplitError(
                "Exact amounts do not sum to total",
                {"amount": str(amount), "total_exact": str(total_exact)}
            )

    elif split_type == "percentage":
        if not entries:
            raise SplitError("No entries provided for percentage split")
            
        total_pct = Decimal('0.00')
        for e in entries:
            member_id = e.get('member_id')
            if not member_id:
                raise SplitError("Entry missing member_id")
                
            val_raw = e.get('value', 0)
            val = Decimal(str(val_raw))
            if val < Decimal('0.00'):
                raise SplitError("Percentages cannot be negative")
                
            total_pct += val
            raw_amt = amount * (val / Decimal('100'))
            raw_shares.append({
                "member_id": member_id,
                "raw_amount": raw_amt,
                "basis_type": "percentage",
                "basis_value": val
            })
            
        if total_pct != Decimal('100'):
            raise SplitError(
                "Percentages do not sum to 100",
                {"total_percentage": str(total_pct)}
            )

    # 3.5 Rounding Rule
    # Round down to cents, distribute residual by largest fractional remainder.
    # Tie breaks by member UUID ascending.
    
    rounded_sum = Decimal('0.00')
    
    for rs in raw_shares:
        rounded = rs['raw_amount'].quantize(Decimal('0.01'), rounding=decimal.ROUND_DOWN)
        remainder = rs['raw_amount'] - rounded
        rs['rounded'] = rounded
        rs['remainder'] = remainder
        rounded_sum += rounded
        
    residual = amount - rounded_sum
    cents_to_distribute = int((residual * 100).to_integral_value())
    
    # Sort by remainder DESC, then member_id ASC
    raw_shares.sort(key=lambda x: (-x['remainder'], x['member_id']))
    
    for i in range(cents_to_distribute):
        if i < len(raw_shares):
            raw_shares[i]['rounded'] += Decimal('0.01')
            
    # Filter out zero-share members (E9)
    final_results = []
    # Re-sort by member_id for deterministic output
    raw_shares.sort(key=lambda x: x['member_id'])
    
    for rs in raw_shares:
        if rs['rounded'] > Decimal('0.00'):
            final_results.append(SplitResult(
                member_id=rs['member_id'],
                amount_owed=rs['rounded'],
                basis_type=rs['basis_type'],
                basis_value=rs['basis_value']
            ))
            
    return final_results
