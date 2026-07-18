"""
scripts/backfill_entity_resolution.py
======================================
TS-ENT-1xx: one-off backfill for ItemInsight/MerchantInsight rows written
before the dual-write change shipped (their canonical_item_id /
canonical_merchant_id is still NULL). Runs each row's raw key through the
exact same EntityResolutionService.resolve() cascade normal writes use, so
it produces the same classification a fresh write would — deliberately not
a separate/looser clustering heuristic, per the spec's guidance to err
toward under-merging rather than over-merging distinct entities (§17.2).
Aliases it writes are tagged source='backfill' so they stay distinguishable
from a genuine seed/user/LLM source later.

There is no safe dry-run mode: resolve()'s cascade (tiers 3 and 5) commits
internally the moment it creates a new canonical entity or alias, so any
attempt to roll back at the end of this script would not undo those
creations — they're already durable by then. Test against a snapshot or
staging database first, not a --dry-run flag.

Usage:
    PYTHONPATH=. poetry run python scripts/backfill_entity_resolution.py [--batch-size 500]
"""
from __future__ import annotations

import argparse
import logging
import uuid

from varavu_selavu_service.db.models import ItemInsight, MerchantInsight
from varavu_selavu_service.db.session import SessionLocal
from varavu_selavu_service.services.entity_resolution_service import EntityResolutionService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("varavu_selavu.backfill_entity_resolution")


def backfill_items(db, resolver: EntityResolutionService, batch_size: int) -> dict:
    rows = db.query(ItemInsight).filter(ItemInsight.canonical_item_id.is_(None)).all()
    linked = skipped = errors = 0
    for i, row in enumerate(rows, 1):
        try:
            result = resolver.resolve(row.normalized_name, "item", row.user_email, source_hint="backfill")
        except Exception:
            logger.exception("Failed to resolve item_insight %s ('%s')", row.id, row.normalized_name)
            errors += 1
            continue
        if result.canonical is not None:
            row.canonical_item_id = uuid.UUID(result.canonical.id)
            linked += 1
        else:
            skipped += 1  # ambiguous ("suggested") — left for a later confirm step, not linked
        if i % batch_size == 0:
            db.commit()
            logger.info("item_insights: committed through row %d/%d", i, len(rows))
    db.commit()
    return {"total": len(rows), "linked": linked, "skipped_ambiguous": skipped, "errors": errors}


def backfill_merchants(db, resolver: EntityResolutionService, batch_size: int) -> dict:
    rows = db.query(MerchantInsight).filter(MerchantInsight.canonical_merchant_id.is_(None)).all()
    linked = skipped = errors = 0
    for i, row in enumerate(rows, 1):
        try:
            result = resolver.resolve(row.merchant_name, "merchant", row.user_email, source_hint="backfill")
        except Exception:
            logger.exception("Failed to resolve merchant_insight %s ('%s')", row.id, row.merchant_name)
            errors += 1
            continue
        if result.canonical is not None:
            row.canonical_merchant_id = uuid.UUID(result.canonical.id)
            linked += 1
        else:
            skipped += 1
        if i % batch_size == 0:
            db.commit()
            logger.info("merchant_insights: committed through row %d/%d", i, len(rows))
    db.commit()
    return {"total": len(rows), "linked": linked, "skipped_ambiguous": skipped, "errors": errors}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()

    db = SessionLocal()
    resolver = EntityResolutionService(db)
    try:
        merchant_stats = backfill_merchants(db, resolver, args.batch_size)
        item_stats = backfill_items(db, resolver, args.batch_size)
    finally:
        db.close()

    print(f"merchant_insights: {merchant_stats}")
    print(f"item_insights: {item_stats}")


if __name__ == "__main__":
    main()
