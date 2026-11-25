#!/usr/bin/env python3
"""Persisted-data check for deep-link-signed-out: opening an invite while signed out must not join anyone silently."""
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
seed = os.path.join(here, "..", "..", "scripts", "seed.py")
sys.exit(subprocess.run([sys.executable, seed, "expect-member", "--state", os.environ["E2E_STATE"], "--email", os.environ["OWNER_EMAIL"],
                         "--group-id", os.environ["GROUP_ID"], "--member-email", os.environ["USER_EMAIL"], "--absent"]).returncode)
