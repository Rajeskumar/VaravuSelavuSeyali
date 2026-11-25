#!/usr/bin/env python3
"""Fixture for group-expense: a group with a name-only guest. Prints the extra variables as one JSON object."""
import json
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
seed = os.path.join(here, "..", "..", "scripts", "seed.py")
name = os.environ["RUN_LABEL"] + "_trip"
out = subprocess.run([sys.executable, seed, "group", "--state", os.environ["E2E_STATE"], "--email", os.environ["USER_EMAIL"],
                      "--name", name], capture_output=True, text=True)
if out.returncode != 0:
    sys.exit(out.stderr or out.stdout)
g = json.loads(out.stdout)
print(json.dumps({"GROUP_NAME": g["name"], "GROUP_ID": g["group_id"], "ME_ID": g["me"], "GUEST_ID": g["guest"]}))
