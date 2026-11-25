#!/usr/bin/env python3
"""Persisted-data check for draft-recovery: the draft was never submitted on its own."""
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
seed = os.path.join(here, "..", "..", "scripts", "seed.py")
sys.exit(subprocess.run([
    sys.executable, seed, "expect-count", "--state", os.environ["E2E_STATE"], "--email", os.environ["USER_EMAIL"],
    "--contains", os.environ["RUN_LABEL"], "--equals", "0",
]).returncode)
