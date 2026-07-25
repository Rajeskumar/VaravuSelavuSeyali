import base64
import hashlib
import json
import os
import re
from typing import Any, Dict, List, Tuple, Optional

import requests

from .categorization_service import CATEGORY_GROUPS

CATEGORY_PROMPT = "; ".join(
    f"{main}: {', '.join(subs)}" for main, subs in CATEGORY_GROUPS.items()
)

# Fallback used whenever the model's category can't be validated against CATEGORY_GROUPS —
# mirrors CategorizationService.classify()'s fallback so an unrecognized category behaves the
# same way here as it does in the quick-add flow, instead of saving an invalid string verbatim.
_FALLBACK_MAIN = "Other"
_FALLBACK_SUB = "General"


def _validate_header_category(main: Any, sub: Any) -> Tuple[str, str]:
    """Validate a header-level (main, sub) pair against CATEGORY_GROUPS, falling back to
    Other/General on any mismatch — the model sometimes paraphrases a category name (e.g.
    "Food and Drink" instead of "Food & Drink"), which would otherwise save a string that
    doesn't match any real category."""
    if isinstance(main, str) and isinstance(sub, str) and sub in CATEGORY_GROUPS.get(main, []):
        return main, sub
    return _FALLBACK_MAIN, _FALLBACK_SUB


def _validate_item_category(sub: Any, fallback_sub: str) -> str:
    """Validate a line item's category_name (subcategory only — items don't carry a separate
    main category) against any subcategory in CATEGORY_GROUPS. Falls back to the (already
    validated) header subcategory rather than a blank string, since that's the most useful
    default for an unrecognized item category."""
    if isinstance(sub, str) and any(sub in subs for subs in CATEGORY_GROUPS.values()):
        return sub
    return fallback_sub


