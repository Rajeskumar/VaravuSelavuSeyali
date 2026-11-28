#!/usr/bin/env python3
"""Issues a password-reset token for a QA account straight into the local QA database.

QA runs without SMTP, so the emailed link cannot be read. This stores only the SHA-256 hash, exactly as
AuthService.create_email_token does, and prints the raw token for the browser test to open. It refuses any
database other than `trackspense_qa` on this machine and any address outside the QA domain.

Usage: python3 issue_qa_reset_token.py <email>   (from varavu_selavu_app/ via `poetry run`)
"""
import hashlib
import os
import re
import secrets
import sys
import uuid
from datetime import datetime, timedelta, timezone


# The whole URL must have exactly this shape. Parsers disagree about unusual URLs (the driver's is not
# urllib's), so nothing outside it is allowed: one "@" at most, no host list, and no query string, through
# which libpq lets ?host=, ?hostaddr= and ?service= override the host.
_LOCAL_QA_URL = re.compile(
    r"postgresql(?:\+[a-z0-9]+)?://"
    r"(?:[A-Za-z0-9._-]+(?::[A-Za-z0-9._!~*+=%-]*)?@)?"
    r"(?:localhost|127\.0\.0\.1)(?::[0-9]+)?"
    r"/trackspense_qa"
)


def is_local_qa_database(url: str) -> bool:
    """Only `trackspense_qa` on this machine. The fixed name also refuses a local proxy to another database."""
    return _LOCAL_QA_URL.fullmatch(url) is not None


def main() -> None:
    if len(sys.argv) != 2 or not sys.argv[1].endswith("@trackspense.qa"):
        sys.exit("usage: issue_qa_reset_token.py <name@trackspense.qa>")
    url = os.environ.get("QA_DATABASE_URL") or os.environ.get("DATABASE_URL") or ""
    if not is_local_qa_database(url):
        sys.exit("refusing: QA_DATABASE_URL must be the trackspense_qa database on this machine, with no query string")
    for name in ("PGHOSTADDR", "PGSERVICE"):  # libpq reads these and would connect elsewhere
        os.environ.pop(name, None)

    from sqlalchemy import create_engine, text

    token = secrets.token_urlsafe(32)
    with create_engine(url).begin() as conn:
        conn.execute(
            text("INSERT INTO trackspense.email_tokens (id, user_email, token_hash, purpose, expires_at) "
                 "VALUES (:id, :email, :hash, 'reset_password', :expires)"),
            {"id": str(uuid.uuid4()), "email": sys.argv[1], "hash": hashlib.sha256(token.encode()).hexdigest(),
             "expires": datetime.now(timezone.utc) + timedelta(minutes=15)},
        )
    print(token)


if __name__ == "__main__":
    main()
