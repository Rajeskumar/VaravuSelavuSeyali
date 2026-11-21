"""Seed a demo account with realistic data through the public API.

Used for the home-page product tour screenshots (varavu_selavu_ui/public/screenshots/home/) and
as the reproducible app-store reviewer account. Everything goes through the HTTP API, so derived
data (group balances, card attribution, budgets) is built exactly as for a real user.

Local run (throwaway Postgres built with `Base.metadata.create_all` plus
scripts/manual_seed_card_catalog_2026_08_24.sql, which create_all does not load):

    poetry run python scripts/seed_demo.py --base-url http://127.0.0.1:8095 \
        --verify-db postgresql://postgres@localhost:5545/demo

Safety: both URLs must point at localhost unless --allow-remote is passed. For a real deployment
(the reviewer account), pass --allow-remote with your own --email/--password, skip --verify-db
and verify through the emailed link. Registration is rate limited (5 per hour per IP).

Dates are relative to today: three months of personal history and four months of shared rent,
nothing dated after today.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from urllib.parse import urlparse

import httpx

DEMO_NAME = "Taylor Morgan"
DEMO_EMAIL = "demo@trackspense.app"
DEMO_PASSWORD = "DemoPass!2026"  # local throwaway databases only; pass --password anywhere else
CENT = Decimal("0.01")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


class Api:
    def __init__(self, base: str):
        self.c = httpx.Client(base_url=base.rstrip("/") + "/api/v1", timeout=60)

    def auth(self, token: str) -> None:
        self.c.headers["Authorization"] = f"Bearer {token}"

    def call(self, method: str, path: str, json=None, ok=(200, 201)):
        r = self.c.request(method, path, json=json)
        if r.status_code not in ok:
            raise SystemExit(f"{method} {path} -> {r.status_code}: {r.text[:400]}")
        return r.json() if r.content else None


def month_day(months_ago: int, day: int, today: date) -> Optional[date]:
    """`day` of the month `months_ago` before today's month, or None if that is after today."""
    y, m = today.year, today.month - months_ago
    while m <= 0:
        m += 12
        y -= 1
    d = date(y, m, min(day, 28))
    return d if d <= today else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--email", default=DEMO_EMAIL)
    ap.add_argument("--password", default=DEMO_PASSWORD)
    ap.add_argument("--verify-db", help="DATABASE_URL to mark the demo email verified (localhost only)")
    ap.add_argument("--allow-remote", action="store_true", help="allow a non-localhost --base-url")
    args = ap.parse_args()

    if urlparse(args.base_url).hostname not in LOCAL_HOSTS and not args.allow_remote:
        sys.exit(f"Refusing non-local --base-url {args.base_url} without --allow-remote.")
    if args.verify_db and urlparse(args.verify_db).hostname not in LOCAL_HOSTS:
        sys.exit("--verify-db only accepts a localhost database.")
    if args.allow_remote and args.password == DEMO_PASSWORD:
        sys.exit("Use your own --password for a non-local account; the default is committed.")

    today = date.today()
    me = args.email.strip().lower()
    api = Api(args.base_url)

    r = api.c.post("/auth/register", json={"name": DEMO_NAME, "email": me, "password": args.password})
    if r.status_code not in (200, 201, 400, 409):
        sys.exit(f"register -> {r.status_code}: {r.text[:300]}")
    if args.verify_db:
        import psycopg2

        with psycopg2.connect(args.verify_db) as conn, conn.cursor() as cur:
            cur.execute("UPDATE trackspense.users SET email_verified = true WHERE lower(email) = %s", (me,))
            if cur.rowcount != 1:
                sys.exit(f"--verify-db matched {cur.rowcount} users for {me}; is it the backend's database?")
    r = api.c.post("/auth/login", data={"username": me, "password": args.password})
    if r.status_code != 200:
        sys.exit(f"login -> {r.status_code}: {r.text[:300]}")
    api.auth(r.json()["access_token"])

    if api.call("GET", "/groups"):
        sys.exit("Demo account is already seeded; use a fresh database to re-seed.")

    # ---- Cards -----------------------------------------------------------------------------
    wanted = ("Chase Freedom Unlimited", "Chase Sapphire Preferred", "Apple Card")
    catalog = {c["card_name"]: c["id"] for c in api.call("GET", "/cards/catalog")}
    missing = [n for n in wanted if n not in catalog]
    if missing:
        sys.exit(f"Card catalog lacks {missing}; load scripts/manual_seed_card_catalog_2026_08_24.sql first.")
    for name in wanted:
        api.call("POST", "/cards/mine", {"card_id": catalog[name]})
    for uc in api.call("GET", "/cards/mine"):
        if str(uc.get("card_id")) == catalog["Chase Freedom Unlimited"]:
            api.call("POST", f"/cards/mine/{uc['id']}/set_default")
    freedom, sapphire, apple = (catalog[n] for n in wanted)

    # ---- Personal expenses -----------------------------------------------------------------
    def expense(d: Optional[date], cost, category, description, merchant=None, card=None):
        if d is None:
            return
        api.call("POST", "/expenses", {
            "user_id": me, "cost": str(cost), "category": category, "description": description,
            "date": d.strftime("%m/%d/%Y"), "merchant_name": merchant, "card_id": card,
        })

    def receipt(d: Optional[date], merchant, category, description, items, card=None):
        if d is None:
            return
        lines = [{"line_no": i + 1, "item_name": n, "quantity": q, "unit_price": str(p),
                  "line_total": str((p * q).quantize(CENT))}
                 for i, (n, q, p) in enumerate(items)]
        total = sum(Decimal(l["line_total"]) for l in lines)
        api.call("POST", "/expenses/with_items", {
            "user_email": me, "card_id": card,
            "header": {"purchased_at": d.isoformat(), "amount": str(total), "merchant_name": merchant,
                       "category_name": category, "description": description},
            "items": lines,
        })

    # Grocery runs: the same staples at different stores and slowly moving prices, so the
    # item-price screen has something to compare.
    D = Decimal
    staples = [  # (item, qty, Trader Joe's price for months 2,1,0 ago, Costco price)
        ("Organic Whole Milk 1 gal", 1, (D("5.49"), D("5.69"), D("5.79")), D("4.99")),
        ("Large Brown Eggs 12ct", 1, (D("3.99"), D("4.29"), D("4.49")), D("3.79")),
        ("Bananas", 6, (D("0.25"), D("0.25"), D("0.27")), D("0.22")),
        ("Sourdough Bread", 1, (D("4.49"), D("4.49"), D("4.79")), D("4.29")),
        ("Cold Brew Coffee", 1, (D("8.99"), D("8.99"), D("9.49")), D("7.99")),
        ("Baby Spinach", 1, (D("2.99"), D("3.19"), D("3.29")), D("2.79")),
    ]
    for back in (2, 1, 0):
        idx = 2 - back
        for day, store in ((3, "Trader Joe's"), (11, "Costco"), (19, "Trader Joe's"), (26, "Whole Foods")):
            d = month_day(back, day, today)
            if store == "Costco":
                items = [(n, q, c) for n, q, _, c in staples[:4]] + [("Paper Towels 12pk", 1, D("21.99"))]
                receipt(d, store, "Groceries", "Costco run", items, card=freedom)
            elif store == "Whole Foods":
                items = [(n, q, (t[idx] * D("1.12")).quantize(CENT)) for n, q, t, _ in staples[1:4]]
                receipt(d, store, "Groceries", "Whole Foods", items + [("Greek Yogurt", 2, D("1.89"))], card=apple)
            else:
                items = [(n, q, t[idx]) for n, q, t, _ in staples]
                receipt(d, store, "Groceries", "Weekly groceries", items, card=freedom)

    for back in (2, 1, 0):
        on = lambda day: month_day(back, day, today)  # noqa: E731
        expense(on(7), "64.99", "TV/Phone/Internet", "Internet", "Comcast Xfinity", card=freedom)
        expense(on(9), "15.49", "Movies", "Netflix", "Netflix", card=apple)
        expense(on(14), "48.20", "Gas/fuel", "Gas", "Shell", card=freedom)
        expense(on(5), "38.75", "Dining out", "Dinner with Sam", "Nopa", card=sapphire)
        expense(on(17), "24.10", "Dining out", "Lunch", "Souvla", card=sapphire)
        expense(on(12), "19.85", "Taxi", "Ride to the airport" if back == 1 else "Uber home", "Uber", card=sapphire)
        expense(on(18), "32.40", "Household supplies", "Cleaning supplies", "Walgreens", card=freedom)
        expense(on(23), "11.25", "Dining out", "Coffee", "Blue Bottle", card=apple)
    expense(month_day(1, 15, today), "89.00", "Clothing", "Running shoes", "REI", card=apple)
    expense(month_day(0, 8, today), "42.15", "Household supplies", "Kitchen restock", "Target", card=freedom)

    # ---- Budgets ---------------------------------------------------------------------------
    # Dining out is set tight on purpose so one budget shows the early warning.
    for category, amount in (("Groceries", "450"), ("Dining out", "80"), ("Household supplies", "120")):
        api.call("POST", "/budgets", {"target_type": "category", "category": category, "amount": amount,
                                      "alert_thresholds": [80, 100]})

    # ---- Groups ----------------------------------------------------------------------------
    def group(name, gtype, others):
        g = api.call("POST", "/groups", {"name": name, "group_type": gtype})
        gid = g.get("group_id") or g.get("id")
        for n in others:
            api.call("POST", f"/groups/{gid}/members", {"display_name": n})
        ids = {}
        for m in api.call("GET", f"/groups/{gid}")["members"]:
            ids["me" if (m.get("user_email") or "").lower() == me else m["display_name"]] = m["member_id"]
        return gid, ids

    def gexp(gid, d: Optional[date], desc, cat, amount, payer, members, merchant=None):
        if d is None:
            return
        api.call("POST", f"/groups/{gid}/expenses", {
            "date": d.strftime("%m/%d/%Y"), "description": desc, "category": cat, "amount": str(amount),
            "merchant_name": merchant, "payers": [{"member_id": payer, "amount_paid": str(amount)}],
            "split": {"type": "equal", "entries": [{"member_id": m} for m in members]},
        })

    home, h = group("Roommates", "home", ["Jordan", "Priya"])
    hm = list(h.values())
    i_pay = (("Rent", 1, "3600.00", "Parkside Apartments"), ("Electricity", 2, "126.40", "PG&E"),
             ("Water", 10, "72.00", "City Utilities"), ("Cleaning", 16, "150.00", "Sparkle Home"))
    priya_groceries = D("84.60")
    for back in (3, 2, 1, 0):
        for cat, day, amount, merchant in i_pay:
            d = month_day(back, day, today)
            desc = f"Rent - {d:%B}" if cat == "Rent" and d else {"Water": "Water & trash", "Cleaning": "Cleaning service"}.get(cat, cat)
            gexp(home, d, desc, cat, amount, h["me"], hm, merchant)
        gexp(home, month_day(back, 4, today), "Shared groceries", "Groceries", priya_groceries, h["Priya"], hm, "Safeway")
    couch = D("899.00")
    gexp(home, month_day(1, 20, today), "New couch", "Furniture", couch, h["me"], hm, "IKEA")
    # Roommates settle each past month at its end; only the current month stays open.
    my_bills = sum(D(a) for _, _, a, _ in i_pay)
    for back in (3, 2, 1):
        share = ((my_bills + priya_groceries) / 3).quantize(CENT)
        extra = (couch / 3).quantize(CENT) if back == 1 else D("0")
        owed = {"Jordan": share + extra, "Priya": share - priya_groceries + extra}
        for name, amount in owed.items():
            api.call("POST", f"/groups/{home}/settlements", {
                "from_member_id": h[name], "to_member_id": h["me"], "amount": str(amount), "method": "zelle",
                "settled_at": month_day(back, 27, today).isoformat()})

    trip, t = group("Tahoe Weekend", "trip", ["Alex", "Sam", "Riley"])
    tm = list(t.values())
    trip_day = month_day(1, 18, today)
    gexp(trip, trip_day, "Cabin rental", "Hotel", "1140.00", t["me"], tm, "Airbnb")
    gexp(trip, trip_day, "Ski lift tickets", "Sports", "596.00", t["Alex"], tm, "Palisades Tahoe")
    gexp(trip, trip_day + timedelta(days=1), "Groceries for the cabin", "Groceries", "168.32", t["me"], tm, "Safeway Truckee")
    gexp(trip, trip_day + timedelta(days=1), "Dinner at the lodge", "Dining out", "212.80", t["Sam"], tm, "Lone Eagle Grille")
    gexp(trip, trip_day + timedelta(days=2), "Gas for the drive", "Gas/fuel", "92.50", t["me"], tm, "Chevron")
    api.call("POST", f"/groups/{trip}/settlements", {"from_member_id": t["Riley"], "to_member_id": t["me"],
                                                     "amount": "250.00", "method": "venmo"})

    print(f"Seeded {me}")


if __name__ == "__main__":
    main()
