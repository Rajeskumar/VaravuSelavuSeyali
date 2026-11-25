#!/usr/bin/env python3
"""Fixture for insights-scope-select: a group with one group expense (so the Analyse scope picker appears AND stays after the
group is chosen: Insights hides the picker for a scope with no expenses) and one personal expense."""
import json
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
seed = os.path.join(here, "..", "..", "scripts", "seed.py")
state, email, label = os.environ["E2E_STATE"], os.environ["USER_EMAIL"], os.environ["RUN_LABEL"]


def run(*args):
    out = subprocess.run([sys.executable, seed, *args, "--state", state, "--email", email], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(out.stderr or out.stdout)
    return out.stdout


group = json.loads(run("group", "--name", f"{label}_scope"))
run("expense", "--description", f"{label} coffee", "--cost", "4.50")
run("group-expense", "--group-id", group["group_id"], "--me", group["me"], "--guest-id", group["guest"],
    "--description", f"{label} dinner", "--cost", "30")
print(json.dumps({"GROUP_NAME": group["name"]}))
