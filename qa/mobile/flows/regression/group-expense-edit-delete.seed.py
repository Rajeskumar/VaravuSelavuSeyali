#!/usr/bin/env python3
"""A group with two equal expenses I paid."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
import flow_checks as f  # noqa: E402
import seed  # noqa: E402

g = seed.create_group(f.state, f.EMAIL, f.LABEL + "_trip", "QA Guest")
for name, cost in ((" dinner", "30.00"), (" taxi", "8.00")):
    f.group_expense(g["group_id"], g["me"], [g["me"], g["guest"]], f.LABEL + name, cost)
print(json.dumps({"GROUP_NAME": g["name"], "GROUP_ID": g["group_id"], "ME_ID": g["me"], "GUEST_ID": g["guest"]}))
