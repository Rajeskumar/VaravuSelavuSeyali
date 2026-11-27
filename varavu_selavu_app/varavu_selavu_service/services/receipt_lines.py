"""Receipt line format (TS-FIX-102): one place that turns any receipt into paid-price lines.

A saved line carries three prices: `original_price` (before any discount), `discount` (money saved, a record
only) and `line_total` (what was actually paid, shown everywhere). Totals are checked as
`sum(line_total) + tax + tip == amount` within 0.02 — discounts are never subtracted again.

`normalize_scan` converts scanner output (coupons as negative lines, a whole-receipt discount in the header)
into that format. `convert_legacy` does the same for receipts saved before this change, whose `line_total` was
the pre-discount price. `prepare_lines` validates lines a client sends for saving. All money is Decimal and every
division is cent-exact (largest remainder), so nothing ever comes out negative or a cent off.
"""

import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, Iterable, List, Optional, Tuple

CENT = Decimal("0.01")
TOLERANCE = Decimal("0.02")

APP_UPDATE_MESSAGE = (
    "This version of TrackSpense uses an older receipt format. Update TrackSpense and try again."
)
ITEM_SPLIT_REMOVED_MESSAGE = (
    "Splitting a receipt by item is no longer supported. Update TrackSpense and try again."
)
SPLIT_REQUIRED_MESSAGE = (
    "The receipt amount changed. Choose how to split it: Equal, Exact or Shares."
)
RECEIPT_SPLIT_TYPES = ("equal", "exact", "shares")

# Returns and deposit refunds are not discounts: they are flagged for review, never folded into prices.
_REFUND_RE = re.compile(
    r"\b(return(ed|s)?|refund(ed|s)?|rtn|bottle\s+return|deposit\s+(refund|return)|crv\s+refund)\b", re.I
)


def money(value: Any) -> Decimal:
    if value is None or value == "":
        return Decimal("0.00")
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def _cents(value: Any) -> int:
    return int(money(value) * 100)


def _from_cents(c: int) -> Decimal:
    return (Decimal(c) / 100).quantize(CENT)


