#!/usr/bin/env python3
"""Two groups: in one the guest owes me, in the other I owe the guest."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
import flow_checks as f  # noqa: E402
import seed  # noqa: E402

owed = seed.create_group(f.state, f.EMAIL, f.LABEL + "_lent", "QA Guest")
f.group_expense(owed["group_id"], owed["me"], [owed["me"], owed["guest"]], f.LABEL + " theirs", "30.00")
owe = seed.create_group(f.state, f.EMAIL, f.LABEL + "_borrow", "QA Friend")
f.group_expense(owe["group_id"], owe["guest"], [owe["me"], owe["guest"]], f.LABEL + " mine", "22.00")
print(json.dumps({"OWED_GROUP": owed["name"], "OWED_ID": owed["group_id"], "OWED_ME": owed["me"], "OWED_GUEST": owed["guest"],
                  "OWE_GROUP": owe["name"], "OWE_ID": owe["group_id"], "OWE_ME": owe["me"], "OWE_GUEST": owe["guest"]}))
