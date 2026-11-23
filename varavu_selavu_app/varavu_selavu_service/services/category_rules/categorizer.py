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
from varavu_selavu_service.services.category_rules.normalizer import clean_raw, normalize_text, strip_trailing_state

# Aliases shorter than this only ever match as the whole text — "aa", "bk",
# "dg", "76" are fine as the entire description but meaningless inside one.
_MIN_CONTAINED_ALIAS_LEN = 4
_FUZZY_WHOLE_CUTOFF = 90
_FUZZY_TOKEN_CUTOFF = 90
_FUZZY_MIN_TOKEN_LEN = 6
_MAX_NGRAM = 5

# Words that may follow an everyday-word merchant without changing what it is
# ("target run", "shell stop") — see _exact_only_in_context.
_MERCHANT_FILLER = frozenset({
    "run", "trip", "order", "purchase", "purchases", "shopping", "visit", "stop", "bill", "payment",
    "subscription", "store", "today", "yesterday", "tonight", "again",
})
_PLACE_PREPOSITIONS = frozenset({"at", "from"})

# --- Merchant-name guessing for descriptions that aren't dictionary merchants ---
# "lunch at Joe's Pizza" -> "Joe's Pizza". The trailing clause stops at a word that starts
# a new phrase ("... for the team", "... on Friday").
_AT_PLACE_RE = re.compile(
    r"(?:^|\s)(?:at|from|@)\s+(?P<name>.+?)(?:\s+(?:for|on|with|in|to|today|yesterday|tonight|last|this)\b.*)?$",
    re.IGNORECASE,
)
# Words that name a kind of business; a capitalized description containing one reads as a
# business name ("Taj Indian Kitchen", "Ace Auto Repair").
_BUSINESS_NOUNS = frozenset({
    "pizza", "pizzeria", "kitchen", "grill", "cafe", "café", "coffee", "bakery", "deli", "diner",
    "bistro", "bar", "pub", "tavern", "restaurant", "market", "mart", "grocery", "groceries", "foods",
    "sushi", "ramen", "taqueria", "cantina", "trattoria", "brasserie", "dhaba", "sweets", "salon",
    "spa", "barber", "barbershop", "pharmacy", "clinic", "dental", "hardware", "auto", "motors",
    "cleaners", "laundry", "liquor", "liquors", "wine", "wines", "brewery", "brewing", "palace",
    "inn", "hotel", "motel", "store", "shop", "boutique", "studio", "fitness", "gym", "center",
    "centre", "co", "company", "llc", "inc", "ltd", "bazaar", "bazar", "supermarket", "garage",
    "tire", "tires", "nails", "eatery", "steakhouse", "bbq", "creamery", "donuts", "bagels",
    "burgers", "tacos", "wings", "noodles", "biryani", "express", "outlet", "depot", "plaza",
})
# A place that isn't a business ("dinner at home", "coffee at work").
_GENERIC_PLACE_WORDS = frozenset({
    "home", "work", "office", "the", "a", "an", "my", "our", "his", "her", "their", "mall", "store",
    "shop", "restaurant", "cafe", "bar", "pub", "airport", "station", "school", "college", "gym",
    "hotel", "place", "house", "party", "friends", "friend", "mom", "dad", "mum", "parents", "beach",
    "park", "downtown", "city", "there", "here", "night", "lunch", "dinner", "breakfast", "brunch",
    "event", "concert", "game", "stadium", "hospital", "church", "temple", "market", "grocery",
    "supermarket", "gas", "station", "pharmacy", "work", "conference", "trip", "vacation",
})
_MAX_GUESSED_NAME_WORDS = 6


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

        contextual = self._exact_only_in_context(tokens)
        if contextual:
            return contextual, 0.85

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

    def _exact_only_in_context(self, tokens: List[str]) -> Optional[Merchant]:
        """Everyday-word merchants ("shell", "subway", "target") only match as the whole text,
        so "lemonade stand" never becomes Lemonade Insurance. They're still the merchant when
        they lead the description and the rest agrees with them ("Shell gas", "Subway
        sandwich", "Target run") or follow "at"/"from" ("lunch at Subway")."""
        for n in range(min(3, len(tokens)), 0, -1):
            spans = [(0, n)] + [
                (i, i + n) for i in range(1, len(tokens) - n + 1) if tokens[i - 1] in _PLACE_PREPOSITIONS
            ]
            for start, end in spans:
                gram = " ".join(tokens[start:end])
                if gram not in EXACT_ONLY_ALIASES or gram not in self._aliases:
                    continue
                merchant = self._aliases[gram]
                if start > 0:
                    return merchant
                rest = tokens[end:]
                if all(t in _MERCHANT_FILLER for t in rest):
                    return merchant
                kw = self.match_keywords(" ".join(rest))
                if kw and kw[0] == merchant.main_category:
                    return merchant
        return None

    def guess_merchant_name(self, raw: Optional[str]) -> Optional[str]:
        """Best-effort merchant name for a description that isn't a dictionary merchant.
        Deliberately conservative: a wrong merchant is worse than none, so ordinary phrases
        ("dinner with friends", "coffee at work") return None."""
        text = clean_raw(raw)
        if not text:
            return None
        m = _AT_PLACE_RE.search(text)
        if m:
            name = self._tidy_name(m.group("name"))
            if name and not self._is_generic_place(name):
                return name
            return None
        words = text.split()
        if not 2 <= len(words) <= _MAX_GUESSED_NAME_WORDS:
            return None
        lowered = [w.lower().strip(".,'’") for w in words]
        has_business_noun = any(w in _BUSINESS_NOUNS for w in lowered)
        has_name_word = any(w not in _BUSINESS_NOUNS for w in lowered)
        # Typed as a name: every word capitalized (or the whole thing in caps, as on statements).
        looks_like_a_name = all(w[:1].isupper() or not w[:1].isalpha() for w in words)
        if has_business_noun and has_name_word and looks_like_a_name:
            return self._tidy_name(text)
        return None

    @staticmethod
    def _tidy_name(name: str) -> Optional[str]:
        name = re.sub(r"\s+", " ", name).strip(" .,;:!-")
        words = name.split(" ")
        if not name or len(words) > _MAX_GUESSED_NAME_WORDS or len(name) > 60 or not re.search(r"[A-Za-z]", name):
            return None
        if name.islower():
            name = " ".join(w[:1].upper() + w[1:] for w in words)
        elif name.isupper():
            name = " ".join(w[:1] + w[1:].lower() for w in words)
        return name

    @staticmethod
    def _is_generic_place(name: str) -> bool:
        tokens = [t for t in normalize_text(name).split(" ") if t]
        return not tokens or all(t in _GENERIC_PLACE_WORDS for t in tokens)

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
            return RuleMatch(main, sub, self.guess_merchant_name(description), "keyword", confidence)
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
