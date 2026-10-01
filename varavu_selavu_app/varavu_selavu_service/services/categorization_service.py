import json
import logging
from typing import Dict, List, Optional, Tuple, Union

import os
import requests
from sqlalchemy.orm import Session

from varavu_selavu_service.services.category_memory_service import CategoryMemoryService
from varavu_selavu_service.services.category_rules import get_rule_categorizer

logger = logging.getLogger("varavu_selavu.categorization")

# Mapping of main categories to their subcategories
CATEGORY_GROUPS: Dict[str, List[str]] = {
    "Home": [
        "Rent",
        "Electronics",
        "Furniture",
        "Household supplies",
        "Maintenance",
        "Mortgage",
        "Other",
        "Pets",
        "Services",
    ],
    "Transportation": [
        "Gas/fuel",
        "Car",
        "Parking",
        "Plane",
        "Other",
        "Bicycle",
        "Bus/Train",
        "Taxi",
        "Hotel",
    ],
    "Food & Drink": ["Groceries", "Dining out", "Liquor", "Other"],
    "Entertainment": ["Movies", "Other", "Games", "Music", "Sports"],
    "Life": [
        "Medical expenses",
        "Insurance",
        "Taxes",
        "Education",
        "Childcare",
        "Clothing",
        "Gifts",
        "Other",
    ],
    "Other": ["Services", "General", "Electronics"],
    "Utilities": [
        "Heat/gas",
        "Electricity",
        "Water",
        "Other",
        "Cleaning",
        "Trash",
        "Other",
        "TV/Phone/Internet",
    ],
}

CUSTOM_CARD_ALL_PURCHASES = "All Purchases"

# Flat set of every valid category_id a custom card's earning rule can reference (TS-CARD-112) —
# same bare sub-category strings Expense.category_id/CardEarningRule.category_id already use, so
# a self-reported rule can never reference a category that doesn't exist. Note "Other" (and a few
# others) appear under multiple main categories with the identical bare string — a pre-existing
# taxonomy ambiguity (see docs/features/card_coach's category-mapping notes), not something custom
# cards introduce; picking "Other" here is exactly as ambiguous as it already is for curated cards.
VALID_CATEGORY_IDS = frozenset(
    {sub for subs in CATEGORY_GROUPS.values() for sub in subs} | {CUSTOM_CARD_ALL_PURCHASES}
)


class CategorizationService:
    """Classify expense descriptions into categories and subcategories."""

    # (input_tokens, output_tokens) from the last LLM call, for AI quota settlement.
    last_usage: Optional[Tuple[int, int]] = None

    @property
    def model(self) -> str:
        return os.getenv("OCR_MODEL", "gemini-2.5-flash")

    def _parse_json_response(self, text: str) -> dict:
        """
        Normalize various LLM response shapes into a JSON object.
        Handles:
        - Plain JSON
        - JSON string (stringified JSON)
        - Code-fenced JSON (``` or ```json)
        - Leading/trailing prose around a JSON block
        """
        if not text:
            raise ValueError("Empty response")
        t = text.strip()
        # Strip markdown code fences if present
        if t.startswith("```"):
            # remove opening fence with optional language and closing fence
            t = t.split("\n", 1)[1] if "\n" in t else t
            if t.endswith("```"):
                t = t[: -3]
            t = t.strip()
        # Try direct JSON parse
        try:
            obj = json.loads(t)
            if isinstance(obj, str):
                # double-encoded JSON
                obj = json.loads(obj)
            if isinstance(obj, dict):
                return obj
        except Exception:
            pass
        # Try to extract first {...} block
        start = t.find("{")
        end = t.rfind("}")
        if start != -1 and end != -1 and end > start:
            obj = json.loads(t[start : end + 1])
            if isinstance(obj, dict):
                return obj
        # Fallback error
        raise ValueError("Unrecognized JSON format from LLM")

    def llm_classify(self, description: str) -> Optional[Tuple[str, str, Optional[str]]]:
        """Use an LLM to classify descriptions when no deterministic match exists.

        Returns a 3-tuple (main_category, subcategory, merchant_name) or None on failure.
        """
        try:
            categories_json = json.dumps(CATEGORY_GROUPS)
            prompt = (
                "You categorize expense descriptions. "
                f"Available categories: {categories_json}. "
                "Also infer the merchant or company name from the description if it can be identified (e.g. 'Starbucks', 'Amazon', 'PG&E'). "
                "If no merchant can be identified, set merchant_name to null. "
                "Strictly respond with ONLY JSON in the form "
                "{\"main_category\":\"...\", \"subcategory\":\"...\", \"merchant_name\":\"...\"} "
                "with no extra text or code fences. "
                f"Description: '{description}'."
            )
            
            # Call Gemini directly
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY not configured")
                
            model = self.model  # same model as receipt parsing
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            
            body = {
                "contents": [
                    {"parts": [{"text": prompt}]}
                ],
                "generationConfig": {
                    "responseMimeType": "application/json"
                }
            }
            
            resp = requests.post(url, headers={"Content-Type": "application/json"}, json=body, timeout=30)
            resp.raise_for_status()
            
            resp_data = resp.json()
            usage_meta = resp_data.get("usageMetadata") or {}
            if usage_meta:
                self.last_usage = (
                    int(usage_meta.get("promptTokenCount") or 0),
                    int(usage_meta.get("candidatesTokenCount") or 0),
                )
            response = resp_data["candidates"][0]["content"]["parts"][0]["text"]
            
            data = self._parse_json_response(response)
            main = data.get("main_category")
            sub = data.get("subcategory")
            merchant = data.get("merchant_name") or None
            if main in CATEGORY_GROUPS and sub in CATEGORY_GROUPS[main]:
                return main, sub, merchant
            raise ValueError(f"Invalid category combination: {main} / {sub}")
        except Exception as exc:  # pragma: no cover - network or parsing errors
            logger.warning("LLM classification failed: %s", exc)
        return None

    def suggest_local(
        self,
        description: str,
        user_email: Optional[str] = None,
        db: Optional[Session] = None,
    ) -> Optional[Dict[str, object]]:
        """Non-LLM tiers, in order: this user's own past pick, the merchant dictionary, keyword
        rules. Returns None when none of them has an answer (the caller may then try the LLM)."""
        rules = get_rule_categorizer()
        rule = rules.classify(description)
        if user_email and db is not None:
            remembered = CategoryMemoryService(db).lookup(
                user_email, description, rule.merchant_name if rule else None
            )
            if remembered:
                main, sub = remembered
                return {
                    "main_category": main,
                    "subcategory": sub,
                    "merchant_name": rule.merchant_name if rule else None,
                    "source": "memory",
                    "confidence": 0.99,
                }
        if rule:
            return {
                "main_category": rule.main_category,
                "subcategory": rule.subcategory,
                "merchant_name": rule.merchant_name,
                "source": rule.source,
                "confidence": rule.confidence,
            }
        return None

    def classify(self, description: str) -> Tuple[str, str, Optional[str]]:
        """Classify description using the LLM and fall back to Other/General.

        Returns a 3-tuple (main_category, subcategory, merchant_name).
        """
        result = self.llm_classify(description)
        if result:
            return result
        return "Other", "General", None
