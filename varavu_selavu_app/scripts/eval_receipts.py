"""Measure receipt-parsing accuracy on real receipt photos.

Put photos in a folder (default: eval_data/receipts/, gitignored) next to an
expected-answer file with the same stem:

    eval_data/receipts/costco_0914.jpg
    eval_data/receipts/costco_0914.expected.json

    {"merchant": "Costco Wholesale", "date": "2026-09-14", "total": 143.76,
     "tax": 3.30, "items": [{"name": "KS WATER 40PK", "total": 4.49}, ...]}

"items" is optional. Then:

    poetry run python scripts/eval_receipts.py                  # local OCR only (free)
    poetry run python scripts/eval_receipts.py --engines local,gemini
    poetry run python scripts/eval_receipts.py --bootstrap      # write missing
        # .expected.json files from Gemini's reading, for you to hand-correct

"hybrid" is scored as: the local result when its confidence clears
OCR_LLM_FALLBACK_MIN_CONF, otherwise Gemini's — i.e. exactly what the /parse
route would return — and the report shows how often it would call the LLM.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rapidfuzz import fuzz  # noqa: E402

from varavu_selavu_service.core.config import Settings  # noqa: E402
from varavu_selavu_service.services.category_rules.normalizer import normalize_text  # noqa: E402
from varavu_selavu_service.services.receipt_service import ReceiptService  # noqa: E402

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".pdf"}


def _mime(path: Path) -> str:
    if path.suffix.lower() in (".heic", ".heif"):
        return "image/heic"
    return mimetypes.guess_type(path.name)[0] or "image/jpeg"


def _same_merchant(got: str, want: str) -> bool:
    a, b = normalize_text(got), normalize_text(want)
    return bool(a and b) and (a == b or fuzz.token_set_ratio(a, b) >= 85)


def _close(a: Any, b: Any) -> bool:
    try:
        return abs(float(a) - float(b)) <= 0.011
    except (TypeError, ValueError):
        return False


def _item_f1(got: List[Dict[str, Any]], want: List[Dict[str, Any]]) -> float:
    """An item matches when its price matches and its name is similar; each expected item
    can be matched once."""
    if not want:
        return 1.0 if not got else 0.0
    unmatched = list(want)
    hits = 0
    for g in got:
        for w in unmatched:
            if _close(g.get("line_total"), w.get("total")) and fuzz.token_set_ratio(
                normalize_text(g.get("item_name")), normalize_text(w.get("name"))
            ) >= 70:
                unmatched.remove(w)
                hits += 1
                break
    if hits == 0:
        return 0.0
    precision, recall = hits / len(got), hits / len(want)
    return 2 * precision * recall / (precision + recall)


def score(result: Dict[str, Any], expected: Dict[str, Any]) -> Dict[str, Optional[float]]:
    h = result.get("header", {})
    out: Dict[str, Optional[float]] = {
        "merchant": float(_same_merchant(h.get("merchant_name") or "", expected.get("merchant", ""))),
        "date": float(str(h.get("purchased_at") or "")[:10] == expected.get("date")),
        "total": float(_close(h.get("amount"), expected.get("total"))),
        "tax": float(_close(h.get("tax"), expected.get("tax"))) if "tax" in expected else None,
        "items_f1": _item_f1(result.get("items", []), expected["items"]) if "items" in expected else None,
    }
    return out


def run_engine(svc: ReceiptService, engine: str, data: bytes, mime: str, cache: Dict[str, Any]) -> Dict[str, Any]:
    if engine == "local":
        if "local" not in cache:
            cache["local"] = svc.parse_ocr(data, content_type=mime)
        return cache["local"]
    if engine == "gemini":
        if "gemini" not in cache:
            cache["gemini"] = svc.parse(data, content_type=mime, engine="gemini")
        return cache["gemini"]
    if engine == "hybrid":
        try:
            local = run_engine(svc, "local", data, mime, cache)
        except Exception:
            local = None
        if local is not None and local["confidence"] >= Settings().OCR_LLM_FALLBACK_MIN_CONF:
            return {**local, "_llm_called": False}
        return {**run_engine(svc, "gemini", data, mime, cache), "_llm_called": True}
    raise ValueError(engine)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", nargs="?", default="eval_data/receipts")
    ap.add_argument("--engines", default="local", help="comma list of local,gemini,hybrid")
    ap.add_argument("--bootstrap", action="store_true", help="write missing .expected.json from Gemini")
    ap.add_argument("-v", "--verbose", action="store_true", help="print per-receipt misses")
    args = ap.parse_args()

    folder = Path(args.folder)
    images = sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXTS) if folder.is_dir() else []
    if not images:
        print(f"No receipt images in {folder}/", file=sys.stderr)
        return 1
    svc = ReceiptService(engine="local")
    engines = [e.strip() for e in args.engines.split(",") if e.strip()]
    fields = ["merchant", "date", "total", "tax", "items_f1"]
    totals: Dict[str, Dict[str, List[float]]] = {e: {f: [] for f in fields} for e in engines}
    llm_calls = 0
    seconds: Dict[str, List[float]] = {e: [] for e in engines}

    for img in images:
        expected_path = img.with_suffix(".expected.json")
        data, mime = img.read_bytes(), _mime(img)
        cache: Dict[str, Any] = {}
        if not expected_path.exists():
            if args.bootstrap:
                g = run_engine(svc, "gemini", data, mime, cache)
                h = g["header"]
                draft = {
                    "merchant": h.get("merchant_name"),
                    "date": str(h.get("purchased_at") or "")[:10],
                    "total": h.get("amount"),
                    "tax": h.get("tax"),
                    "items": [{"name": i.get("item_name"), "total": i.get("line_total")} for i in g.get("items", [])],
                }
                expected_path.write_text(json.dumps(draft, indent=2) + "\n")
                print(f"wrote {expected_path} — review and correct it")
            else:
                print(f"skip {img.name}: no {expected_path.name}")
            continue
        expected = json.loads(expected_path.read_text())
        for engine in engines:
            t0 = time.time()
            try:
                result = run_engine(svc, engine, data, mime, cache)
            except Exception as exc:  # a crash scores zero on every field
                print(f"{img.name} [{engine}] failed: {exc}")
                result = {"header": {}, "items": []}
            seconds[engine].append(time.time() - t0)
            if engine == "hybrid" and result.get("_llm_called"):
                llm_calls += 1
            s = score(result, expected)
            for f in fields:
                if s[f] is not None:
                    totals[engine][f].append(s[f])
            if args.verbose:
                misses = [f for f in fields if s[f] is not None and s[f] < 1]
                if misses:
                    h = result.get("header", {})
                    print(f"  {img.name} [{engine}] missed {misses}: merchant={h.get('merchant_name')!r} "
                          f"date={h.get('purchased_at')!r} total={h.get('amount')} tax={h.get('tax')} "
                          f"conf={result.get('confidence')}")

    n = max((len(v["total"]) for v in totals.values()), default=0)
    print(f"\n{n} receipts scored\n")
    print(f"{'engine':8} " + " ".join(f"{f:>9}" for f in fields) + f" {'avg sec':>8}")
    for engine in engines:
        cells = []
        for f in fields:
            vals = totals[engine][f]
            cells.append(f"{100 * sum(vals) / len(vals):8.1f}%" if vals else f"{'-':>9}")
        avg = sum(seconds[engine]) / len(seconds[engine]) if seconds[engine] else 0
        print(f"{engine:8} " + " ".join(cells) + f" {avg:8.1f}")
    if "hybrid" in engines and n:
        print(f"\nhybrid would call the LLM on {llm_calls}/{n} receipts ({100 * llm_calls / n:.0f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
