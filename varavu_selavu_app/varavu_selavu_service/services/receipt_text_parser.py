"""ReceiptTextParser — turn OCR rows into the same {header, items} shape the
LLM receipt parser returns, using layout + keyword heuristics only.

Input is a list of row strings (top to bottom), already merged from OCR
fragments by services.ocr.layout.group_rows, e.g.:

    WALMART
    07/14/2026 12:31
    BANANAS 000000004011  0.69 F
    2 @ 1.50
    COKE  3.00 T
    SUBTOTAL  3.69
    TAX  0.21
    TOTAL  3.90

The parser never invents money: if items don't add up to the total it either
fixes an obviously misread tax, or adds one explicit "Unreadable items" line
for the gap with a warning, and reports a confidence the caller uses to decide
whether to fall back to the LLM.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

from varavu_selavu_service.services.category_rules import RuleCategorizer, get_rule_categorizer

_TOLERANCE = 0.02
UNREADABLE_ITEMS_NAME = "Unreadable items"

# ----------------------------------------------------------------------------
# Amounts
# ----------------------------------------------------------------------------
# OCR commonly reads 0 as O/o and splits "8.50" into "8 . 50" or "8,50".
_OCR_DIGIT_FIX_RE = re.compile(r"(?<=\d)[Oo](?=\d|\b)|(?<=[.,])[Oo](?=\d)|(?<=\d[.,]\d)[Oo]\b")
_LETTER_ZERO_RE = re.compile(r"(?<=[A-Za-z])0(?=[A-Za-z])")
_SPLIT_DECIMAL_RE = re.compile(r"(\d)\s?[,.]\s(\d{2})(?!\d)|(\d)\s[,.]\s?(\d{2})(?!\d)")
_COMMA_DECIMAL_RE = re.compile(r"(?<![\d,])(\d{1,4}),(\d{2})(?![\d,])")
# Price at the end of a row, with optional currency, sign and tax flag
# ("0.69 F", "0.69F", "3.00-", "-3.00", "$12.50 T", "4.99 N*").
_TRAILING_PRICE_RE = re.compile(
    r"(?P<neg1>-)?\s?(?P<cur>[$€£₹])?\s?(?P<amt>\d{1,5}(?:,\d{3})*\.\d{2})\s?(?P<neg2>-)?\s?"
    r"(?P<flag>[A-Z]{1,2}\*?|\*)?\s*$",
    re.IGNORECASE,
)
_ANY_PRICE_RE = re.compile(r"-?\$?\d{1,5}(?:,\d{3})*\.\d{2}-?")

# ----------------------------------------------------------------------------
# Row classifiers
# ----------------------------------------------------------------------------
_SUBTOTAL_RE = re.compile(r"\b(sub\s*-?\s*total|subttl|sub\s*ttl|merchandise\s+total|net\s+sales|food\s+total|items?\s+total)\b", re.I)
_TOTAL_STRONG_RE = re.compile(
    r"\b(grand\s*total|total\s*due|amount\s*due|amt\s*due|balance\s*due|total\s*amount|order\s*total|"
    r"invoice\s*total|total\s*sale|sale\s*total|net\s*total|total\s*charge|total\s*payable|amount\s*payable|"
    r"please\s*pay)\b",
    re.I,
)
_TOTAL_RE = re.compile(r"\b(total|ttl|tot)(?![a-z])", re.I)
_TOTAL_EXCLUDE_RE = re.compile(
    r"\b(savings|saved|you\s+saved|total\s+tax|tax\s+total|total\s+items?|items?\s+sold|number\s+of\s+items|"
    r"total\s+qty|total\s+quantity|total\s+discount|total\s+tip|total\s+points|points|rewards|total\s+units|"
    r"total\s+number|before\s+tax|pre\s*-?\s*tax|taxable|non\s*-?\s*taxable|total\s+coupons?)\b",
    re.I,
)
_TAX_RE = re.compile(r"\b(tax|taxes|hst|gst|pst|qst|vat|cgst|sgst|igst|sales\s+tax|state\s+tax|city\s+tax|county\s+tax|local\s+tax)(?![a-z])", re.I)
_TAX_EXCLUDE_RE = re.compile(r"\b(taxable|non\s*-?\s*taxable|tax\s*exempt|exempt|before\s+tax|pre\s*-?\s*tax|incl\.?\s+tax|tax\s+id|tax\s+invoice|gstin|tin)\b", re.I)
_TOTAL_TAX_RE = re.compile(r"\b(total\s+tax|tax\s+total|total\s+taxes)\b", re.I)
_TIP_RE = re.compile(r"\b(tip|tips|gratuity|service\s+charge|svc\s+chg)\b", re.I)
_TIP_EXCLUDE_RE = re.compile(r"(%|\bsuggest|\bguide\b|\badd\s+tip\b)", re.I)
_DISCOUNT_RE = re.compile(r"\b(discount|disc|coupon|cpn|promo|promotion|instant\s+savings|member\s+savings|markdown|mfr|rebate|off)\b", re.I)
_DISCOUNT_SUMMARY_RE = re.compile(r"\b(total\s+savings|you\s+saved|your\s+savings|savings\s+today|total\s+discounts?|saved\s+today)\b", re.I)
_TENDER_RE = re.compile(
    r"\b(cash|change|change\s+due|visa|mastercard|master\s*card|mc|amex|american\s+express|discover|debit|credit|"
    r"card|tend|tendered|tender|payment|paid|auth|authorization|approval|approved|appr|ref|reference|acct|account|"
    r"chip|contactless|tap|entry\s+method|aid|tvr|tsi|arqc|terminal|term|trans|transaction|trx|batch|seq|invoice\s*#|"
    r"member|membership\s*#|rewards|points|balance\s+remaining|remaining\s+balance|gift\s+card\s+balance|"
    r"ebt|snap|wic|check\s*#|signature|cardholder|pin\s+verified|verified\s+by\s+pin|us\s+debit|usd\$?)\b",
    re.I,
)
_NOISE_RE = re.compile(
    r"\b(thank|thanks|welcome|survey|www|http|\.com|receipt|cashier|register|lane|op\s*#|tc\s*#|st\s*#|tr\s*#|"
    r"te\s*#|store\s*#|manager|return|refund\s+policy|policy|save\s+money|live\s+better|feedback|visit|"
    r"items\s+sold|#\s*items|item\s+count|customer\s+copy|merchant\s+copy|duplicate|reprint|open\s+\d|"
    r"hours|mon|tue|wed|thu|fri|sat|sun|guest|server|table|check|order\s*#|ticket|phone|tel|fax)\b",
    re.I,
)
_ADDRESS_RE = re.compile(
    r"\b\d{1,6}\s+[\w .'-]+\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|hwy|highway|pkwy|"
    r"parkway|ct|court|pl|place|suite|ste|plaza|sq|square|cir|circle|trl|trail)\b\.?|"
    r"\b[A-Za-z .]+,?\s+[A-Z]{2}\s+\d{5}(-\d{4})?\b",
    re.I,
)
# Narrower filters for the item section: the broad lists above would drop real
# products ("SUN CHIPS" -> day name, "BAND AID" -> EMV "aid", "GREETING CARD").
_ITEM_TENDER_RE = re.compile(
    r"\b(cash|change\s+due|visa|mastercard|amex|debit|credit|tend|tendered|tender|auth(?:orization)?\s*(?:#|code)|"
    r"approval|approved|acct|account\s*#|ref\s*#|trans(?:action)?\s*#|ebt|us\s+debit)\b",
    re.I,
)
_ITEM_NOISE_RE = re.compile(
    r"\b(thank|thanks|welcome|survey|www|http|receipt|cashier|register|op\s*#|tc\s*#|st\s*#|tr\s*#|te\s*#|"
    r"store\s*#|manager|return\s+policy|items\s+sold|#\s*items|item\s+count|customer\s+copy|merchant\s+copy|"
    r"reprint|server|table\s*#?\s*\d|guests?\s*:?\s*\d|check\s*#|order\s*#|ticket\s*#)\b|\.com\b",
    re.I,
)
_PHONE_RE = re.compile(r"\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}")
_QTY_AT_RE = re.compile(
    r"(?P<qty>\d+(?:\.\d+)?)\s*(?P<unit>lbs?|kg|oz|g|ea)?\s*(?:@|x|at)\s*\$?(?P<price>\d+\.\d{2})\s*(?:/\s*(?P<per>lbs?|kg|oz|ea))?",
    re.I,
)
_FOR_DEAL_RE = re.compile(r"(?P<qty>\d+)\s*(?:@|at)?\s*(?P<n>\d+)\s*for\s*\$?(?P<price>\d+\.\d{2})", re.I)
_LEADING_QTY_RE = re.compile(r"^(?P<qty>\d{1,2})(?:\s*[xX]?\s+(?=[A-Za-z])|(?=FS\b))")
_LEADING_FLAG_RE = re.compile(r"^[A-Z]\s+(?=\d{4,})")
# Item/UPC numbers, including ones OCR glued to the name ("BANANAS000000004011K").
_UPC_RE = re.compile(r"(?<![\d.])\d{5,14}[A-Z]?(?![\d.])")

# ----------------------------------------------------------------------------
# Dates
# ----------------------------------------------------------------------------
_MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
_DATE_NUMERIC_RE = re.compile(r"(?<!\d)(\d{1,4})[/.-](\d{1,2})[/.-](\d{4}|\d{2}(?!\d))")
# OCR often drops the space between date and time ("09/20/202617:42", "Sep 18,20268:05PM").
_GLUED_DATE_RE = re.compile(r"((?:\d{1,2}[/.-]\d{1,2}[/.-]|[A-Za-z]{3,9}\.?\s*\d{1,2},\s*)\d{4})(?=\d)")
_DATE_TEXT_MDY_RE = re.compile(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*(\d{1,2})(?:,\s*|\s+)(\d{4}|\d{2}(?!\d))", re.I)
_DATE_TEXT_DMY_RE = re.compile(r"\b(\d{1,2})[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s-]+(\d{2,4})\b", re.I)
_TIME_RE = re.compile(r"(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\s*([AaPp]\.?[Mm]\.?)?")

_CURRENCY_HINTS = [
    (re.compile(r"₹|\brs\.?\s?\d|\binr\b", re.I), "INR"),
    (re.compile(r"€|\beur\b", re.I), "EUR"),
    (re.compile(r"£|\bgbp\b", re.I), "GBP"),
    (re.compile(r"\bcad\b|\bc\$", re.I), "CAD"),
    (re.compile(r"\baud\b|\ba\$", re.I), "AUD"),
]

# Receipt abbreviations -> words, for a readable normalized_name.
_ITEM_ABBREVIATIONS = {
    "chkn": "chicken", "ckn": "chicken", "bnls": "boneless", "sknls": "skinless", "brst": "breast",
    "org": "organic", "whl": "whole", "mlk": "milk", "gal": "gallon", "gv": "great value",
    "ks": "kirkland signature", "btl": "bottle", "pk": "pack", "lg": "large", "sm": "small",
    "med": "medium", "bnna": "banana", "strwbry": "strawberry", "ygrt": "yogurt", "chs": "cheese",
    "brd": "bread", "tom": "tomato", "veg": "vegetable", "frz": "frozen", "grnd": "ground", "bf": "beef",
    "tky": "turkey", "crm": "cream", "sce": "sauce", "jce": "juice", "oj": "orange juice",
    "choc": "chocolate", "crkr": "cracker", "tort": "tortilla", "avoc": "avocado", "blbry": "blueberry",
    "rspb": "raspberry", "pb": "peanut butter", "wtr": "water", "sprklng": "sparkling", "ea": "each",
    "ct": "count", "dz": "dozen", "doz": "dozen", "grn": "green", "rd": "red", "yel": "yellow",
    "pot": "potato", "potat": "potato", "onin": "onion", "brkfst": "breakfast", "cer": "cereal",
}
_KEEP_UPPER = {"tv", "usb", "hdmi", "led", "xl", "xxl", "ipa", "bbq", "gps", "ssd", "rx", "2%", "1%"}


@dataclass
class _Row:
    idx: int
    text: str
    amount: Optional[float]
    negative: bool
    label: str  # text with the trailing price removed


@dataclass
class ParsedReceipt:
    header: Dict[str, Any]
    items: List[Dict[str, Any]]
    warnings: List[str] = field(default_factory=list)
    confidence: float = 0.0
    reconciled: bool = False
    ocr_text: str = ""


def _fix_ocr_digits(text: str) -> str:
    t = _OCR_DIGIT_FIX_RE.sub("0", text)
    t = _LETTER_ZERO_RE.sub("O", t)  # "APPR0VAL", "PAPERT0WELS"
    t = _SPLIT_DECIMAL_RE.sub(lambda m: f"{m.group(1) or m.group(3)}.{m.group(2) or m.group(4)}", t)
    t = _COMMA_DECIMAL_RE.sub(r"\1.\2", t)
    # Correct the letter l only inside a weight expression, never product names.
    t = re.sub(r"(?<=\d)\s*1b\b|\b1b(?=\s*@)|(?<=/)1b\b", " lb", t, flags=re.I)
    return t


def _to_float(s: str) -> float:
    return float(s.replace(",", ""))


def _split_price(text: str) -> Tuple[str, Optional[float], bool]:
    m = _TRAILING_PRICE_RE.search(text)
    if not m:
        return text.strip(), None, False
    label = text[: m.start()].strip()
    negative = bool(m.group("neg1") or m.group("neg2"))
    return label, _to_float(m.group("amt")), negative


def _plausible(d: date, today: date) -> bool:
    return today - timedelta(days=3 * 365) <= d <= today + timedelta(days=1)


def _year(y: int) -> int:
    return y + 2000 if y < 100 else y


def _parse_date(rows: Sequence[str], today: date) -> Tuple[Optional[date], Optional[Tuple[int, int, int]]]:
    rows = [_GLUED_DATE_RE.sub(r"\1 ", r) for r in rows]
    found: Optional[date] = None
    found_idx = -1
    for idx, text in enumerate(rows):
        candidates: List[date] = []
        for a, b, c in _DATE_NUMERIC_RE.findall(text):
            ai, bi, ci = int(a), int(b), int(c)
            try:
                if len(a) == 4:  # YYYY-MM-DD
                    candidates.append(date(ai, bi, ci))
                else:
                    y = _year(ci)
                    if ai > 12 and bi <= 12:  # DD/MM/YYYY
                        candidates.append(date(y, bi, ai))
                    else:  # US default MM/DD/YYYY
                        candidates.append(date(y, ai, bi))
            except ValueError:
                continue
        for mon, d, y in _DATE_TEXT_MDY_RE.findall(text):
            try:
                candidates.append(date(_year(int(y)), _MONTHS[mon[:3].lower()], int(d)))
            except (ValueError, KeyError):
                continue
        for d, mon, y in _DATE_TEXT_DMY_RE.findall(text):
            try:
                candidates.append(date(_year(int(y)), _MONTHS[mon[:3].lower()], int(d)))
            except (ValueError, KeyError):
                continue
        for cand in candidates:
            if _plausible(cand, today):
                found, found_idx = cand, idx
                break
        if found:
            break
    if not found:
        return None, None
    # Prefer a time on the same row as the date, then anywhere on the receipt.
    search_order = [rows[found_idx]] + [r for i, r in enumerate(rows) if i != found_idx]
    for text in search_order:
        m = _TIME_RE.search(text)
        if m:
            hh, mm = int(m.group(1)), int(m.group(2))
            ss = int(m.group(3) or 0)
            ampm = (m.group(4) or "").lower().replace(".", "")
            if ampm == "pm" and hh < 12:
                hh += 12
            elif ampm == "am" and hh == 12:
                hh = 0
            return found, (hh, mm, ss)
    return found, None


def _normalize_item_name(raw: str) -> str:
    words = []
    for w in re.split(r"\s+", raw.strip()):
        lw = w.lower()
        if lw in _ITEM_ABBREVIATIONS:
            words.append(_ITEM_ABBREVIATIONS[lw].title())
        elif lw in _KEEP_UPPER:
            words.append(w.upper())
        elif re.fullmatch(r"\d+(\.\d+)?(oz|lb|ct|pk|g|kg|ml|l)", lw):
            words.append(lw)
        else:
            words.append(w.capitalize() if w.isupper() or w.islower() else w)
    return " ".join(words) or raw


class ReceiptTextParser:
    def __init__(self, rules: Optional[RuleCategorizer] = None, today: Optional[date] = None) -> None:
        self.rules = rules or get_rule_categorizer()
        self.today = today or date.today()

    # ------------------------------------------------------------------
    def parse(self, raw_rows: Sequence[str]) -> ParsedReceipt:
        texts = [_fix_ocr_digits(t.strip()) for t in raw_rows if t and t.strip()]
        rows: List[_Row] = []
        for i, t in enumerate(texts):
            label, amount, negative = _split_price(t)
            rows.append(_Row(idx=i, text=t, amount=amount, negative=negative, label=label))
        warnings: List[str] = []

        merchant_name, merchant_raw, merchant_cat, merchant_conf = self._merchant(rows)
        purchased, time_parts = _parse_date(texts, self.today)
        currency = self._currency(texts)

        totals = self._totals(rows)
        subtotal_row = totals["subtotal_row"]
        items_end = subtotal_row if subtotal_row is not None else totals["first_summary_row"]
        items = self._items(rows, end=items_end if items_end is not None else len(rows))

        total = totals["total"]
        subtotal = totals["subtotal"]
        tax = totals["tax"]
        tip = totals["tip"]
        discount = totals["discount"]
        total_source = "label"
        if total is None:
            if subtotal is not None:
                total = round(subtotal + tax + tip - discount, 2)
                total_source = "derived"
                warnings.append("No TOTAL line found; total computed from subtotal + tax.")
            elif items:
                total = round(sum(i["line_total"] for i in items) + tax + tip - discount, 2)
                total_source = "items"
                warnings.append("No TOTAL line found; total is the sum of the items read.")
            else:
                total = self._largest_amount(rows)
                total_source = "largest" if total is not None else "none"
                if total is not None:
                    warnings.append("No TOTAL line found; used the largest amount on the receipt.")

        # ---- reconcile ----
        reconciled = False
        balancing_gap = 0.0
        if total is not None:
            expected_items = round(total - tax - tip + discount, 2)
            if not items:
                items = [self._item(merchant_name or "Receipt total", expected_items, 1)]
                warnings.append("No item prices could be read; aggregate total requires review.")
                reconciled = False
            else:
                items_sum = round(sum(i["line_total"] for i in items), 2)
                gap = round(expected_items - items_sum, 2)
                if abs(gap) <= _TOLERANCE:
                    reconciled = True
                elif subtotal is not None and abs(items_sum - subtotal) <= _TOLERANCE:
                    # Items match the printed subtotal, so the misread is in tax/tip.
                    fixed_tax = round(total - subtotal - tip + discount, 2)
                    missing = round(total - subtotal - tax - tip + discount, 2)
                    looks_like_restaurant = (
                        (merchant_cat or self.rules.receipt_signals("\n".join(texts))) == ("Food & Drink", "Dining out")
                    )
                    if tax > 0 and missing > 0 and looks_like_restaurant:
                        # Tax was read fine; at a restaurant the unexplained remainder is the tip.
                        tip = round(tip + missing, 2)
                        warnings.append(f"Tip set to {tip:.2f} to match the total.")
                        reconciled = True
                    elif 0 <= fixed_tax <= 0.3 * max(subtotal, 0.01):
                        if abs(fixed_tax - tax) > _TOLERANCE:
                            warnings.append(f"Tax adjusted from {tax:.2f} to {fixed_tax:.2f} to match the total.")
                        tax = fixed_tax
                        reconciled = True
                if not reconciled:
                    balancing_gap = gap
                    name = UNREADABLE_ITEMS_NAME if gap > 0 else "Receipt adjustment"
                    items.append(self._item(name, gap, len(items) + 1))
                    warnings.append(
                        f"Items add up to {items_sum:.2f} but the receipt total implies {expected_items:.2f}; "
                        f"added '{name}' ({gap:+.2f}) — please review."
                    )
        else:
            warnings.append("Could not find the receipt total.")

        # ---- categories ----
        header_main, header_sub = self._header_category(merchant_cat, merchant_name, texts, items)
        for item in items:
            if item["item_name"] in (UNREADABLE_ITEMS_NAME, "Receipt adjustment", "Receipt total"):
                item["category_name"] = header_sub
            else:
                item["category_name"] = self.rules.classify_item(item["item_name"], (header_main, header_sub))[1]

        if subtotal is not None and total is not None and abs(total - (subtotal + tax + tip - discount)) > _TOLERANCE:
            warnings.append("Printed subtotal and total disagree; please review.")
        if any(i.get("unit_price") is not None and abs(
            round(i["quantity"] * i["unit_price"], 2) - i["line_total"]
        ) > _TOLERANCE for i in items):
            warnings.append("An item quantity and unit price disagree with its amount; please review.")

        # ---- confidence ----
        confidence = 0.0
        confidence += {"label": 0.4, "derived": 0.3, "items": 0.1, "largest": 0.1, "none": 0.0}[total_source]
        if reconciled and total_source in ("label", "derived"):
            confidence += 0.3
        elif total and balancing_gap:
            # Partial credit shrinks with the share of the total we couldn't read.
            confidence += max(0.0, 0.1 * (1 - abs(balancing_gap) / max(total, 0.01)))
        confidence += 0.15 if purchased else 0.0
        confidence += 0.15 * merchant_conf
        if not reconciled or any("adjusted" in w or "Tip set" in w or "disagree" in w for w in warnings):
            confidence = min(confidence, 0.6)
        confidence = round(min(confidence, 1.0), 3)

        if purchased:
            hh, mm, ss = time_parts or (12, 0, 0)
            purchased_at = datetime(purchased.year, purchased.month, purchased.day, hh, mm, ss).isoformat()
        else:
            purchased_at = ""
            warnings.append("Could not find the purchase date.")

        header = {
            "merchant_name": merchant_raw or merchant_name or "",
            "normalized_merchant_name": merchant_name or merchant_raw or "",
            "purchased_at": purchased_at,
            "currency": currency,
            "amount": total if total is not None else 0.0,
            "tax": round(tax, 2),
            "tip": round(tip, 2),
            "discount": round(discount, 2),
            "description": merchant_name or merchant_raw or "Receipt import",
            "main_category_name": header_main,
            "category_name": header_sub,
        }
        return ParsedReceipt(
            header=header,
            items=items,
            warnings=warnings,
            confidence=confidence,
            reconciled=reconciled,
            ocr_text="\n".join(texts),
        )

    # ------------------------------------------------------------------
    # Merchant / currency / category
    # ------------------------------------------------------------------
    def _merchant(self, rows: List[_Row]) -> Tuple[Optional[str], Optional[str], Optional[Tuple[str, str]], float]:
        """(display name, raw text, (main, sub) or None, confidence 0..1)."""
        top = rows[:8]
        bottom = rows[-6:] if len(rows) > 8 else []
        for pool, penalty in ((top, 1.0), (bottom, 0.85)):
            for row in pool:
                if len(row.label) < 2 or _TENDER_RE.search(row.label):
                    continue
                hit = self.rules.match_merchant(row.label)
                if hit:
                    merchant, conf = hit
                    return merchant.display_name, row.label, (merchant.main_category, merchant.subcategory), conf * penalty
        # Unknown merchant: first row that reads like a business name.
        for row in top:
            t = row.text
            letters = sum(ch.isalpha() for ch in t)
            if letters < 3 or row.amount is not None:
                continue
            if _ADDRESS_RE.search(t) or _PHONE_RE.search(t) or _DATE_NUMERIC_RE.search(t) or _NOISE_RE.search(t):
                continue
            name = re.sub(r"\s{2,}", " ", t).strip(" -*#")
            name = re.sub(r"\s*#\s*\d+.*$", "", name)
            if len(name) >= 3:
                return (name.title() if name.isupper() else name), t, None, 0.5
        return None, None, None, 0.0

    @staticmethod
    def _currency(texts: Sequence[str]) -> str:
        blob = "\n".join(texts)
        for pattern, code in _CURRENCY_HINTS:
            if pattern.search(blob):
                return code
        return "USD"

    def _header_category(
        self,
        merchant_cat: Optional[Tuple[str, str]],
        merchant_name: Optional[str],
        texts: Sequence[str],
        items: List[Dict[str, Any]],
    ) -> Tuple[str, str]:
        if merchant_cat:
            return merchant_cat
        if merchant_name:
            kw = self.rules.match_keywords(merchant_name)
            if kw:
                return kw[0], kw[1]
        signal = self.rules.receipt_signals("\n".join(texts))
        if signal:
            return signal
        # Vote by amount over item categories.
        votes: Dict[Tuple[str, str], float] = {}
        for item in items:
            cat = self.rules.classify_item(item["item_name"], ("Other", "General"))
            if cat != ("Other", "General"):
                votes[cat] = votes.get(cat, 0.0) + abs(item["line_total"])
        if votes:
            return max(votes.items(), key=lambda kv: kv[1])[0]
        return "Other", "General"

    # ------------------------------------------------------------------
    # Totals
    # ------------------------------------------------------------------
    def _totals(self, rows: List[_Row]) -> Dict[str, Any]:
        def amount_for(i: int) -> Optional[float]:
            # Label and value sometimes land on separate rows ("TOTAL" / "12.34").
            if rows[i].amount is not None:
                return rows[i].amount
            for j in (i + 1, i - 1):
                if 0 <= j < len(rows) and rows[j].amount is not None and not re.search(r"[A-Za-z]{2,}", rows[j].label):
                    return rows[j].amount
            return None

        subtotal = None
        subtotal_row = None
        first_summary_row = None
        total_candidates: List[Tuple[int, int, float]] = []  # (priority, row, amount)
        tax_lines: List[float] = []
        total_tax = None
        tip = 0.0
        discount = 0.0

        for i, row in enumerate(rows):
            label = row.label
            if not label:
                continue
            is_summary = False
            if _SUBTOTAL_RE.search(label):
                amt = amount_for(i)
                if amt is not None and subtotal is None:
                    subtotal, subtotal_row = amt, i
                is_summary = True
            elif _TOTAL_STRONG_RE.search(label) and not _TOTAL_EXCLUDE_RE.search(label):
                amt = amount_for(i)
                if amt is not None:
                    total_candidates.append((2, i, amt))
                is_summary = True
            elif _TOTAL_TAX_RE.search(label):
                amt = amount_for(i)
                if amt is not None:
                    total_tax = amt
                is_summary = True
            elif _TOTAL_RE.search(label) and not _TOTAL_EXCLUDE_RE.search(label) and not _TAX_RE.search(label):
                amt = amount_for(i)
                if amt is not None:
                    total_candidates.append((1, i, amt))
                is_summary = True
            elif _TAX_RE.search(label) and not _TAX_EXCLUDE_RE.search(label):
                amt = amount_for(i)
                if amt is not None and not _TENDER_RE.search(label):
                    tax_lines.append(amt)
                is_summary = True
            elif _TIP_RE.search(label) and not _TIP_EXCLUDE_RE.search(row.text):
                amt = amount_for(i)
                if amt is not None:
                    tip += amt
                is_summary = True
            elif (
                subtotal_row is not None
                and not total_candidates
                and _DISCOUNT_RE.search(label)
                and not _DISCOUNT_SUMMARY_RE.search(label)
                and row.amount is not None
            ):
                # Order-level discount printed between SUBTOTAL and TOTAL.
                discount += row.amount
                is_summary = True
            if is_summary and first_summary_row is None:
                first_summary_row = i

        total = None
        if total_candidates:
            # Highest priority wins; among equals prefer the one that agrees
            # with subtotal + tax, else the first (card slips repeat the total
            # further down, sometimes with the tip added by hand).
            tax_guess = total_tax if total_tax is not None else round(sum(tax_lines), 2)
            best_priority = max(p for p, _, _ in total_candidates)
            best = [c for c in total_candidates if c[0] == best_priority]
            if subtotal is not None:
                agreeing = [c for c in best if abs(c[2] - (subtotal + tax_guess + tip - discount)) <= _TOLERANCE]
                if agreeing:
                    best = agreeing
            total = best[0][2]

        tax = total_tax if total_tax is not None else round(sum(tax_lines), 2)
        return {
            "total": total,
            "subtotal": subtotal,
            "subtotal_row": subtotal_row,
            "first_summary_row": first_summary_row,
            "tax": tax,
            "tip": round(tip, 2),
            "discount": round(discount, 2),
        }

    @staticmethod
    def _largest_amount(rows: List[_Row]) -> Optional[float]:
        amounts = [
            r.amount for r in rows
            if r.amount is not None and not r.negative and not _TENDER_RE.search(r.label)
        ]
        return max(amounts) if amounts else None

    # ------------------------------------------------------------------
    # Items
    # ------------------------------------------------------------------
    @staticmethod
    def _item(name: str, line_total: float, line_no: int, quantity: float = 1.0, unit: str = "ea",
              unit_price: Optional[float] = None) -> Dict[str, Any]:
        line_total = round(line_total, 2)
        return {
            "line_no": line_no,
            "item_name": name,
            "normalized_name": _normalize_item_name(name),
            "quantity": quantity,
            "unit": unit,
            "unit_price": round(unit_price if unit_price is not None else (line_total / quantity if quantity else line_total), 2),
            "line_total": line_total,
            "category_name": "",
        }

    def _items(self, rows: List[_Row], end: int) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        pending_name: Optional[str] = None
        for row in rows[:end]:
            label = row.label
            # Costco-style leading tax flag before the item number ("E  512515 KS WATER").
            clean = _UPC_RE.sub(" ", _LEADING_FLAG_RE.sub("", label))
            clean = re.sub(r"\s{2,}", " ", clean).strip(" -*#:")
            has_words = bool(re.search(r"[A-Za-z]{2,}", clean))

            if row.amount is None:
                # A name on its own row; its price may be on the qty row below.
                qty_only = _QTY_AT_RE.search(label) or _FOR_DEAL_RE.search(label)
                if qty_only and items and not has_words_beyond_units(clean):
                    self._apply_qty(items[-1], qty_only)
                elif has_words and not (
                    _ITEM_TENDER_RE.search(label) or _ITEM_NOISE_RE.search(label)
                    or _ADDRESS_RE.search(label) or _PHONE_RE.search(label)
                ):
                    pending_name = clean
                continue

            if _DISCOUNT_SUMMARY_RE.search(label) or _PHONE_RE.search(label):
                continue
            # A row whose "price" is really part of a date/time is header, not an item.
            if _DATE_NUMERIC_RE.search(row.text) or _TIME_RE.search(row.text):
                continue

            amount = -row.amount if row.negative else row.amount
            qty_match = _QTY_AT_RE.search(label) or _FOR_DEAL_RE.search(label)
            if qty_match is None:
                # "2 @ 1.50" with no line total: the trailing price *is* the unit price.
                whole = _QTY_AT_RE.search(row.text) or _FOR_DEAL_RE.search(row.text)
                if whole and not has_words_beyond_units(_QTY_AT_RE.sub(" ", _FOR_DEAL_RE.sub(" ", label))):
                    qty_match = whole
                    gd = whole.groupdict()
                    per = float(gd["n"]) if gd.get("n") else 1.0
                    amount = round(float(gd["qty"]) * _to_float(gd["price"]) / per, 2)

            if row.negative or (items and _DISCOUNT_RE.search(label) and not has_words_beyond_discount(clean)):
                # Line-level savings/coupon under the item it applies to.
                name = clean if has_words else f"Discount ({items[-1]['item_name']})" if items else "Discount"
                items.append(self._item(name, -abs(amount), len(items) + 1))
                continue

            if qty_match and not has_words_beyond_units(clean):
                # "2 @ 1.50   3.00" under a name row (or under the previous item).
                if pending_name:
                    item = self._item(pending_name, amount, len(items) + 1)
                    self._apply_qty(item, qty_match)
                    items.append(item)
                    pending_name = None
                elif items:
                    self._apply_qty(items[-1], qty_match, line_total=amount)
                continue

            if _ITEM_TENDER_RE.search(label) or _ITEM_NOISE_RE.search(label):
                continue
            if not has_words:
                continue
            name = clean
            quantity = 1.0
            unit_price = None
            lead = _LEADING_QTY_RE.match(name)
            if qty_match:
                name = (name[: qty_match.start()] + name[qty_match.end():]).strip() or name
            elif lead and 1 <= int(lead.group("qty")) <= 20:
                quantity = float(lead.group("qty"))
                name = name[lead.end():].strip()
            item = self._item(name, amount, len(items) + 1, quantity=quantity, unit_price=unit_price)
            if qty_match:
                self._apply_qty(item, qty_match, line_total=amount)
            items.append(item)
            pending_name = None
        return items

    @staticmethod
    def _apply_qty(item: Dict[str, Any], m: re.Match, line_total: Optional[float] = None) -> None:
        gd = m.groupdict()
        if "n" in gd and gd.get("n"):  # "2 @ 3 FOR 5.00"
            qty = float(gd["qty"])
            unit_price = _to_float(gd["price"]) / float(gd["n"])
            unit = "ea"
        else:
            qty = float(gd["qty"])
            unit_price = _to_float(gd["price"])
            unit = (gd.get("unit") or gd.get("per") or "ea").lower().rstrip("s") or "ea"
        item["quantity"] = qty
        item["unit"] = unit
        item["unit_price"] = round(unit_price, 2)
        if line_total is not None:
            item["line_total"] = round(line_total, 2)



def has_words_beyond_units(text: str) -> bool:
    """True if text has real words besides qty/unit tokens ("2 @ 1.50", "1.23 lb @ 0.59 /lb")."""
    stripped = re.sub(r"\b(lbs?|kg|oz|g|ea|each|at|for|x|net|wt)\b", " ", text, flags=re.I)
    return bool(re.search(r"[A-Za-z]{2,}", stripped))


def has_words_beyond_discount(text: str) -> bool:
    """'INSTANT SAVINGS', 'MFR CPN', 'COUPON 1234' are pure discount rows; 'OFF-BRAND
    CEREAL' or 'PROMO PACK CHIPS' are products that happen to contain the word."""
    stripped = _DISCOUNT_RE.sub(" ", text)
    stripped = re.sub(r"\b(instant|member|store|savings?|mfr|manufacturer|digital|special|sale|price|you|item)\b", " ", stripped, flags=re.I)
    return bool(re.search(r"[A-Za-z]{3,}", stripped))
