"""Keeps the QA account scripts on a local test database: they create and verify accounts whose passwords are public."""
import os
import re
import sys

# The whole URL must have exactly this shape (see issue_qa_reset_token.py: URL parsers disagree about unusual ones, and
# a query string can override the host). `trackspense_e2e_*` is the disposable database of the native mobile suite.
_LOCAL_TEST_URL = re.compile(
    r"postgresql(?:\+[a-z0-9]+)?://"
    r"(?:[A-Za-z0-9._-]+(?::[A-Za-z0-9._!~*+=%-]*)?@)?"
    r"(?:localhost|127\.0\.0\.1)(?::[0-9]+)?"
    r"/(?:trackspense_qa|trackspense_e2e_[a-z0-9_]+)"
)


def is_local_test_database(url: str) -> bool:
    return _LOCAL_TEST_URL.fullmatch(url) is not None


def require_local_test_database() -> str:
    """QA_DATABASE_URL (or DATABASE_URL), or exit before anything connects."""
    url = os.environ.get("QA_DATABASE_URL") or os.environ.get("DATABASE_URL") or ""
    if not is_local_test_database(url):
        sys.exit("refusing: QA_DATABASE_URL must be a trackspense_qa or trackspense_e2e_* database on this machine, "
                 "with no query string")
    for name in ("PGHOSTADDR", "PGSERVICE"):  # libpq reads these and would connect elsewhere
        os.environ.pop(name, None)
    return url
