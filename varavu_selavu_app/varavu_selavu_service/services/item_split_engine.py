import decimal
from decimal import Decimal
from typing import List, Dict

from varavu_selavu_service.services.split_engine import SplitError, SplitResult

def resolve_itemized_split(items: List[Dict], tax: float, tip: float, discount: float, total_amount: float) -> List[SplitResult]:
    """
    Resolves itemized splits where each item has `member_ratios`.
    Prorates tax, tip, and discount proportionally to the pre-tax subtotal of each member.
    """
    tax_d = Decimal(str(tax or 0))
    tip_d = Decimal(str(tip or 0))
    discount_d = Decimal(str(discount or 0))
    total_d = Decimal(str(total_amount)).quantize(Decimal('0.01'), rounding=decimal.ROUND_HALF_UP)
    
    # Calculate each member's raw subtotal
    member_subtotals = {}
    total_subtotal = Decimal('0.00')
    
    for idx, item in enumerate(items):
        ratios = item.get("member_ratios", {})
        line_total = Decimal(str(item.get("line_total", 0)))
        
        ratio_sum = Decimal('0.00')
        for mid, r_val in ratios.items():
            ratio = Decimal(str(r_val))
            if ratio < Decimal('0.00'):
                raise SplitError(f"Negative ratio on item {idx}")
            ratio_sum += ratio
            
        if ratio_sum != Decimal('1.00'):
            # Allow minor floating point drift, e.g. 0.9999
            if abs(ratio_sum - Decimal('1.00')) > Decimal('0.001'):
                raise SplitError(f"Ratios do not sum to 1.0 on item '{item.get('item_name')}'", {"ratio_sum": str(ratio_sum)})
                
        for mid, r_val in ratios.items():
            ratio = Decimal(str(r_val))
            # Normalize to avoid drift
            norm_ratio = ratio / ratio_sum if ratio_sum > 0 else Decimal('0')
            member_share = line_total * norm_ratio
            member_subtotals[mid] = member_subtotals.get(mid, Decimal('0.00')) + member_share
            total_subtotal += member_share
            
    # Pro-rate tax, tip, discount
    raw_totals = []
    rounded_sum = Decimal('0.00')
    
    for mid, subtotal in member_subtotals.items():
        if total_subtotal > Decimal('0.00'):
            proportion = subtotal / total_subtotal
        else:
            proportion = Decimal('1.00') / Decimal(len(member_subtotals))
            
        member_tax = tax_d * proportion
        member_tip = tip_d * proportion
        member_discount = discount_d * proportion
        
        raw_total = subtotal + member_tax + member_tip - member_discount
        
        rounded = raw_total.quantize(Decimal('0.01'), rounding=decimal.ROUND_DOWN)
        remainder = raw_total - rounded
        
        raw_totals.append({
            "member_id": mid,
            "raw": raw_total,
            "rounded": rounded,
            "remainder": remainder
        })
        rounded_sum += rounded
        
    residual = total_d - rounded_sum
    cents = int((residual * 100).to_integral_value())
    
    if cents < 0:
        raise SplitError("Resolved total exceeds expense total", {"residual": str(residual)})
    
    # Distribute residual by remainder DESC, then member_id ASC
    raw_totals.sort(key=lambda x: (-x['remainder'], x['member_id']))
    
    for i in range(cents):
        if i < len(raw_totals):
            raw_totals[i]['rounded'] += Decimal('0.01')
            
    final_results = []
    for rt in raw_totals:
        if rt['rounded'] > Decimal('0.00'):
            final_results.append(SplitResult(
                member_id=rt['member_id'],
                amount_owed=rt['rounded'],
                basis_type="itemized",
                basis_value=None
            ))
            
    # Re-sort by member_id
    final_results.sort(key=lambda x: x.member_id)
    return final_results
