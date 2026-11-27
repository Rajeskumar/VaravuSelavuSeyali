"""Bounded personal-only queries; money never passes through float DTOs."""

import base64
import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import hmac
import json
import uuid
from sqlalchemy import func, select, or_, and_, exists
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.models import Expense, ExpenseItem
from varavu_selavu_service.db.mcp_models import MCPConnection
from varavu_selavu_service.services.category_catalog import (
    stored_category,
    filter_names,
)
from varavu_selavu_service.mcp.security import MCPError
from varavu_selavu_service.mcp.rate_limit import disclose


def money(v):
    return f"{v or Decimal(0):.2f}"


def personal(user):
    return [Expense.user_email == user, Expense.group_id.is_(None)]


def summary(db, expense, counts=None, connections=None):
    conn = (
        (
            connections.get(expense.created_by_connection_id)
            if connections is not None
            else db.get(MCPConnection, expense.created_by_connection_id)
        )
        if expense.created_by_connection_id
        else None
    )
    count = (
        counts.get(expense.id, 0)
        if counts is not None
        else db.query(func.count(ExpenseItem.id))
        .filter(ExpenseItem.expense_id == expense.id)
        .scalar()
    )
    return {
        "id": str(expense.id),
        "date": (
            expense.purchased_at.date().isoformat() if expense.purchased_at else None
        ),
        "amount": money(expense.amount),
        "currency": expense.currency,
        **stored_category(expense.category_id),
        "merchant": (expense.merchant_name or "")[:100],
        "description": (expense.description or "")[:200],
        "item_count": count,
        "source": "mcp" if conn else "other",
        "created_by": conn.client_name if conn else "you",
        "text_truncated": len(expense.merchant_name or "") > 100
        or len(expense.description or "") > 200,
    }


