import hashlib
import io
import re
from typing import Any, Dict, List, Tuple

try:
    from PIL import Image
    import pytesseract
except Exception:  # pragma: no cover - optional dependency
    Image = None
    pytesseract = None


class ReceiptService:
    """Perform OCR (in-memory) and parse receipts into structured data."""

    def __init__(self, engine: str = "tesseract"):
        self.engine = engine

    def _ocr(self, data: bytes) -> str:
        if self.engine == "tesseract" and pytesseract and Image:
            try:
                img = Image.open(io.BytesIO(data))
                return pytesseract.image_to_string(img)
            except Exception:
                pass
        # Fallback: treat as plain text
        return data.decode("utf-8", errors="ignore")

    # --- Parsing helpers ---
    @staticmethod
    def _parse_text(text: str) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
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
            if line.lower().startswith("merchant:"):
                header["merchant_name"] = line.split(":", 1)[1].strip()
            elif line.lower().startswith("date:"):
                header["purchased_at"] = line.split(":", 1)[1].strip()
            elif line.lower().startswith("subtotal:"):
                header["amount_cents"] = int(float(line.split(":", 1)[1].strip()) * 100)
            elif line.lower().startswith("tax:"):
                header["tax_cents"] = int(float(line.split(":", 1)[1].strip()) * 100)
            elif line.lower().startswith("tip:"):
                header["tip_cents"] = int(float(line.split(":", 1)[1].strip()) * 100)
            elif line.lower().startswith("discount:"):
                header["discount_cents"] = int(float(line.split(":", 1)[1].strip()) * 100)
            elif line.lower().startswith("total:"):
                header["amount_cents"] = int(float(line.split(":", 1)[1].strip()) * 100)
            else:
                m = re.match(r"^(\d+)\.\s+(.+)\s+qty\s+([0-9\.]+)\s+(\w+)\s+price\s+([0-9\.]+)\s+total\s+([0-9\.]+)", line, re.I)
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

    def parse(self, data: bytes, save_ocr_text: bool = False) -> Dict[str, Any]:
        text = self._ocr(data)
        header, items = self._parse_text(text)
        purchased_at_hour = header.get("purchased_at", "")[:13]
        top_names = "".join(i["item_name"] for i in items[:3])
        fp_source = f"{header.get('merchant_name','')}{purchased_at_hour}{header.get('amount_cents',0)}{top_names}"
        fingerprint = hashlib.sha256(fp_source.encode()).hexdigest()
        result: Dict[str, Any] = {
            "header": header,
            "items": items,
            "warnings": [],
            "fingerprint": fingerprint,
        }
        if save_ocr_text:
            result["ocr_text"] = text
        return result
