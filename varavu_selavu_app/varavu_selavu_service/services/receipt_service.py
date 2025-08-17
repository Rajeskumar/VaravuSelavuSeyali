import base64
import hashlib
import json
import os
import re
from typing import Any, Dict, List, Tuple, Optional

import requests


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
            "tax_cents": 0,
            "tip_cents": 0,
            "discount_cents": 0,
            "description": "Receipt import",
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
                header["amount_cents"] = int(float(line.split(":", 1)[1].strip()) * 100)
            elif lower.startswith("tax:"):
                header["tax_cents"] = int(float(line.split(":", 1)[1].strip()) * 100)
            elif lower.startswith("tip:"):
                header["tip_cents"] = int(float(line.split(":", 1)[1].strip()) * 100)
            elif lower.startswith("discount:"):
                header["discount_cents"] = int(float(line.split(":", 1)[1].strip()) * 100)
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
                            "unit_price_cents": int(float(m.group(5)) * 100),
                            "line_total_cents": int(float(m.group(6)) * 100),
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
            "Extract merchant_name, purchased_at (ISO 8601), currency, amount_cents, "
            "tax_cents, tip_cents, discount_cents, description and an array of line "
            "items from this grocery receipt. Each item needs line_no, item_name, "
            "quantity, unit, unit_price_cents, line_total_cents and optional category_name. "
            "All monetary values must be integers in cents. Respond only with JSON "
            "containing `header` and `items`."
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
                "Extract merchant, date, totals and line items from this receipt image. "
                "Return JSON with keys header and items. Image (base64): " + b64
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
        fp_source = f"{header.get('merchant_name','')}{purchased_at_hour}{header.get('amount_cents',0)}{top_names}"
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
