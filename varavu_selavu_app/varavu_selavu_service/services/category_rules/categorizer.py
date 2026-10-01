"""RuleCategorizer — deterministic categorization, no network, no DB.

Lookup order for free-text descriptions (classify):
  1. Merchant dictionary, exact alias  ("Starbucks", "SQ *BLUE BOTTLE #12")
  2. Merchant dictionary, alias contained in the text as whole words
     ("coffee at starbucks downtown"), longest alias wins
  3. Merchant dictionary, fuzzy (rapidfuzz) for OCR/typing drift ("starbuks")
  4. Weighted keyword rules ("dinner with friends", "electric bill")
Per-user memory sits in front of all of this in CategorizationService, since
it needs the DB; this module stays pure so it's cheap to unit test.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, List, Optional, Tuple

from rapidfuzz import fuzz, process

from varavu_selavu_service.services.category_rules.keyword_rules import ITEM_KEYWORDS, KEYWORD_RULES
from varavu_selavu_service.services.category_rules.merchant_dictionary import EXACT_ONLY_ALIASES, MERCHANTS
from varavu_selavu_service.services.category_rules.normalizer import normalize_text, strip_trailing_state

# Aliases shorter than this only ever match as the whole text — "aa", "bk",
# "dg", "76" are fine as the entire description but meaningless inside one.
_MIN_CONTAINED_ALIAS_LEN = 4
_FUZZY_WHOLE_CUTOFF = 90
_FUZZY_TOKEN_CUTOFF = 90
_FUZZY_MIN_TOKEN_LEN = 6
_MAX_NGRAM = 5


@dataclass(frozen=True)
class Merchant:
    display_name: str
    main_category: str
    subcategory: str


@dataclass(frozen=True)
class RuleMatch:
    main_category: str
    subcategory: str
    merchant_name: Optional[str]
    source: str  # 'merchant' | 'keyword'
    confidence: float


def _phrase_regex(phrase: str) -> re.Pattern:
    words = phrase.split(" ")
    parts = [re.escape(w[:-1]) + r"\w*" if w.endswith("*") else re.escape(w) for w in words]
    return re.compile(r"(?<![\w])" + r"\s".join(parts) + r"(?![\w])")


class RuleCategorizer:
    def __init__(self) -> None:
        self._aliases: Dict[str, Merchant] = {}
        for (main, sub), entries in MERCHANTS.items():
            for entry in entries:
                names = [n for n in entry.split("|") if n.strip()]
                merchant = Merchant(display_name=names[0].strip(), main_category=main, subcategory=sub)
                for name in names:
                    key = normalize_text(name)
                    # First writer wins, so a more specific earlier entry isn't
                    # clobbered by a later generic alias with the same key.
                    if key and key not in self._aliases:
                        self._aliases[key] = merchant
        self._fuzzy_keys: List[str] = [
            k for k in self._aliases if len(k) >= _MIN_CONTAINED_ALIAS_LEN and k not in EXACT_ONLY_ALIASES
        ]
        self._fuzzy_token_keys: List[str] = [
            k for k in self._fuzzy_keys if " " not in k and len(k) >= _FUZZY_MIN_TOKEN_LEN
        ]
        self._keyword_rules: List[Tuple[re.Pattern, str, str, float, int]] = []
        for (main, sub), phrases in KEYWORD_RULES.items():
            for phrase, weight in phrases:
                self._keyword_rules.append((_phrase_regex(phrase), main, sub, weight, phrase.count(" ")))
        self._item_rules: List[Tuple[re.Pattern, str, str, int]] = []
        for (main, sub), phrases in ITEM_KEYWORDS.items():
            for phrase in phrases:
                self._item_rules.append((_phrase_regex(phrase), main, sub, len(phrase.rstrip("*"))))

    # ------------------------------------------------------------------
    # Merchants
    # ------------------------------------------------------------------
    def match_merchant(self, raw: Optional[str], allow_fuzzy: bool = True) -> Optional[Tuple[Merchant, float]]:
        """Best dictionary merchant for raw text, with a 0..1 confidence."""
        text = normalize_text(raw)
        if not text:
            return None
        for candidate in (text, strip_trailing_state(text)):
            if candidate in self._aliases:
                return self._aliases[candidate], 0.97

        tokens = text.split(" ")
        # Longest contained alias wins; earliest position breaks ties.
        for n in range(min(_MAX_NGRAM, len(tokens)), 0, -1):
            for i in range(0, len(tokens) - n + 1):
                gram = " ".join(tokens[i : i + n])
                if len(gram) < _MIN_CONTAINED_ALIAS_LEN or gram in EXACT_ONLY_ALIASES:
                    continue
                merchant = self._aliases.get(gram)
                if merchant:
                    return merchant, 0.9 if i == 0 else 0.85

        if not allow_fuzzy:
            return None
        hit = process.extractOne(text, self._fuzzy_keys, scorer=fuzz.ratio, score_cutoff=_FUZZY_WHOLE_CUTOFF)
        if hit:
            return self._aliases[hit[0]], round(hit[1] / 100 * 0.9, 3)
        for tok in tokens:
            if len(tok) < _FUZZY_MIN_TOKEN_LEN:
                continue
            hit = process.extractOne(tok, self._fuzzy_token_keys, scorer=fuzz.ratio, score_cutoff=_FUZZY_TOKEN_CUTOFF)
            if hit:
                return self._aliases[hit[0]], round(hit[1] / 100 * 0.8, 3)
        return None

    # ------------------------------------------------------------------
    # Keywords
    # ------------------------------------------------------------------
    def match_keywords(self, raw: Optional[str]) -> Optional[Tuple[str, str, float]]:
        text = normalize_text(raw)
        if not text:
            return None
        scores: Dict[Tuple[str, str], float] = {}
        for pattern, main, sub, weight, extra_words in self._keyword_rules:
            if pattern.search(text):
                # Multi-word phrases are more specific than any single word in them.
                scores[(main, sub)] = scores.get((main, sub), 0.0) + weight + extra_words
        if not scores:
            return None
        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        (main, sub), best = ranked[0]
        runner_up = ranked[1][1] if len(ranked) > 1 else 0.0
        # Confidence grows with the winning score and with the margin over the runner-up.
        confidence = min(0.85, 0.4 + 0.06 * best + 0.04 * (best - runner_up))
        return main, sub, round(confidence, 3)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def classify(self, description: Optional[str]) -> Optional[RuleMatch]:
        merchant_hit = self.match_merchant(description)
        if merchant_hit:
            merchant, confidence = merchant_hit
            return RuleMatch(merchant.main_category, merchant.subcategory, merchant.display_name, "merchant", confidence)
        keyword_hit = self.match_keywords(description)
        if keyword_hit:
            main, sub, confidence = keyword_hit
            return RuleMatch(main, sub, None, "keyword", confidence)
        return None

    def classify_item(
        self,
        item_name: Optional[str],
        fallback: Tuple[str, str],
    ) -> Tuple[str, str]:
        """Category for one receipt line item. `fallback` is the receipt's own
        (main, sub); restaurant receipts keep it for every item ("CHICKEN TIKKA"
        at a restaurant is a meal, not groceries)."""
        if fallback == ("Food & Drink", "Dining out"):
            return fallback
        text = normalize_text(item_name)
        if not text:
            return fallback
        best: Optional[Tuple[int, bool, str, str]] = None
        for pattern, main, sub, length in self._item_rules:
            if (main, sub) == ("Food & Drink", "Dining out"):
                continue
            if pattern.search(text):
                # Longest matching phrase wins; on a tie prefer the receipt's own category.
                key = (length, (main, sub) == fallback, main, sub)
                if best is None or key[:2] > best[:2]:
                    best = key
        if best is None:
            return fallback
        return best[2], best[3]

    def receipt_signals(self, text: str) -> Optional[Tuple[str, str]]:
        """Whole-receipt hints when the merchant is unknown: tips/servers mean a
        restaurant, pump/gallons mean a gas station."""
        t = normalize_text(text)
        if re.search(r"\b(gratuity|tip|server|table|guests?|dine in|take out|to go)\b", t):
            return ("Food & Drink", "Dining out")
        if re.search(r"\b(pump|gallons?|unleaded|diesel|price gal)\b", t):
            return ("Transportation", "Gas/fuel")
        if re.search(r"\b(rx|pharmacist|prescription)\b", t):
            return ("Life", "Medical expenses")
        return None


@lru_cache(maxsize=1)
def get_rule_categorizer() -> RuleCategorizer:
    return RuleCategorizer()
