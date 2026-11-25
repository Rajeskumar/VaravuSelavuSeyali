#!/usr/bin/env python3
"""Persisted-data check for lost-save-response: one committed expense (12.50), one request through the proxy (no resubmission)."""
import os
import subprocess
import sys
import time

here = os.path.dirname(os.path.abspath(__file__))
seed = os.path.join(here, "..", "..", "scripts", "seed.py")
state = os.environ["E2E_STATE"]
# An app that auto-replays a financial write after a failure would do it within seconds: give it the chance to.
time.sleep(10)
rc = subprocess.run([sys.executable, seed, "expect-count", "--state", state, "--email", os.environ["USER_EMAIL"],
                     "--contains", os.environ["RUN_LABEL"], "--equals", "1", "--cost", "12.50"]).returncode
rc |= subprocess.run([sys.executable, seed, "expect-proxy", "--state", state, "--method", "POST", "--path", "/api/v1/expenses",
                      "--equals", "1", "--faults", "1"]).returncode
sys.exit(rc)