def distribute_cents(total: int, weights: List[int]) -> List[int]:
    """Splits `total` cents across `weights` in proportion, largest remainder first (ties: earlier line).
    With all-zero weights the total is spread evenly."""
    if not weights:
        return []
    if total <= 0:
        return [0] * len(weights)
    weight_sum = sum(weights)
    if weight_sum <= 0:
        weights = [1] * len(weights)
        weight_sum = len(weights)
    shares = [total * w // weight_sum for w in weights]
    remainders = [(total * w % weight_sum, -i) for i, w in enumerate(weights)]
    left = total - sum(shares)
    for _, neg_i in sorted(remainders, reverse=True)[:left]:
        shares[-neg_i] += 1
    return shares


def reconcile_totals(items: Iterable[Dict[str, Any]], total: Any, tax: Any = 0, tip: Any = 0,
                     subtotal: Any = None) -> Dict[str, Any]:
    """The one totals rule: paid line prices + tax + tip must equal the total within 0.02."""
    lines = sum((money(i.get("line_total")) for i in items), Decimal("0.00"))
    expected = lines + money(tax) + money(tip)
    difference = expected - money(total)
    return {
        "items_sum": f"{lines:.2f}",
        "expected_total": f"{expected:.2f}",
        "difference": f"{difference:.2f}",
        "reconciled": abs(difference) <= TOLERANCE
        and (subtotal is None or abs(lines - money(subtotal)) <= TOLERANCE),
    }


def is_refund_line(item: Dict[str, Any]) -> bool:
    if item.get("is_refund"):
        return True
    return bool(_REFUND_RE.search(str(item.get("item_name") or "")))


def _fold(lines: List[Dict[str, Any]], spread: int) -> Tuple[List[Dict[str, Any]], int]:
    """`lines` carry `_paid` and `_disc` in cents. Spreads `spread` cents of discount across them by paid price.
    A line never goes below zero; returns the cents that could not be applied."""
    remaining = spread
    # Repeat because a cap on one line moves its excess to the others.
    for _ in range(len(lines) + 1):
        if remaining <= 0:
            break
        weights = [ln["_paid"] for ln in lines]
        if sum(weights) <= 0:
            break
        parts = distribute_cents(remaining, weights)
        applied = 0
        for ln, part in zip(lines, parts):
            take = min(part, ln["_paid"])
            ln["_paid"] -= take
            ln["_disc"] += take
            applied += take
        remaining -= applied
        if applied == 0:
            break
    return lines, remaining


def _finish(ln: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: v for k, v in ln.items() if not k.startswith("_") and k != "is_refund"}
    paid, disc = ln["_paid"], ln["_disc"]
    out["line_total"] = float(_from_cents(paid))
    out["discount"] = float(_from_cents(disc))
    out["original_price"] = float(_from_cents(paid + disc))
    qty = out.get("quantity")
    if disc and qty:
        try:
            q = Decimal(str(qty))
            if q > 0:
                # Price history reads unit_price, so it must be the paid price per unit.
                out["unit_price"] = float((_from_cents(paid) / q).quantize(CENT, rounding=ROUND_HALF_UP))
        except Exception:
            pass
    return out


def normalize_scan(header: Dict[str, Any], items: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]], List[str]]:
    """Scanner output → paid-price lines. Returns (header, items, review, warnings).

    - A negative line (coupon) is folded into the line above. With no line above, or when it is larger than
      that line, it is divided across all lines by price.
    - A scanned per-line `discount` is subtracted from that line once (scanner lines are pre-discount).
    - The header `discount` (whole-receipt) is divided across lines by price; the header then reports it as
      `savings` and `discount` 0, so no client subtracts it again.
    - Return / deposit-refund lines leave the item list and are listed in `review`.
    """
    header = dict(header or {})
    warnings: List[str] = []
    review: List[Dict[str, Any]] = []
    lines: List[Dict[str, Any]] = []
    spread = 0

    for raw in items or []:
        if not isinstance(raw, dict):
            continue
        item = dict(raw)
        try:
            amount = _cents(item.get("line_total"))
            _cents(item.get("discount"))
        except (ArithmeticError, ValueError, TypeError):
            # A scanner (or an AI reply) can return "$3.99", "NaN" or garbage; never 500 after the scan.
            warnings.append(f"Could not read the price of '{item.get('item_name') or 'an item'}'; please review.")
            continue
        if is_refund_line(item):
            review.append({"item_name": item.get("item_name") or "Refund", "amount": float(_from_cents(abs(amount))),
                           "reason": "refund"})
            continue
        if amount < 0:
            coupon = -amount
            if lines and lines[-1]["_paid"] >= coupon:
                lines[-1]["_paid"] -= coupon
                lines[-1]["_disc"] += coupon
            else:
                spread += coupon
            continue
        own_disc = min(max(_cents(item.get("discount")), 0), amount)
        item["_paid"] = amount - own_disc
        item["_disc"] = own_disc
        lines.append(item)

    try:
        spread += max(_cents(header.get("discount")), 0)
    except (ArithmeticError, ValueError, TypeError):
        warnings.append("Could not read the receipt discount; please review.")
    if spread and lines:
        lines, left = _fold(lines, spread)
        if left:
            warnings.append(f"A discount of {_from_cents(left):.2f} is larger than the items; please review.")
    elif spread:
        warnings.append(f"A discount of {_from_cents(spread):.2f} could not be applied to any item; please review.")

    out = [_finish(ln) for ln in lines]
    for n, ln in enumerate(out, 1):
        ln["line_no"] = n
    if review:
        warnings.append(
            "Returns or refunds were found and left out of the items: "
            + ", ".join(f"{r['item_name']} ({r['amount']:.2f})" for r in review)
            + ". Adjust the prices or the total so they match."
        )
    header["savings"] = float(_from_cents(sum(ln["_disc"] for ln in lines)))
    header["discount"] = 0.0
    return header, out, review, warnings


