#!/usr/bin/env python3
"""Persisted-data check for group-expense: one expense, stored 50/50 split, guest owes the viewer 15.00."""
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
seed = os.path.join(here, "..", "..", "scripts", "seed.py")
sys.exit(subprocess.run([
    sys.executable, seed, "expect-group-expense", "--state", os.environ["E2E_STATE"], "--email", os.environ["USER_EMAIL"],
    "--group-id", os.environ["GROUP_ID"], "--me", os.environ["ME_ID"], "--guest-id", os.environ["GUEST_ID"], "--contains", os.environ["RUN_LABEL"], "--cost", "30", "--my-share", "15",
    "--guest-owes", "15",
]).returncode)
