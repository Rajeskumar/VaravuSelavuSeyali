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

    def llm_classify(self, description: str) -> Optional[Tuple[str, str]]:
        """Use an LLM to classify descriptions when no deterministic match exists."""
        try:
            categories_json = json.dumps(CATEGORY_GROUPS)
            prompt = (
                "You categorize expense descriptions. "
                f"Available categories: {categories_json}. "
                "Respond with JSON {\"main_category\":\"...\", \"subcategory\":\"...\"} "
                f"for: '{description}'."
            )
            response = call_chat_model(query=prompt, analysis={}, model=None)
            data = json.loads(response.strip())
            main = data.get("main_category")
            sub = data.get("subcategory")
            if main in CATEGORY_GROUPS and sub in CATEGORY_GROUPS[main]:
                return main, sub
        except Exception as exc:  # pragma: no cover - network or parsing errors
            logger.warning("LLM classification failed: %s", exc)
        return None

    def classify(self, description: str) -> Tuple[str, str]:
        """Classify description using the LLM and fall back to Other/General."""
        result = self.llm_classify(description)
        if result:
            return result
        return "Other", "General"
