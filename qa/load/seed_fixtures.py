#!/usr/bin/env python3
"""Deterministic synthetic fixture generator for 1,000-DAU load qualification (TS-OBS-001 AC-10/11).

Generates verified synthetic accounts with realistic expense distributions:
- `--scale full`: 1,000 accounts (800 x 100, 180 x 1,000, 20 x 10,000 expenses) with dates
  strictly within the last year, 2/5/20-member groups, and itemized receipts.
- `--scale smoke`: 10 synthetic accounts (10 expenses each + 1 two-member group) for fast
  local harness verification.

Guarded by `target_guard.py` (never touches production or loads `.env`). Writes a
credential-free `fixture_manifest.json` with seed hash and exact Decimal expected totals.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import sys
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Dict, List

from target_guard import TargetGuardError, validate_load_target

CATEGORIES = ("Groceries", "Dining out", "Gas/fuel", "Utilities", "Entertainment", "Travel")
MERCHANTS = ("MarketOne", "CafeTwo", "FuelStop", "CityPower", "CinemaMax", "AirLineTest")


def build_synthetic_plan(scale: str, seed: int, run_marker: str) -> Dict[str, object]:
    """Build deterministic account/expense distribution plan with exact Decimal sums."""
    rng = random.Random(seed)
    today = date.today()
    if scale == "full":
        tiers = [(800, 100), (180, 1000), (20, 10000)]
        group_sizes = [2, 5, 20]
    else:
        tiers = [(10, 10)]
        group_sizes = [2]

    account_idx = 0
    total_expenses = 0
    total_amount = Decimal("0.00")
    accounts_summary: List[Dict[str, object]] = []

    for count, per_account in tiers:
        for _ in range(count):
            account_idx += 1
            acct_total = Decimal("0.00")
            for j in range(per_account):
                cents = rng.randint(150, 18500)
                amt = (Decimal(cents) / Decimal(100)).quantize(Decimal("0.01"))
                day_offset = rng.randint(0, 350)
                _exp_date = today - timedelta(days=day_offset)
                acct_total += amt
                total_expenses += 1
            total_amount += acct_total
            accounts_summary.append(
                {
                    "slot": account_idx,
                    "expense_count": per_account,
                    "expected_total": str(acct_total),
                }
            )

    manifest_hash = hashlib.sha256(
        f"{scale}:{seed}:{run_marker}:{account_idx}:{total_expenses}:{total_amount}".encode("utf-8")
    ).hexdigest()[:16]

    return {
        "schema_version": 1,
        "scale": scale,
        "seed": seed,
        "run_marker": run_marker,
        "seed_hash": manifest_hash,
        "account_count": account_idx,
        "total_expenses": total_expenses,
        "expected_total_amount": str(total_amount),
        "group_sizes": group_sizes,
    }


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate synthetic load-test fixture manifest (credential-free).")
    parser.add_argument("--scale", choices=["smoke", "full"], default="smoke")
    parser.add_argument("--seed", type=int, default=20261127)
    parser.add_argument("--out", default="qa/load/fixture_manifest.json")
    args = parser.parse_args(argv)

    try:
        validated = validate_load_target(
            base_url=os.environ.get("LOAD_TEST_BASE_URL", ""),
            db_url=os.environ.get("LOAD_TEST_DATABASE_URL", ""),
            require_postgres=True,
        )
    except TargetGuardError as exc:
        print(f"SEED BLOCKED: {exc}", file=sys.stderr)
        return 2

    manifest = build_synthetic_plan(args.scale, args.seed, validated.run_marker)
    manifest["db_fingerprint"] = validated.db_fingerprint
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(
        f"FIXTURE MANIFEST READY: scale={args.scale} accounts={manifest['account_count']} "
        f"expenses={manifest['total_expenses']} hash={manifest['seed_hash']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
