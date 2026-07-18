"""
scripts/reconcile_entity_resolution.py
=======================================
TS-ENT-1xx dual-write reconciliation gate (spec §14.2 exit criterion:
"totals reconcile"). Run before cutting any read path over from the raw
string key (normalized_name / merchant_name) to the new canonical FK
(canonical_item_id / canonical_merchant_id).

Dual-write only sets the FK on a best-effort basis: a "suggested" (tier 4)
resolve intentionally writes nothing (spec §6.2 — ambiguous matches must not
silently link), and rows written before this feature shipped never got a
canonical_*_id until backfill_entity_resolution.py runs on them. So some
spend can be reachable via the raw string key but NOT via the canonical FK
today. Flipping a read path over while that gap exists would make that
spend silently vanish from insights. This script quantifies the gap —
per table, total spend reachable via the raw key vs. via the FK — and exits
non-zero if the uncovered share exceeds --tolerance-pct.

Usage:
    PYTHONPATH=. poetry run python scripts/reconcile_entity_resolution.py [--tolerance-pct 0.5]
"""
from __future__ import annotations

import argparse
import sys
from typing import Dict

from sqlalchemy import func
from sqlalchemy.orm import Session

from varavu_selavu_service.db.models import ItemInsight, MerchantInsight
from varavu_selavu_service.db.session import SessionLocal

_TARGETS = [
    ("item_insights", ItemInsight, ItemInsight.canonical_item_id),
    ("merchant_insights", MerchantInsight, MerchantInsight.canonical_merchant_id),
]


def reconcile(db: Session) -> Dict[str, dict]:
    results: Dict[str, dict] = {}
    for label, model, fk_column in _TARGETS:
        row_count, total_spent = db.query(
            func.count(model.id), func.coalesce(func.sum(model.total_spent), 0)
        ).one()
        linked_row_count, linked_spent = (
            db.query(func.count(model.id), func.coalesce(func.sum(model.total_spent), 0))
            .filter(fk_column.isnot(None))
            .one()
        )
        total_spent = float(total_spent or 0)
        linked_spent = float(linked_spent or 0)
        gap = total_spent - linked_spent
        gap_pct = (gap / total_spent * 100) if total_spent else 0.0
        results[label] = {
            "row_count": row_count,
            "linked_row_count": linked_row_count,
            "coverage_pct": (linked_row_count / row_count * 100) if row_count else 100.0,
            "total_spent": total_spent,
            "linked_spent": linked_spent,
            "gap": gap,
            "gap_pct": gap_pct,
        }
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--tolerance-pct", type=float, default=0.0,
        help="Max acceptable %% of total spend not yet reachable via the canonical FK (default: 0 — must fully reconcile)",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        results = reconcile(db)
    finally:
        db.close()

    ok = True
    for label, r in results.items():
        print(
            f"[{label}] rows={r['row_count']} linked={r['linked_row_count']} "
            f"coverage={r['coverage_pct']:.1f}% total_spent={r['total_spent']:.2f} "
            f"linked_spent={r['linked_spent']:.2f} gap={r['gap']:.2f} ({r['gap_pct']:.2f}%)"
        )
        if r["gap_pct"] > args.tolerance_pct:
            ok = False

    if not ok:
        print(
            f"\nFAIL: spend gap exceeds tolerance ({args.tolerance_pct}%). "
            f"Run scripts/backfill_entity_resolution.py before cutting over any read path."
        )
        sys.exit(1)

    print("\nOK: canonical FK coverage is within tolerance. Safe to proceed toward cutover.")


if __name__ == "__main__":
    main()
