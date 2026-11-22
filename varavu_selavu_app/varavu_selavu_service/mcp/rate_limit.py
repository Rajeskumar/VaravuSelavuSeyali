"""Atomic weighted buckets; callers choose their transaction boundary."""

import time
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from varavu_selavu_service.db.mcp_models import MCPRateCounter
from varavu_selavu_service.mcp.security import MCPError, digest


def reserve(db, subject, bucket, seconds, limit, weight=1, user_email=None):
    if weight == 0:
        return
    if weight > limit or weight < 0:
        raise MCPError(
            "daily_limit_reached", retry_after_seconds=seconds, bucket=bucket
        )
    window = int(time.time()) // seconds * seconds
    insert = pg_insert if db.bind.dialect.name == "postgresql" else sqlite_insert
    stmt = insert(MCPRateCounter).values(
        subject=subject,
        bucket=bucket,
        window_start=window,
        count=weight,
        user_email=user_email,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["subject", "bucket", "window_start"],
        set_={"count": MCPRateCounter.count + weight},
        where=MCPRateCounter.count + weight <= limit,
    ).returning(MCPRateCounter.count)
    if db.execute(stmt).scalar_one_or_none() is None:
        raise MCPError(
            "daily_limit_reached" if seconds == 86400 else "rate_limited",
            retry_after_seconds=window + seconds - int(time.time()),
            bucket=bucket,
            limit=limit,
        )


def user_subject(email):
    return "user:" + digest(email)


def requests(db, principal):
    reserve(
        db,
        "connection:" + principal.connection_id,
        "requests_minute",
        60,
        60,
        user_email=principal.user_email,
    )
    reserve(
        db,
        "connection:" + principal.connection_id,
        "requests_day",
        86400,
        1000,
        user_email=principal.user_email,
    )
    reserve(
        db,
        user_subject(principal.user_email),
        "requests_day",
        86400,
        2000,
        user_email=principal.user_email,
    )


def disclose(db, principal, count):
    reserve(
        db,
        "connection:" + principal.connection_id,
        "disclosure",
        86400,
        2000,
        count,
        principal.user_email,
    )
    reserve(
        db,
        user_subject(principal.user_email),
        "disclosure",
        86400,
        2000,
        count,
        principal.user_email,
    )