def is_receipt(split_type: Optional[str], item_rows: Iterable[Any]) -> bool:
    """A receipt is an expense whose lines were saved as receipt lines. Every personal expense also gets one
    synthesized proxy line (`ExpenseService.add_expense`), which never has an original_price, so a plain
    expense (even one later moved to a group) is not a receipt. Old receipts are `itemized` or multi-line."""
    rows = list(item_rows)
    return split_type == "itemized" or len(rows) > 1 or any(getattr(r, "original_price", None) is not None for r in rows)


def is_legacy_format(item_rows: Iterable[Any]) -> bool:
    """Lines saved before TS-FIX-102 have no original_price; every later write sets it on every line."""
    rows = list(item_rows)
    return bool(rows) and any(getattr(r, "original_price", None) is None for r in rows)


def convert_legacy(items: List[Dict[str, Any]], header_discount: Any, line_discounts: bool) -> List[Dict[str, Any]]:
    """Old format (line_total = pre-discount price, discounts subtracted at the end) → paid-price lines.

    Replays exactly what the old totals check subtracted, per path, so nothing is discounted twice: personal
    receipts subtracted only the header discount; group receipts only the line discounts (the old item-split
    engine pooled them). Used only to show and re-save old receipts; converting writes nothing."""
    lines = []
    spread = max(_cents(header_discount), 0)
    for raw in items:
        item = dict(raw)
        amount = max(_cents(item.get("line_total")), 0)
        disc = max(_cents(item.get("discount")), 0) if line_discounts else 0
        own = min(disc, amount)
        spread += disc - own
        item["_paid"] = amount - own
        item["_disc"] = own
        lines.append(item)
    if spread and lines:
        lines, _ = _fold(lines, spread)
    return [_finish(ln) for ln in lines]


def row_to_dict(r: Any) -> Dict[str, Any]:
    def f(v):
        return float(v) if v is not None else None
    return {
        "id": str(r.id),
        "line_no": r.line_no,
        "item_name": r.item_name,
        "normalized_name": r.normalized_name,
        "category_id": r.category_id,
        "quantity": f(r.quantity),
        "unit": r.unit,
        "unit_price": f(r.unit_price),
        "line_total": f(r.line_total) or 0.0,
        "tax": f(r.tax) or 0.0,
        "discount": f(r.discount) or 0.0,
        "original_price": f(r.original_price),
    }


def items_view(rows: List[Any], *, amount: Any, tax: Any, tip: Any, header_discount: Any, group: bool) -> Dict[str, Any]:
    """GET .../items body. Old-format receipts come back converted to paid prices and flagged.

    `group` selects the old arithmetic to replay: True for receipts made in a group (line discounts),
    False for personal-made ones (header discount only). Old receipts kept tax on the lines (group) or
    the header (personal), so both are summed. When an old receipt's stored figures still fall short of
    its amount (e.g. tax lost by an earlier edit), the shortfall is shown as tax so it stays editable;
    shares are never touched by viewing."""
    items = [row_to_dict(r) for r in rows]
    legacy = is_legacy_format(rows)
    if legacy:
        tax = money(tax) + sum((money(i["tax"]) for i in items), Decimal("0.00"))
        items = convert_legacy(items, 0 if group else header_discount, line_discounts=group)
        for i in items:
            i["tax"] = 0.0
        shortfall = money(amount) - (sum((money(i["line_total"]) for i in items), Decimal("0.00")) + tax + money(tip))
        if shortfall > TOLERANCE:
            tax += shortfall
    return {
        "items": items,
        "amount": float(money(amount)),
        "tax": float(money(tax)),
        "tip": float(money(tip)),
        "discount": 0.0,
        "savings": float(savings_of(items)),
        "legacy_discount_format": legacy and (any(i["discount"] for i in items) or money(header_discount) > 0),
    }


