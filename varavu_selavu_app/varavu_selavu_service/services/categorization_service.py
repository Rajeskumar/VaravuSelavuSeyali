import json
import logging
from typing import Dict, List, Optional, Tuple

from varavu_selavu_service.services.chat_service import call_chat_model

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

class CategorizationService:
    """Classify expense descriptions into categories and subcategories."""

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

    def llm_classify(self, description: str) -> Optional[Tuple[str, str]]:
        """Use an LLM to classify descriptions when no deterministic match exists."""
        try:
            categories_json = json.dumps(CATEGORY_GROUPS)
            prompt = (
                "You categorize expense descriptions. "
                f"Available categories: {categories_json}. "
                "Strictly respond with ONLY JSON in the form {\"main_category\":\"...\", \"subcategory\":\"...\"} with no extra text or code fences. "
                f"Description: '{description}'."
            )
            response = call_chat_model(query=prompt, analysis={}, model=None)
            data = self._parse_json_response(response)
            main = data.get("main_category")
            sub = data.get("subcategory")
            if main in CATEGORY_GROUPS and sub in CATEGORY_GROUPS[main]:
                return main, sub
            raise ValueError(f"Invalid category combination: {main} / {sub}")
        except Exception as exc:  # pragma: no cover - network or parsing errors
            logger.warning("LLM classification failed: %s", exc)
        return None

    def classify(self, description: str) -> Tuple[str, str]:
        """Classify description using the LLM and fall back to Other/General."""
        result = self.llm_classify(description)
        if result:
            return result
        return "Other", "General"
