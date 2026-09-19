#!/usr/bin/env python3
"""
Marks QA-provisioned users as email-verified, directly in the database.

## Why this exists

`GroupService.require_verified_email` blocks creating/joining/accepting invites for any
group unless `User.email_verified` is true (discovered the hard way: every group test in
this framework 403'd with "Verify your email address before joining or creating groups"
until this script existed). A freshly `POST /auth/register`-ed user is unverified by
design — verification normally happens by clicking an emailed link, and QA deliberately
runs with no real SMTP (`MAIL_USERNAME` unset, matching `tests/conftest.py`'s own
`_mock_email_sending` fixture) and no dev-mode bypass exists in the API for this.

The backend's own pytest suite sidesteps the exact same problem with a SQLAlchemy event
listener that defaults `email_verified=True` on insert (`tests/conftest.py`) — this script
is the equivalent for the QA framework's real-HTTP-registered users, applied directly
after `global.setup.ts` registers them (see that file).

Usage: `python3 verify_qa_users.py user1@example.com user2@example.com ...`
Requires DATABASE_URL (or QA_DATABASE_URL) in the environment.
"""
import os
import sys


def main() -> None:
    emails = sys.argv[1:]
    if not emails:
        print("usage: verify_qa_users.py <email> [email...]", file=sys.stderr)
        sys.exit(1)

    database_url = os.environ.get("QA_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not database_url:
        print("QA_DATABASE_URL or DATABASE_URL must be set", file=sys.stderr)
        sys.exit(1)

    from sqlalchemy import create_engine, text

    engine = create_engine(database_url)
    with engine.begin() as conn:
        result = conn.execute(
            text("UPDATE trackspense.users SET email_verified = true WHERE email = ANY(:emails)"),
            {"emails": emails},
        )
        print(f"Marked {result.rowcount} user(s) as email-verified: {', '.join(emails)}")


if __name__ == "__main__":
    main()
