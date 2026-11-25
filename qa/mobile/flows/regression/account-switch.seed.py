#!/usr/bin/env python3
"""Fixture for account-switch: user A (the runner's USER_*) gets one saved expense; a second verified user B is provisioned."""
import json
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
seed = os.path.join(here, "..", "..", "scripts", "seed.py")
state, email, label = os.environ["E2E_STATE"], os.environ["USER_EMAIL"], os.environ["RUN_LABEL"]


def run(*args):
    out = subprocess.run([sys.executable, seed, *args, "--state", state], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(out.stderr or out.stdout)
    return out.stdout


run("expense", "--email", email, "--description", f"{label} private-A", "--cost", "7.25")
b = json.loads(run("provision", "--name", "userb"))
print(json.dumps({"B_EMAIL": b["email"], "B_PASSWORD": b["password"]}))
