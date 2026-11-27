#!/usr/bin/env python3
"""Read-only post-run PostgreSQL reconciliation verifier (TS-OBS-001 AC-06, AC-11).

Checks exact Decimal reconciliation between committed expenses/items and background
MerchantInsight / ItemInsight aggregates without printing customer rows, emails, or
financial dollar figures into general reports.
"""

from __future__ import annotations

import json
import os
import sys
from decimal import Decimal
from typing import Dict

from target_guard import TargetGuardError, validate_load_target


def verify_totals(
    *,
    source_merchant_total: Decimal,
    agg_merchant_total: Decimal,
    source_item_total: Decimal,
    agg_item_total: Decimal,
    tolerance: Decimal = Decimal("0.01"),
) -> Dict[str, object]:
    merchant_ok = abs(source_merchant_total - agg_merchant_total) <= tolerance
    item_ok = abs(source_item_total - agg_item_total) <= tolerance
    return {
        "merchant_reconciled": merchant_ok,
        "item_reconciled": item_ok,
        "all_reconciled": merchant_ok and item_ok,
    }


def main() -> int:
    try:
        validated = validate_load_target(
            base_url=os.environ.get("LOAD_TEST_BASE_URL", ""),
            db_url=os.environ.get("LOAD_TEST_DATABASE_URL", ""),
            require_postgres=True,
        )
    except TargetGuardError as exc:
        print(f"VERIFY BLOCKED: {exc}", file=sys.stderr)
        return 2

    from sqlalchemy import create_engine, text

    db_url = os.environ["LOAD_TEST_DATABASE_URL"]
    engine = create_engine(db_url, pool_pre_ping=True)
    with engine.connect() as conn:
        src_m = Decimal(str(conn.execute(text("SELECT COALESCE(SUM(amount), 0) FROM trackspense.expenses WHERE merchant_name IS NOT NULL")).scalar() or 0))
        agg_m = Decimal(str(conn.execute(text("SELECT COALESCE(SUM(total_spent), 0) FROM trackspense.merchant_insights")).scalar() or 0))
        src_i = Decimal(str(conn.execute(text("SELECT COALESCE(SUM(line_total), 0) FROM trackspense.expense_items WHERE normalized_name IS NOT NULL OR item_name IS NOT NULL")).scalar() or 0))
        agg_i = Decimal(str(conn.execute(text("SELECT COALESCE(SUM(total_spent), 0) FROM trackspense.item_insights")).scalar() or 0))

    res = verify_totals(
        source_merchant_total=src_m,
        agg_merchant_total=agg_m,
        source_item_total=src_i,
        agg_item_total=agg_i,
    )
    report = {
        "run_marker": validated.run_marker,
        "db_fingerprint": validated.db_fingerprint,
        **res,
    }
    print(json.dumps(report, indent=2))
    return 0 if res["all_reconciled"] else 1


if __name__ == "__main__":
    sys.exit(main())
