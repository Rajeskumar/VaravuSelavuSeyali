"""Text cleanup shared by the rule categorizer and the receipt parser.

Builds on EntityResolutionService.normalize() (lowercase, punctuation -> space,
whitespace collapsed, merchant-safe — no singularizing) and additionally strips
the noise that bank statements, POS terminals and OCR add around a merchant
name, so "SQ *BLUE BOTTLE #1234 SAN FRANCISCO CA 5.40" and "blue bottle"
normalize to the same key.
"""
from __future__ import annotations

import re
from typing import Optional

from varavu_selavu_service.services.entity_resolution_service import EntityResolutionService

# Stateless: normalize() never touches the session.
_entity_normalizer = EntityResolutionService(db=None)  # type: ignore[arg-type]

# Payment-processor prefixes ("SQ *", "TST* ", "PAYPAL *") — the star is what
# marks them, so it's required (otherwise "sp" would eat the start of "spotify").
_STAR_PREFIX_RE = re.compile(r"^\s*[a-z]{2,6}\s*\*\s*", re.IGNORECASE)
# Bank-statement lead-ins ("POS DEBIT ", "CHECKCARD ", "RECURRING PAYMENT ").
_WORD_PREFIX_RE = re.compile(
    r"^\s*(?:(?:pos|ach|dbt|debit|purchase|chk\s*card|checkcard|recurring|payment|authorized|preauth)\b\s*)+",
    re.IGNORECASE,
)
_STORE_NO_RE = re.compile(r"(?:#|\bno\.?\s*|\bstore\s+|\bstr\s+|\bst#\s*)\d+", re.IGNORECASE)
_AMOUNT_RE = re.compile(r"[$€£₹]?\s*-?\d{1,3}(?:[,]\d{3})*[.,]\d{2}\b")
_DATE_RE = re.compile(r"\b\d{1,4}[/-]\d{1,2}(?:[/-]\d{2,4})?\b")
_DOTCOM_RE = re.compile(r"\.(com|net|org|co|io)\b", re.IGNORECASE)
_LONG_NUMBER_RE = re.compile(r"\b\d{4,}\b")
# Trailing "CITY ST" on card-statement descriptors: two-letter US state at the end.
_US_STATES = (
    "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny "
    "nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc"
).split()
_TRAILING_STATE_RE = re.compile(r"\s(?:" + "|".join(_US_STATES) + r")$")
_WS_RE = re.compile(r"\s+")


def clean_raw(raw: Optional[str]) -> str:
    """Strip processor prefixes, store numbers, amounts and dates from raw text."""
    if not raw:
        return ""
    s = raw.strip()
    s = _WORD_PREFIX_RE.sub("", s)
    s = _STAR_PREFIX_RE.sub("", s)
    s = _DOTCOM_RE.sub(r" \1", s)
    s = _STORE_NO_RE.sub(" ", s)
    s = _AMOUNT_RE.sub(" ", s)
    s = _DATE_RE.sub(" ", s)
    s = _LONG_NUMBER_RE.sub(" ", s)
    return _WS_RE.sub(" ", s).strip()


def normalize_text(raw: Optional[str]) -> str:
    """Full normalization used as the lookup key everywhere in category_rules."""
    s = _entity_normalizer.normalize(clean_raw(raw), entity_type="merchant")
    return s


def strip_trailing_state(normalized: str) -> str:
    """'blue bottle san francisco ca' -> 'blue bottle san francisco'. Only used
    as a second-chance lookup, since 'ca'/'in'/'me' are also real words."""
    return _TRAILING_STATE_RE.sub("", normalized).strip()