class ReceiptService:
    """Parse receipts via Gemini or Ollama; supports mock parsing for tests."""

    def __init__(self, engine: Optional[str] = None) -> None:
        self.engine = engine or os.getenv("OCR_ENGINE", "gemini")
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "")
        self.ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self.model = os.getenv("OCR_MODEL", "gemini-2.5-flash")
        self.timeout = float(os.getenv("LLM_TIMEOUT_SEC", "180"))

    # ------------------- mock helpers -------------------
    @staticmethod
    def _parse_text(text: str) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """Very small parser used in tests and mock mode."""
        header: Dict[str, Any] = {
            "merchant_name": "",
            "purchased_at": "",
            "currency": "USD",
            "tax": 0.0,
            "tip": 0.0,
            "discount": 0.0,
            "description": "Receipt import",
            "main_category_name": "",
            "category_name": "",
        }
        items: List[Dict[str, Any]] = []
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        for line in lines:
            lower = line.lower()
            if lower.startswith("merchant:"):
                header["merchant_name"] = line.split(":", 1)[1].strip()
            elif lower.startswith("date:"):
                header["purchased_at"] = line.split(":", 1)[1].strip()
            elif lower.startswith("subtotal:") or lower.startswith("total:"):
                header["amount"] = float(line.split(":", 1)[1].strip())
            elif lower.startswith("tax:"):
                header["tax"] = float(line.split(":", 1)[1].strip())
            elif lower.startswith("tip:"):
                header["tip"] = float(line.split(":", 1)[1].strip())
            elif lower.startswith("discount:"):
                header["discount"] = float(line.split(":", 1)[1].strip())
            else:
                m = re.match(
                    r"^(\d+)\.\s+(.+)\s+qty\s+([0-9\.]+)\s+(\w+)\s+price\s+([0-9\.]+)\s+total\s+([0-9\.]+)",
                    line,
                    re.I,
                )
                if m:
                    items.append(
                        {
                            "line_no": int(m.group(1)),
                            "item_name": m.group(2).strip(),
                            "quantity": float(m.group(3)),
                            "unit": m.group(4),
                            "unit_price": float(m.group(5)),
                            "line_total": float(m.group(6)),
                            "category_name": "",
                        }
                    )
        return header, items

    # ------------------- AI calls -------------------
    def _call_gemini(self, data: bytes, content_type: str) -> Dict[str, Any]:
        """Send the receipt bytes to the Gemini generateContent endpoint."""
        system_prompt = (
            "You are an expert receipt parsing assistant. Given a grocery receipt, "
            "return a JSON object with a `header` and an `items` array. The header must "
            "include merchant_name, normalized_merchant_name (a clean, standardized "
            "version of the merchant name — e.g. 'WAL-MART #5213' becomes 'Walmart'), "
            "purchased_at (ISO 8601), currency, amount (total), "
            "tax, tip, discount, description, main_category_name, and category_name. "
            "Choose main and sub categories from: "
            f"{CATEGORY_PROMPT}. For each line item provide line_no, item_name, "
            "normalized_name (a clean, standardized product name — e.g. 'GV WHOLE MLK GL' "
            "becomes 'Great Value Whole Milk Gallon', 'BNLS SKNLS CHKN BRST' becomes "
            "'Boneless Skinless Chicken Breast'), "
            "quantity, unit, unit_price, line_total, and category_name. Correct any "
            "misspelled or partial item names using your knowledge of grocery products. "
            "Crucially, accurately identify taxes and discounts. A discount can be a global "
            "receipt discount, or a negative line item (set line_total to a negative number). "
            "Ensure that the sum of line_total for all items plus tax and tip, minus discount "
            "exactly matches the total amount. Be extremely careful not to miss tax details. "
            "All monetary values must be floating point dollars exactly as shown on the "
            "receipt with no rounding. Respond only with JSON."
        )

        b64 = base64.b64encode(data).decode()
        
        # Determine actual mimeType since Gemini requires it
        mime_type = content_type
        if content_type == "application/pdf":
            mime_type = "application/pdf"
        elif not mime_type.startswith("image/"):
            mime_type = "image/jpeg"

        body = {
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [
                {
                    "parts": [
                        {"text": "Parse this receipt and return JSON."},
                        {
                            "inlineData": {
                                "mimeType": mime_type,
                                "data": b64
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json"
            }
        }
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.gemini_api_key}"
        resp = requests.post(url, headers={"Content-Type": "application/json"}, json=body, timeout=self.timeout)
        resp.raise_for_status()
        
        resp_data = resp.json()
        try:
            content = resp_data["candidates"][0]["content"]["parts"][0]["text"]
            # Sometimes model wraps response in ```json ... ``` despite responseMimeType
            if content.startswith("```json"):
                content = content.strip("`").removeprefix("json").strip()
            return json.loads(content)
        except (KeyError, IndexError, json.JSONDecodeError) as e:
            raise Exception(f"Failed to parse Gemini response: {e}")

    def _call_ollama(self, b64: str) -> Dict[str, Any]:
        payload = {
            "model": self.model,
            "prompt": (
                "You are an expert receipt parsing assistant. Given the following "
                "base64-encoded grocery receipt image, return JSON with a `header` "
                "and an `items` array. The header must include merchant_name, "
                "normalized_merchant_name (a clean, standardized version of the "
                "merchant name — e.g. 'WAL-MART #5213' becomes 'Walmart'), "
                "purchased_at (ISO 8601), currency, amount (total), tax, tip, "
                "discount, description, main_category_name, and category_name. "
                "Choose categories from: "
                f"{CATEGORY_PROMPT}. Each item requires line_no, item_name, "
                "normalized_name (a clean, standardized product name — e.g. "
                "'GV WHOLE MLK GL' becomes 'Great Value Whole Milk Gallon'), "
                "quantity, unit, unit_price, line_total, and category_name. "
                "Fix any misspelled or partial item names using your knowledge of "
                "grocery products. Crucially, accurately identify taxes and discounts. "
                "A discount can be a global receipt discount, or a negative line item "
                "(set line_total to a negative number). Ensure the sum of line_total "
                "for all items plus tax and tip, minus discount exactly matches the "
                "total amount. Be extremely careful not to miss tax details. "
                "All monetary values must be floating point dollars exactly as shown. "
                "Respond only with JSON. Image (base64): "
                + b64
            ),
            "format": "json",
        }
        resp = requests.post(f"{self.ollama_host}/api/generate", json=payload, timeout=self.timeout)
        resp.raise_for_status()
        data = resp.json()
        return json.loads(data.get("response", "{}"))

    # ------------------- public API -------------------
    def parse(
        self,
        data: bytes,
        content_type: str = "image/png",
        save_ocr_text: bool = False,
    ) -> Dict[str, Any]:
        """Parse receipt bytes into structured data."""
        if self.engine == "mock":
            text = data.decode("utf-8", errors="ignore")
            header, items = self._parse_text(text)
            parsed: Dict[str, Any] = {"header": header, "items": items, "ocr_text": text}
        else:
            if self.engine == "ollama":
                b64 = base64.b64encode(data).decode()
                parsed = self._call_ollama(b64)
            else:
                parsed = self._call_gemini(data, content_type)

        header = parsed.get("header", {})
        items = parsed.get("items", [])

        # ── Normalize names (ensure fields always exist) ──
        # If the LLM returned normalized_merchant_name, keep it; otherwise
        # fall back to merchant_name as-is.
        if not header.get("normalized_merchant_name"):
            header["normalized_merchant_name"] = header.get("merchant_name", "")
        # Use the normalized merchant name as the description's merchant for
        # downstream insight tracking.
        header["merchant_name_raw"] = header.get("merchant_name", "")
        header["merchant_name"] = header["normalized_merchant_name"]

        # ── Validate categories against CATEGORY_GROUPS ──
        # The model sometimes paraphrases a category (e.g. "Food and Drink" instead of the
        # real "Food & Drink") — save an invalid string verbatim and it won't match anything
        # in the app's category picker/taxonomy. Mirrors CategorizationService.classify()'s
        # validate-or-fallback behavior, which the quick-add flow already relies on.
        header["main_category_name"], header["category_name"] = _validate_header_category(
            header.get("main_category_name"), header.get("category_name")
        )
        for item in items:
            if not item.get("normalized_name"):
                item["normalized_name"] = item.get("item_name", "Unknown")
            item["category_name"] = _validate_item_category(
                item.get("category_name"), header["category_name"]
            )

        purchased_at_hour = header.get("purchased_at", "")[:13]
        top_names = "".join(i.get("item_name", "") for i in items[:3])
        fp_source = f"{header.get('merchant_name_raw','')}{purchased_at_hour}{header.get('amount',0)}{top_names}"
        fingerprint = hashlib.sha256(fp_source.encode()).hexdigest()
        result: Dict[str, Any] = {
            "header": header,
            "items": items,
            "warnings": parsed.get("warnings", []),
            "fingerprint": fingerprint,
        }
        if save_ocr_text and parsed.get("ocr_text"):
            result["ocr_text"] = parsed["ocr_text"]
        return result
