#!/usr/bin/env python3
"""Shared fixtures and exact-to-the-cent stored-data checks for flow .seed.py / .verify.py files (TS-QA-106).
Everything goes through the real API of the disposable test backend, with harness-minted tokens."""
from __future__ import annotations

import os
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seed  # noqa: E402

state = seed.load_state(os.environ["E2E_STATE"])
EMAIL = os.environ["USER_EMAIL"]
LABEL = os.environ["RUN_LABEL"]
api = seed.api_for(state, EMAIL)


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def call(method: str, path: str, body: dict | None = None, expect: tuple[int, ...] = (200, 201)):
    status, data = api.call(method, path, body)
    if status not in expect:
        raise SystemExit(f"{method} {path} -> {status}: {data}")
    return data


def check(ok: bool, message: str) -> None:
    if not ok:
        raise SystemExit(f"stored data check failed: {message}")


def personal_expense(description: str, cost: str) -> dict:
    return call("POST", "/api/v1/expenses", {"user_id": EMAIL, "cost": float(cost), "category": "Food",
                                              "description": description, "date": datetime.now().strftime("%m/%d/%Y")})


def personal(contains: str) -> list[dict]:
    return [e for e in api.expenses() if contains in (e.get("description") or "")]


def group_expense(gid: str, payer: str, members: list[str], description: str, cost: str) -> None:
    call("POST", f"/api/v1/groups/{gid}/expenses", {
        "date": datetime.now().strftime("%m/%d/%Y"), "description": description, "category": "Food & Dining",
        "amount": float(cost), "payers": [{"member_id": payer, "amount_paid": float(cost)}],
        "split": {"type": "equal", "entries": [{"member_id": m} for m in members]}})


def group_expenses(gid: str, contains: str) -> list[dict]:
    rows = call("GET", f"/api/v1/groups/{gid}/expenses")["items"]
    return [e for e in rows if contains in (e.get("description") or "")]


def check_group_expense(gid: str, contains: str, cost: str, payers: dict[str, str], shares: dict[str, str]) -> None:
    """Exactly one matching expense with exactly these payers and shares."""
    rows = group_expenses(gid, contains)
    check(len(rows) == 1, f"expected 1 group expense containing {contains!r}, found {len(rows)}")
    row = rows[0]
    got_payers = {p["member_id"]: money(p["amount_paid"]) for p in row["payer_summary"]}
    got_shares = {s["member_id"]: money(s["share"]) for s in row["splits"]}
    check(money(row["cost"]) == money(cost), f"cost {row['cost']} != {cost}")
    check(got_payers == {k: money(v) for k, v in payers.items()}, f"payers {got_payers} != {payers}")
    check(got_shares == {k: money(v) for k, v in shares.items()}, f"shares {got_shares} != {shares}")


def transfers(gid: str) -> list[tuple[str, str, Decimal]]:
    rows = call("GET", f"/api/v1/groups/{gid}/balances")["transfers"]
    return sorted((t["from_member_id"], t["to_member_id"], money(t["amount"])) for t in rows)


def settlements(gid: str) -> list[tuple[str, str, Decimal]]:
    rows = call("GET", f"/api/v1/groups/{gid}/settlements")
    return sorted((s["from_member_id"], s["to_member_id"], money(s["amount"])) for s in rows)


def recurring_template(description: str, cost: str) -> None:
    """A monthly template that first falls due tomorrow, so the launch-time due prompt stays closed."""
    start = date.today() + timedelta(days=1)
    call("POST", "/api/v1/recurring/upsert", {"description": description, "category": "Utilities",
                                              "day_of_month": start.day, "default_cost": float(cost),
                                              "start_date_iso": start.isoformat(), "status": "Active"})


def templates(contains: str) -> list[dict]:
    return [t for t in call("GET", "/api/v1/recurring/templates") if contains in t["description"]]
