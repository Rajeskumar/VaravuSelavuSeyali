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
        self.model = os.getenv("OCR_MODEL", "gpt-5")
        self.timeout = float(os.getenv("LLM_TIMEOUT_SEC", "180"))

    # ------------------- mock helpers -------------------
    @staticmethod
    def _parse_text(text: str) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """Very small parser used in tests and mock mode."""
        header: Dict[str, Any] = {
            "merchant_name": "",
            "purchased_at": "",
            "currency": "USD",
            "amount": 0.0,
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
            "You are an expert receipt parsing assistant. Your goal is 100% data accuracy.\n"
            "Return a JSON object with: `thought_process`, `debug_calculations`, `header`, and `items`.\n\n"
            "THOUGHT_PROCESS:\n"
            "1. Scan the receipt TOP to BOTTOM. List every single item found.\n"
            "2. Identify if discounts are per-item or subtotal-level.\n"
            "3. Explain how you calculated the line_total for valid items.\n\n"
            "DEBUG_CALCULATIONS (Required String):\n"
            "Show your math: 'Sum(line_totals) [X] + Tax [Y] + Tip [Z] - GlobalDiscount [W] = Calculated [C] vs HeaderTotal [T]'\n\n"
            "HEADERS requirements:\n"
            "- merchant_name, purchased_at (YYYY-MM-DD), currency.\n"
            "- amount: The final GRAND TOTAL (charge to card).\n"
            "- tax: Total tax.\n"
            "- tip: Tip amount.\n"
            "- discount: GLOBAL discounts only. Do NOT sum up per-item discounts here if they are already reflected in line_total.\n"
            "- description: Summary (e.g. 'Groceries at Walmart').\n"
            "- main_category_name/category_name: Choose from list below.\n\n"
            "ITEMS requirements (Array):\n"
            "- line_no, item_name, quantity, unit, unit_price.\n"
            "- line_total: The final price for this line. \n"
            "  * IF the receipt shows 'Price 5.00' and 'Discount -1.00' next to it, line_total is 4.00.\n"
            "  * IF the receipt shows a subtotal discount at the end, keep line_total as 5.00.\n"
            "- category_name: Best match.\n\n"
            f"Allowed Categories:\n{CATEGORY_PROMPT}\n\n"
            "CRITICAL RULES:\n"
            "1. MISSING ITEMS: Do not skip any line items. Long receipts must be fully parsed.\n"
            "2. UNIT PRICE vs TOTAL: If '2 @ 5.00', unit_price is 5.00, line_total is 10.00. Check the columns carefully.\n"
            "3. DISCOUNT DOUBLE COUNTING: \n"
            "   - If you subtract a discount from a `line_total`, DO NOT include it in `header.discount`.\n"
            "   - `header.discount` is ONLY for transaction-level discounts not applied to items.\n"
            "4. Respond ONLY with valid JSON."
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
                "You are an expert receipt parsing assistant. \n"
                "Return JSON with: `thought_process`, `debug_calculations`, `header`, `items`.\n"
                "THOUGHT_PROCESS: Scan top-to-bottom. Explain discount handling (per-item vs global).\n"
                "DEBUG_CALCULATIONS: 'Sum(items) + Tax + Tip - GlobalDiscount = Calculated vs Total'\n"
                "HEADER: merchant_name, purchased_at, currency, amount (grand total), tax, tip, "
                "discount (ONLY global), description, main/category_name. Categories: "
                f"{CATEGORY_PROMPT}.\n"
                "ITEMS: line_no, item_name, quantity, unit, unit_price, line_total, category_name.\n"
                "RULES: 1. Do not apply discounts twice. 2. Capture ALL items. 3. Verify math. "
                "Respond only with JSON. "
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
        warnings = parsed.get("warnings", [])
        
        # Verification: Check if items sum to total (approx)
        total_amt = float(header.get("amount", 0.0))
        items_sum = sum(float(i.get("line_total", 0.0)) for i in items)
        tax = float(header.get("tax", 0.0))
        tip = float(header.get("tip", 0.0))
        discount = float(header.get("discount", 0.0))
        
        calculated_total = items_sum + tax + tip - discount
        if total_amt > 0 and abs(total_amt - calculated_total) > 0.05:
            warnings.append(f"Discrepancy: Header {total_amt} != Calc {calculated_total:.2f}. Check if discounts are double-counted.")

        result: Dict[str, Any] = {
            "header": header,
            "items": items,
            "warnings": warnings,
            "fingerprint": fingerprint,
            "thought_process": parsed.get("thought_process", ""),
            "debug_calculations": parsed.get("debug_calculations", ""),
        }
        if save_ocr_text and parsed.get("ocr_text"):
            result["ocr_text"] = parsed["ocr_text"]
        return result
