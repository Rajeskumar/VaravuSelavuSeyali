#!/usr/bin/env python3
"""Fixture for deep-link-join: an owner (second user) with a group and a name-only seat, plus an invite token for that seat.
The runner's user (USER_*) is the invitee."""
import json
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
seed = os.path.join(here, "..", "..", "scripts", "seed.py")
state, label = os.environ["E2E_STATE"], os.environ["RUN_LABEL"]


def run(*args):
    out = subprocess.run([sys.executable, seed, *args, "--state", state], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(out.stderr or out.stdout)
    return json.loads(out.stdout)


owner = run("provision", "--name", "owner")
group = run("group", "--email", owner["email"], "--name", f"{label}_joinme")
invite = run("invite", "--email", owner["email"], "--group-id", group["group_id"], "--member-id", group["guest"])
print(json.dumps({"INVITE_TOKEN": invite["token"], "GROUP_NAME": group["name"], "GROUP_ID": group["group_id"],
                  "OWNER_EMAIL": owner["email"]}))
