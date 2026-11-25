#!/usr/bin/env python3
"""Persisted-data check for account-switch: A still has exactly its one expense, B has none and nothing was saved from A's draft."""
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
seed = os.path.join(here, "..", "..", "scripts", "seed.py")
state, label = os.environ["E2E_STATE"], os.environ["RUN_LABEL"]


def expect(email, contains, equals):
    return subprocess.run([sys.executable, seed, "expect-count", "--state", state, "--email", email, "--contains", contains,
                           "--equals", str(equals)]).returncode


rc = expect(os.environ["USER_EMAIL"], f"{label} private-A", 1)           # A's saved expense is intact
rc |= expect(os.environ["USER_EMAIL"], f"{label} draftA", 0)             # A's draft was never submitted
rc |= expect(os.environ["B_EMAIL"], label, 0)                            # B never received anything of A's
sys.exit(rc)
