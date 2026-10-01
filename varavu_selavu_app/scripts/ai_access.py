"""
scripts/ai_access.py
====================
Admin CLI for AI cost gating (services/ai_quota_service.py). There is no admin UI or API on
purpose, since that would be one more privileged surface to secure. Run this against the target
database instead.

Heads-up: the local `.env` DATABASE_URL points at PROD. Set DATABASE_URL explicitly when
you mean a different database.

Usage:
    PYTHONPATH=. poetry run python scripts/ai_access.py usage [--date YYYY-MM-DD] [--top 20]
    PYTHONPATH=. poetry run python scripts/ai_access.py show --email someone@example.com
    PYTHONPATH=. poetry run python scripts/ai_access.py set-limit --email someone@example.com --feature chat --limit 50
    PYTHONPATH=. poetry run python scripts/ai_access.py clear-limit --email someone@example.com [--feature chat]
    PYTHONPATH=. poetry run python scripts/ai_access.py grant-unlimited --email someone@example.com
    PYTHONPATH=. poetry run python scripts/ai_access.py block --email someone@example.com
    PYTHONPATH=. poetry run python scripts/ai_access.py reset --email someone@example.com   # back to 'default'
    PYTHONPATH=. poetry run python scripts/ai_access.py refund-today --email someone@example.com [--feature chat]
"""
from __future__ import annotations

import argparse
import sys
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm.attributes import flag_modified

from varavu_selavu_service.db.models import AiUsageDaily, User
from varavu_selavu_service.db.session import SessionLocal
from varavu_selavu_service.services.ai_quota_service import FEATURES, AiQuotaService, utc_today


def _user(db, email: str) -> User:
    user = db.query(User).filter(User.email == email.strip().lower()).first() or db.query(User).filter(
        User.email == email.strip()
    ).first()
    if user is None:
        sys.exit(f"No user with email {email!r}")
    return user


def cmd_usage(db, args) -> None:
    day = date.fromisoformat(args.date) if args.date else utc_today()
    total_cost, total_calls = db.query(
        func.coalesce(func.sum(AiUsageDaily.est_cost_usd), 0), func.coalesce(func.sum(AiUsageDaily.count), 0)
    ).filter(AiUsageDaily.day == day).one()
    budget = AiQuotaService(db).settings.AI_GLOBAL_DAILY_BUDGET_USD
    print(f"{day} (UTC): {int(total_calls)} calls, est ${float(total_cost):.4f} of ${budget:.2f} daily budget\n")

    print(f"{'feature':<12}{'calls':>8}{'in_tok':>12}{'out_tok':>12}{'est_usd':>12}")
    for feature, calls, tin, tout, cost in (
        db.query(
            AiUsageDaily.feature,
            func.sum(AiUsageDaily.count),
            func.sum(AiUsageDaily.input_tokens),
            func.sum(AiUsageDaily.output_tokens),
            func.sum(AiUsageDaily.est_cost_usd),
        )
        .filter(AiUsageDaily.day == day)
        .group_by(AiUsageDaily.feature)
        .order_by(AiUsageDaily.feature)
    ):
        print(f"{feature:<12}{int(calls):>8}{int(tin):>12}{int(tout):>12}{float(cost):>12.4f}")

    print(f"\nTop {args.top} users by estimated cost:")
    print(f"{'email':<40}{'calls':>8}{'est_usd':>12}")
    for email, calls, cost in (
        db.query(AiUsageDaily.user_email, func.sum(AiUsageDaily.count), func.sum(AiUsageDaily.est_cost_usd))
        .filter(AiUsageDaily.day == day)
        .group_by(AiUsageDaily.user_email)
        .order_by(func.sum(AiUsageDaily.est_cost_usd).desc())
        .limit(args.top)
    ):
        print(f"{email:<40}{int(calls):>8}{float(cost):>12.4f}")


def cmd_show(db, args) -> None:
    user = _user(db, args.email)
    usage = AiQuotaService(db).usage(user.email)
    print(f"{user.email}: access={user.ai_access} overrides={user.ai_limits_override or {}} "
          f"verified={user.email_verified}")
    for feature, u in usage["features"].items():
        limit = "unlimited" if u["limit"] is None else u["limit"]
        print(f"  {feature:<12} used {u['used']} / {limit}")
    print(f"  resets at {usage['resets_at']}, globally paused={usage['paused']}")


def cmd_set_limit(db, args) -> None:
    user = _user(db, args.email)
    overrides = dict(user.ai_limits_override or {})
    overrides[args.feature] = args.limit
    user.ai_limits_override = overrides
    flag_modified(user, "ai_limits_override")
    db.commit()
    print(f"{user.email}: {args.feature} daily limit set to {args.limit}")


def cmd_clear_limit(db, args) -> None:
    user = _user(db, args.email)
    overrides = dict(user.ai_limits_override or {})
    if args.feature:
        overrides.pop(args.feature, None)
    else:
        overrides = {}
    user.ai_limits_override = overrides or None
    flag_modified(user, "ai_limits_override")
    db.commit()
    print(f"{user.email}: overrides now {overrides or {}}")


def _set_access(db, email: str, access: str) -> None:
    user = _user(db, email)
    user.ai_access = access
    db.commit()
    print(f"{user.email}: ai_access = {access}")


def cmd_refund_today(db, args) -> None:
    user = _user(db, args.email)
    q = db.query(AiUsageDaily).filter(AiUsageDaily.user_email == user.email, AiUsageDaily.day == utc_today())
    if args.feature:
        q = q.filter(AiUsageDaily.feature == args.feature)
    n = q.update({AiUsageDaily.count: 0}, synchronize_session=False)
    db.commit()
    print(f"{user.email}: reset today's count on {n} feature row(s) (tokens/cost kept for the spend cap)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage per-user AI access and limits")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("usage", help="Today's (or a given day's) AI usage and spend")
    p.add_argument("--date")
    p.add_argument("--top", type=int, default=20)

    for name in ("show", "grant-unlimited", "block", "reset"):
        sub.add_parser(name).add_argument("--email", required=True)

    p = sub.add_parser("set-limit", help="Per-user daily limit override for one feature")
    p.add_argument("--email", required=True)
    p.add_argument("--feature", required=True, choices=FEATURES)
    p.add_argument("--limit", required=True, type=int)

    p = sub.add_parser("clear-limit", help="Remove per-user overrides (one feature, or all)")
    p.add_argument("--email", required=True)
    p.add_argument("--feature", choices=FEATURES)

    p = sub.add_parser("refund-today", help="Zero today's count so the user can keep going today")
    p.add_argument("--email", required=True)
    p.add_argument("--feature", choices=FEATURES)

    args = parser.parse_args()
    db = SessionLocal()
    try:
        {
            "usage": cmd_usage,
            "show": cmd_show,
            "set-limit": cmd_set_limit,
            "clear-limit": cmd_clear_limit,
            "refund-today": cmd_refund_today,
            "grant-unlimited": lambda d, a: _set_access(d, a.email, "unlimited"),
            "block": lambda d, a: _set_access(d, a.email, "blocked"),
            "reset": lambda d, a: _set_access(d, a.email, "default"),
        }[args.cmd](db, args)
    finally:
        db.close()


if __name__ == "__main__":
    main()