def signed_cursor(principal, filter_value, data):
    body = json.dumps(
        {"connection": principal.connection_id, "filters": filter_value, "key": data},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    sig = hmac.new(
        Settings().MCP_TOKEN_SIGNING_KEY.encode(), b"cursor:" + body, hashlib.sha256
    ).digest()
    return base64.urlsafe_b64encode(sig + body).decode()


def decode_cursor(principal, filter_value, cursor):
    try:
        raw = base64.urlsafe_b64decode(cursor)
        sig, body = raw[:32], raw[32:]
        expected = hmac.new(
            Settings().MCP_TOKEN_SIGNING_KEY.encode(), b"cursor:" + body, hashlib.sha256
        ).digest()
        if not hmac.compare_digest(sig, expected):
            raise ValueError()
        data = json.loads(body)
        if (
            data["connection"] != principal.connection_id
            or data["filters"] != filter_value
        ):
            raise ValueError()
        return data["key"]
    except (ValueError, KeyError, TypeError):
        raise MCPError("not_found") from None


def period(data):
    if data.year:
        month = data.month
        return (
            date(data.year, month or 1, 1),
            date(
                data.year, month or 12, calendar.monthrange(data.year, month or 12)[1]
            ),
        )
    return date.fromisoformat(data.start_date), date.fromisoformat(data.end_date)


def date_filters(user, start, end, currency=None):
    filters = personal(user) + [
        Expense.purchased_at
        >= datetime.combine(start, datetime.min.time(), timezone.utc),
        Expense.purchased_at
        < datetime.combine(end + timedelta(days=1), datetime.min.time(), timezone.utc),
    ]
    if currency:
        filters.append(Expense.currency == currency)
    return filters


def category_filter(value):
    try:
        return Expense.category_id.in_(filter_names(value))
    except ValueError as e:
        raise MCPError(str(e)) from None


def list_expenses(db, principal, data):
    filters = date_filters(
        principal.user_email,
        date.fromisoformat(data.start_date),
        date.fromisoformat(data.end_date),
        data.currency,
    )
    if data.category_id:
        filters.append(category_filter(data.category_id))
    if data.merchant:
        filters.append(Expense.merchant_name.icontains(data.merchant, autoescape=True))
    if data.text:
        filters.append(
            or_(
                Expense.description.icontains(data.text, autoescape=True),
                Expense.merchant_name.icontains(data.text, autoescape=True),
                exists(
                    select(ExpenseItem.id).where(
                        ExpenseItem.expense_id == Expense.id,
                        ExpenseItem.item_name.icontains(data.text, autoescape=True),
                    )
                ),
            )
        )
    if data.min_amount is not None:
        filters.append(Expense.amount >= data.min_amount)
    if data.max_amount is not None:
        filters.append(Expense.amount <= data.max_amount)
    totals = (
        db.query(Expense.currency, func.sum(Expense.amount), func.count())
        .filter(*filters)
        .group_by(Expense.currency)
        .limit(33)
        .all()
    )
    if len(totals) > 32:
        raise MCPError("validation_error", field="currency")
    filter_value = data.model_dump(mode="json", exclude={"cursor", "limit"})
    column = Expense.amount if data.sort.startswith("amount") else Expense.purchased_at
    descending = data.sort.endswith("desc")
    page_filters = list(filters)
    if data.cursor:
        value, last_id = decode_cursor(principal, filter_value, data.cursor)
        try:
            value = (
                Decimal(value)
                if data.sort.startswith("amount")
                else datetime.fromisoformat(value)
            )
            last_id = uuid.UUID(last_id)
        except (ValueError, TypeError):
            raise MCPError("not_found") from None
        cmp = (column < value) if descending else (column > value)
        tie = (Expense.id < last_id) if descending else (Expense.id > last_id)
        page_filters.append(or_(cmp, and_(column == value, tie)))
    ordering = (
        [column.desc(), Expense.id.desc()]
        if descending
        else [column.asc(), Expense.id.asc()]
    )
    rows = (
        db.query(Expense)
        .filter(*page_filters)
        .order_by(*ordering)
        .limit(data.limit + 1)
        .all()
    )
    counts = dict(
        db.query(ExpenseItem.expense_id, func.count())
        .filter(ExpenseItem.expense_id.in_([r.id for r in rows]))
        .group_by(ExpenseItem.expense_id)
        .all()
    )
    connections = {
        c.id: c
        for c in db.query(MCPConnection)
        .filter(
            MCPConnection.id.in_(
                [r.created_by_connection_id for r in rows if r.created_by_connection_id]
            )
        )
        .all()
    }
    items, used = [], []
    for row in rows[: data.limit]:
        item = summary(db, row, counts, connections)
        if items and len(json.dumps(items + [item]).encode()) > 11000:
            break  # reserve room for text rendering, aggregate metadata and cursor
        items.append(item)
        used.append(row)
    disclose(db, principal, len(items))
    cursor = None
    if used and len(rows) > len(used):
        last = used[-1]
        value = (
            str(last.amount)
            if data.sort.startswith("amount")
            else last.purchased_at.isoformat()
        )
        cursor = signed_cursor(principal, filter_value, [value, str(last.id)])
    return {
        "items": items,
        "next_cursor": cursor,
        "total_count": sum(t[2] for t in totals),
        "totals_by_currency": [
            {"currency": t[0], "amount": money(t[1])} for t in totals
        ],
    }


def owned(db, email, expense_id):
    try:
        expense_id = uuid.UUID(expense_id)
    except (ValueError, TypeError):
        raise MCPError("not_found") from None
    row = db.query(Expense).filter(*personal(email), Expense.id == expense_id).first()
    if row is None:
        raise MCPError("not_found")
    return row


def get_expense(db, principal, data):
    row = owned(db, principal.user_email, data.expense_id)
    result = summary(db, row)
    result.update({k: money(getattr(row, k)) for k in ("tax", "tip", "discount")})
    result["notes"] = (row.notes or "")[:500]
    result["notes_truncated"] = len(row.notes or "") > 500
    result["items"], result["next_items_cursor"] = [], None
    if row.split_type == "itemized":
        key = {"expense_id": str(row.id)}
        offset = (
            decode_cursor(principal, key, data.items_cursor) if data.items_cursor else 0
        )
        if not isinstance(offset, int) or offset < 0:
            raise MCPError("not_found")
        items = (
            db.query(ExpenseItem)
            .filter(ExpenseItem.expense_id == row.id)
            .order_by(ExpenseItem.line_no, ExpenseItem.id)
            .offset(offset)
            .limit(201)
            .all()
        )
        for item in items[:200]:
            value = {
                "name": item.item_name[:200],
                "text_truncated": len(item.item_name) > 200,
                "quantity": str(item.quantity),
                "unit_price": (
                    money(item.unit_price) if item.unit_price is not None else None
                ),
                "line_total": money(item.line_total),
                "discount": money(item.discount),
                # TS-FIX-102: set = line_total is the paid price and discount a record; null = an older
                # receipt whose line_total is before discount (the header discount was subtracted).
                "original_price": money(item.original_price) if item.original_price is not None else None,
                **stored_category(item.category_id),
            }
            if (
                result["items"]
                and len(json.dumps(result["items"] + [value]).encode()) > 60000
            ):
                break
            result["items"].append(value)
        if len(items) > len(result["items"]):
            result["next_items_cursor"] = signed_cursor(
                principal, key, offset + len(result["items"])
            )
    disclose(db, principal, 1 + len(result["items"]))
    return result


def aggregates(db, email, start, end, currency=None, category=None):
    filters = date_filters(email, start, end, currency)
    if category:
        filters.append(category_filter(category))
    rows = (
        db.query(
            Expense.currency,
            Expense.category_id,
            func.sum(Expense.amount),
            func.count(),
        )
        .filter(*filters)
        .group_by(Expense.currency, Expense.category_id)
        .limit(501)
        .all()
    )
    if len(rows) > 500:
        raise MCPError(
            "validation_error", field="currency", hint="Narrow the period or currency"
        )
    totals = {}
    for cur, name, amount, count in rows:
        bucket = totals.setdefault(
            cur,
            {
                "currency": cur,
                "total": Decimal(0),
                "expense_count": 0,
                "categories": [],
            },
        )
        bucket["total"] += amount
        bucket["expense_count"] += count
        bucket["categories"].append(
            {**stored_category(name), "total": money(amount), "count": count}
        )
    if len(totals) > 32:
        raise MCPError("validation_error", field="currency")
    for cur, bucket in totals.items():
        for item in bucket["categories"]:
            item["share_pct"] = (
                str(
                    (Decimal(item["total"]) * 100 / bucket["total"]).quantize(
                        Decimal(".01")
                    )
                )
                if bucket["total"]
                else "0.00"
            )
        bucket["total"] = money(bucket["total"])
    return totals


def spending_summary(db, principal, data, breakdown=False):
    start, end = period(data)
    previous = None
    if breakdown and data.compare_to_previous:
        from varavu_selavu_service.services.insight_analytics_service import (
            InsightAnalyticsService,
        )

        try:
            ranges = InsightAnalyticsService(db)._resolve_comparison_periods(
                data.start_date, data.end_date, data.year, data.month
            )
        except (ValueError, OverflowError):
            raise MCPError(
                "validation_error",
                field="period",
                hint="Previous period is outside the supported calendar",
            ) from None
        start, end, ps, pe = map(date.fromisoformat, ranges)
        previous = (ps, pe)
    buckets = aggregates(
        db,
        principal.user_email,
        start,
        end,
        data.currency,
        getattr(data, "category_id", None),
    )
    result = {
        "scope": "personal",
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "currencies": list(buckets.values()),
    }
    if previous:
        prior = aggregates(
            db, principal.user_email, *previous, data.currency, data.category_id
        )
        result["comparison_period"] = {
            "start": previous[0].isoformat(),
            "end": previous[1].isoformat(),
        }
        for cur in set(buckets) | set(prior):
            if cur not in buckets:
                buckets[cur] = {
                    "currency": cur,
                    "total": "0.00",
                    "expense_count": 0,
                    "categories": [],
                }
            now_by_name = {i["category_name"]: i for i in buckets[cur]["categories"]}
            before = {
                i["category_name"]: i for i in prior.get(cur, {}).get("categories", [])
            }
            for name in set(now_by_name) | set(before):
                item = now_by_name.setdefault(
                    name,
                    {
                        **stored_category(name),
                        "total": "0.00",
                        "count": 0,
                        "share_pct": "0.00",
                    },
                )
                prev = Decimal(before.get(name, {}).get("total", "0"))
                delta = Decimal(item["total"]) - prev
                item.update(
                    previous_total=money(prev),
                    change_amount=money(delta),
                    change_pct=(
                        str((delta * 100 / prev).quantize(Decimal(".01")))
                        if prev
                        else None
                    ),
                )
            buckets[cur]["categories"] = list(now_by_name.values())
        result["currencies"] = list(buckets.values())
    if not breakdown:
        filters = date_filters(principal.user_email, start, end, data.currency)
        for cur, bucket in buckets.items():
            merchants = (
                db.query(Expense.merchant_name, func.sum(Expense.amount), func.count())
                .filter(
                    *filters, Expense.currency == cur, Expense.merchant_name.isnot(None)
                )
                .group_by(Expense.merchant_name)
                .order_by(func.sum(Expense.amount).desc())
                .limit(10)
                .all()
            )
            bucket["top_merchants"] = [
                {"merchant": name[:100], "total": money(total), "count": count}
                for name, total, count in merchants
            ]
            month = (
                func.to_char(Expense.purchased_at, "YYYY-MM")
                if db.bind.dialect.name == "postgresql"
                else func.strftime("%Y-%m", Expense.purchased_at)
            )
            bucket["monthly_trend"] = [
                {"month": m, "total": money(total)}
                for m, total in db.query(month, func.sum(Expense.amount))
                .filter(*filters, Expense.currency == cur)
                .group_by(month)
                .order_by(month)
                .all()
            ]
    return result
