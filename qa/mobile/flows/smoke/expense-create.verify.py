#!/usr/bin/env python3
"""Persisted-data check for expense-create: exactly one expense with the run label, costing exactly 12.50."""
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
seed = os.path.join(here, "..", "..", "scripts", "seed.py")
sys.exit(subprocess.run([
    sys.executable, seed, "expect-count", "--state", os.environ["E2E_STATE"], "--email", os.environ["USER_EMAIL"],
    "--contains", os.environ["RUN_LABEL"], "--equals", "1", "--cost", "12.50",
]).returncode)
