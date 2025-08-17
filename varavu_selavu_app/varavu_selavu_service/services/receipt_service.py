import base64
import hashlib
import json
import os
import re
from typing import Any, Dict, List, Tuple, Optional

import requests

# Category mapping used to ensure the model returns categories that align with the
# manual entry lists. These mirror the options available in the frontend.
CATEGORY_GROUPS = {
    "Home": ["Rent", "Electronics", "Furniture", "Household supplies", "Maintenance", "Mortgage", "Other", "Pets", "Services"],
    "Transportation": ["Gas/fuel", "Car", "Parking", "Plane", "Other", "Bicycle", "Bus/Train", "Taxi", "Hotel"],
    "Food & Drink": ["Groceries", "Dining out", "Liquor", "Other"],
    "Entertainment": ["Movies", "Other", "Games", "Music", "Sports"],
    "Life": ["Medical expenses", "Insurance", "Taxes", "Education", "Childcare", "Clothing", "Gifts", "Other"],
    "Other": ["Services", "General", "Electronics"],
    "Utilities": ["Heat/gas", "Electricity", "Water", "Other", "Cleaning", "Trash", "Other", "TV/Phone/Internet"],
}

CATEGORY_PROMPT = "; ".join(
    f"{main}: {', '.join(subs)}" for main, subs in CATEGORY_GROUPS.items()
)


class ReceiptService:
    """Parse receipts via OpenAI or Ollama; supports mock parsing for tests."""

    def __init__(self, engine: Optional[str] = None) -> None:
        self.engine = engine or os.getenv("OCR_ENGINE", "openai")
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.openai_base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
        self.model = os.getenv("OCR_MODEL", "gpt-4o-mini")

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
    def _call_openai(self, data: bytes, content_type: str) -> Dict[str, Any]:
        """Send the receipt bytes to the OpenAI vision endpoint."""
        headers = {
            "Authorization": f"Bearer {self.openai_api_key}",
            "Content-Type": "application/json",
        }
        prompt = (
            "Extract data from this grocery receipt as JSON. Return a `header` object "
            "and an `items` array. The header must include merchant_name, purchased_at "
            "(ISO 8601), currency, amount (total), tax, tip, discount, description, "
            "main_category_name and category_name (subcategory). Choose categories "
            "from this list and ensure the subcategory belongs to the main category: "
            f"{CATEGORY_PROMPT}. Each item needs line_no, item_name, quantity, unit, "
            "unit_price, line_total and category_name (one of the subcategories above). "
            "Use your own knowledge of grocery products to fix any misspellings or "
            "partial item names so they read naturally. All monetary values must be "
            "floating point dollars with no rounding. Respond only with the JSON "
            "structure."
        )

        if content_type == "application/pdf":
            upload_headers = {"Authorization": f"Bearer {self.openai_api_key}"}
            files = {"file": ("receipt.pdf", data, content_type)}
            upload_resp = requests.post(
                f"{self.openai_base_url}/files",
                headers=upload_headers,
                files=files,
                data={"purpose": "vision"},
                timeout=30,
            )
            upload_resp.raise_for_status()
            file_id = upload_resp.json()["id"]
            user_content = [
                {"type": "file", "file_id": file_id},
                {"type": "text", "text": prompt},
            ]
        else:
            b64 = base64.b64encode(data).decode()
            image_url = {"url": f"data:{content_type};base64,{b64}"}
            user_content = [
                {"type": "image_url", "image_url": image_url},
                {"type": "text", "text": prompt},
            ]

        body = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a receipt parsing assistant that always responds with JSON.",
                },
                {
                    "role": "user",
                    "content": user_content,
                },
            ],
            "response_format": {"type": "json_object"},
        }
        url = f"{self.openai_base_url}/chat/completions"
        resp = requests.post(url, headers=headers, json=body, timeout=30)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return json.loads(content)

    def _call_ollama(self, b64: str) -> Dict[str, Any]:
        payload = {
            "model": self.model,
            "prompt": (
                "Extract data from this grocery receipt image and respond with JSON. "
                "Provide a `header` with merchant_name, purchased_at (ISO 8601), currency, "
                "amount (total), tax, tip, discount, description, main_category_name and "
                "category_name (subcategory) using this mapping: "
                f"{CATEGORY_PROMPT}. Return an `items` array where each object has line_no, "
                "item_name, quantity, unit, unit_price, line_total and category_name (one of the "
                "subcategories above). Correct any misspelled item names using your knowledge of "
                "products. All monetary values must be floating point dollars. Image (base64): "
                + b64
            ),
            "format": "json",
        }
        resp = requests.post(f"{self.ollama_host}/api/generate", json=payload, timeout=30)
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
                parsed = self._call_openai(data, content_type)

        header = parsed.get("header", {})
        items = parsed.get("items", [])
        purchased_at_hour = header.get("purchased_at", "")[:13]
        top_names = "".join(i.get("item_name", "") for i in items[:3])
        fp_source = f"{header.get('merchant_name','')}{purchased_at_hour}{header.get('amount',0)}{top_names}"
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
