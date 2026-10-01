"""Measure the non-LLM categorizer against labelled descriptions.

Input is a CSV with header `description,main_category,subcategory` — e.g. an
export of your own past expenses (description -> the category you picked):

    poetry run python scripts/eval_categorize.py eval_data/categorize.csv
    poetry run python scripts/eval_categorize.py eval_data/categorize.csv --misses

Reports how often the rules answer at all (coverage), how often that answer is
right (precision), and the split by tier (merchant dictionary vs keyword rules).
Anything the rules don't answer would go to the LLM (or Other/General).
User memory isn't exercised here — it's per-user and learns from saves.
"""
from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from varavu_selavu_service.services.category_rules import get_rule_categorizer  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv_path")
    ap.add_argument("--misses", action="store_true", help="print wrong and unanswered rows")
    args = ap.parse_args()

    rules = get_rule_categorizer()
    total = answered = correct = 0
    by_source: Counter = Counter()
    right_by_source: Counter = Counter()
    wrong, unanswered = [], []
    with open(args.csv_path, newline="") as fh:
        for row in csv.DictReader(fh):
            desc = (row.get("description") or "").strip()
            want_sub = (row.get("subcategory") or "").strip()
            if not desc or not want_sub:
                continue
            total += 1
            m = rules.classify(desc)
            if m is None:
                unanswered.append(desc)
                continue
            answered += 1
            by_source[m.source] += 1
            if m.subcategory == want_sub:
                correct += 1
                right_by_source[m.source] += 1
            else:
                wrong.append((desc, want_sub, f"{m.main_category}/{m.subcategory}", m.source))

    if not total:
        print("No labelled rows found.", file=sys.stderr)
        return 1
    print(f"{total} descriptions")
    print(f"coverage : {answered}/{total} = {100 * answered / total:.1f}% answered without an LLM")
    if answered:
        print(f"precision: {correct}/{answered} = {100 * correct / answered:.1f}% of those answers correct")
    for src, n in by_source.most_common():
        print(f"  {src:8} {n:5} answers, {100 * right_by_source[src] / n:.1f}% correct")
    if args.misses:
        print("\nwrong:")
        for desc, want, got, src in wrong:
            print(f"  {desc!r}: want {want}, got {got} ({src})")
        print("\nunanswered:")
        for desc in unanswered:
            print(f"  {desc!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
