#!/usr/bin/env python3
"""
Creates the QA framework's disposable "session" account directly in the database.

## Why this exists

The tests that log out (smoke.spec.ts, session.spec.ts) need an account no other test
shares: `POST /auth/logout` ends every access token issued to that account so far
(`users.token_valid_after`), so logging out the shared `primary`/`secondary` personas broke
every later test reusing their storageState. See QA_SESSION_USER in
e2e/fixtures/users.fixture.ts.

It can't be registered over HTTP like the other two: `POST /auth/register` is limited to
5/hour per IP and the QA run already spends exactly 5 (qa/README.md, "Real rate limits").
Like verify_qa_users.py, this reaches into the QA database instead, and creates the row
already email-verified.

Usage: `QA_SESSION_PASSWORD=... python3 provision_qa_session_user.py <email> <name>`
(the password comes from the environment so it never appears in a process listing).
Requires QA_DATABASE_URL (or DATABASE_URL). Idempotent: an existing row is left alone.
Run from varavu_selavu_app/ via `poetry run`, which provides bcrypt and SQLAlchemy.
"""
import os
import sys
import uuid


def main() -> None:
    if len(sys.argv) != 3:
        print("usage: QA_SESSION_PASSWORD=... provision_qa_session_user.py <email> <name>", file=sys.stderr)
        sys.exit(1)
    email, name = sys.argv[1], sys.argv[2]

    password = os.environ.get("QA_SESSION_PASSWORD")
    if not password:
        print("QA_SESSION_PASSWORD must be set", file=sys.stderr)
        sys.exit(1)
    database_url = os.environ.get("QA_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not database_url:
        print("QA_DATABASE_URL or DATABASE_URL must be set", file=sys.stderr)
        sys.exit(1)

    import bcrypt
    from sqlalchemy import create_engine, text

    # Same hashing as the backend's auth.security.hash_password, without importing the app
    # (which would read its own Settings/.env).
    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    engine = create_engine(database_url)
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "INSERT INTO trackspense.users (id, email, name, password_hash, email_verified) "
                "VALUES (:id, :email, :name, :password_hash, true) "
                "ON CONFLICT (email) DO NOTHING"
            ),
            {"id": str(uuid.uuid4()), "email": email, "name": name, "password_hash": password_hash},
        )
        state = "created" if result.rowcount else "already present"
        print(f"QA session user {state}")


if __name__ == "__main__":
    main()
