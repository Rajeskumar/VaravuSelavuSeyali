#!/usr/bin/env python3
"""A group with a name-only guest."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
import flow_checks as f  # noqa: E402
import seed  # noqa: E402

g = seed.create_group(f.state, f.EMAIL, f.LABEL + "_trip", "QA Guest")
print(json.dumps({"GROUP_NAME": g["name"], "GROUP_ID": g["group_id"], "ME_ID": g["me"], "GUEST_ID": g["guest"]}))
