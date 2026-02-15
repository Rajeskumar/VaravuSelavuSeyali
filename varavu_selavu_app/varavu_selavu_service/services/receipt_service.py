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
    def _call_openai(self, data: bytes, content_type: str) -> Dict[str, Any]:
        """Send the receipt bytes to the OpenAI vision endpoint."""
        headers = {
            "Authorization": f"Bearer {self.openai_api_key}",
            "Content-Type": "application/json",
        }
        system_prompt = (
            "You are an expert receipt parsing assistant. Given a grocery receipt, "
            "return a JSON object with a `header` and an `items` array. The header must "
            "include merchant_name, purchased_at (ISO 8601), currency, amount (total), "
            "tax, tip, discount, description, main_category_name, and category_name. "
            "Choose main and sub categories from: "
            f"{CATEGORY_PROMPT}. For each line item provide line_no, item_name, "
            "quantity, unit, unit_price, line_total, and category_name. Correct any "
            "misspelled or partial item names using your knowledge of grocery products. "
            "All monetary values must be floating point dollars exactly as shown on the "
            "receipt with no rounding. Respond only with JSON."
        )

        if content_type == "application/pdf":
            upload_headers = {"Authorization": f"Bearer {self.openai_api_key}"}
            files = {"file": ("receipt.pdf", data, content_type)}
            upload_resp = requests.post(
                f"{self.openai_base_url}/files",
                headers=upload_headers,
                files=files,
                data={"purpose": "vision"},
                timeout=self.timeout,
            )
            upload_resp.raise_for_status()
            file_id = upload_resp.json()["id"]
            user_content = [
                {"type": "file", "file_id": file_id},
                {"type": "text", "text": "Parse this receipt and return JSON."},
            ]
        else:
            b64 = base64.b64encode(data).decode()
            image_url = {"url": f"data:{content_type};base64,{b64}"}
            user_content = [
                {"type": "image_url", "image_url": image_url},
                {"type": "text", "text": "Parse this receipt and return JSON."},
            ]

        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "response_format": {"type": "json_object"},
        }
        url = f"{self.openai_base_url}/chat/completions"
        resp = requests.post(url, headers=headers, json=body, timeout=self.timeout)
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return json.loads(content)

    def _call_ollama(self, b64: str) -> Dict[str, Any]:
        payload = {
            "model": self.model,
            "prompt": (
                "You are an expert receipt parsing assistant. Given the following "
                "base64-encoded grocery receipt image, return JSON with a `header` "
                "and an `items` array. The header must include merchant_name, "
                "purchased_at (ISO 8601), currency, amount (total), tax, tip, "
                "discount, description, main_category_name, and category_name. "
                "Choose categories from: "
                f"{CATEGORY_PROMPT}. Each item requires line_no, item_name, "
                "quantity, unit, unit_price, line_total, and category_name. "
                "Fix any misspelled or partial item names using your knowledge of "
                "grocery products. All monetary values must be floating point "
                "dollars exactly as shown on the receipt. Respond only with JSON. "
                "Image (base64): "
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