class LineError(ValueError):
    pass


def prepare_lines(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Validates client lines for saving and fills `original_price`/`discount`.

    `original_price` omitted → line_total + discount. Sent with a discount → must equal line_total + discount
    (within 0.01). Sent without a discount → must be ≥ line_total, and the discount is derived."""
    out = []
    for n, raw in enumerate(items, 1):
        item = dict(raw)
        paid = money(item.get("line_total"))
        disc = money(item.get("discount"))
        if paid < 0 or disc < 0:
            raise LineError("Item prices and discounts cannot be negative.")
        original = item.get("original_price")
        if original is None:
            original = paid + disc
        else:
            original = money(original)
            if abs(original - (paid + disc)) > CENT:
                if disc == 0 and original >= paid:
                    disc = original - paid
                else:
                    raise LineError(
                        f"Line {n}: the original price must equal the paid price plus the discount."
                    )
            original = paid + disc
        item["line_total"] = paid
        item["discount"] = disc
        item["original_price"] = original
        item["tax"] = Decimal("0.00")
        # Price history reads unit_price: keep it the paid price per unit when an edit changed the price.
        try:
            qty = Decimal(str(item.get("quantity") or 0))
        except (ArithmeticError, ValueError):
            qty = Decimal("0")
        if qty > 0 and item.get("unit_price") is not None and abs(money(item["unit_price"]) * qty - paid) > TOLERANCE:
            item["unit_price"] = (paid / qty).quantize(CENT, rounding=ROUND_HALF_UP)
        out.append(item)
    return out


def savings_of(items: Iterable[Dict[str, Any]]) -> Decimal:
    return sum((money(i.get("discount")) for i in items), Decimal("0.00"))


def member_item_shares(items: List[Any], shares_by_email: Dict[str, Any], amount: Any) -> Dict[str, List[Dict[str, Any]]]:
    """Per-person item analytics for a receipt split on its total: each person's part of each line follows
    their share of the total. Computed on demand, never stored."""
    total = money(amount)
    if total <= 0:
        return {}
    result: Dict[str, List[Dict[str, Any]]] = {}
    for email, share in shares_by_email.items():
        if not email:
            continue
        ratio = Decimal(str(share)) / total
        rows = []
        for item in items:
            paid = money(item.line_total)
            qty = float(item.quantity) if item.quantity else 1.0
            rows.append({
                "normalized_name": item.normalized_name,
                "item_name": item.item_name,
                "unit_price": float(item.unit_price) if item.unit_price else float(paid),
                "share_quantity": qty * float(ratio),
                "share_amount": float((paid * ratio).quantize(CENT, rounding=ROUND_HALF_UP)),
            })
        result[email] = rows
    return result


# ---- HTTP helpers shared by the personal, group and item-edit routes ----------------------------------------

def http_error(code: str, message: str, status: int = 400, **extra):
    from fastapi import HTTPException
    return HTTPException(status_code=status, detail={"code": code, "message": message, **extra})


def refuse_header_discount(discount: Any) -> None:
    """A whole-receipt `discount` in a save request is the old format (it would be subtracted again)."""
    if money(discount) != 0:
        raise http_error("app_update_required", APP_UPDATE_MESSAGE)


def checked_lines(items: List[Dict[str, Any]], *, amount: Any, tax: Any, tip: Any) -> List[Dict[str, Any]]:
    """Validates lines and the totals rule for any receipt save; returns lines ready to write."""
    if not items:
        raise http_error("items_required", "A receipt needs at least one item.")
    try:
        lines = prepare_lines(items)
    except LineError as e:
        raise http_error("invalid_item", str(e))
    figures = reconcile_totals(lines, amount, tax, tip)
    if not figures["reconciled"]:
        raise http_error(
            "totals_mismatch",
            f"Item prices plus tax and tip come to {figures['expected_total']}, "
            f"but the total is {money(amount):.2f}. Make them match before saving.",
            **figures,
        )
    return lines
