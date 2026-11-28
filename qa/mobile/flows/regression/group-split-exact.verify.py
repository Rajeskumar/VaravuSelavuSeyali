#!/usr/bin/env python3
"""The typed exact split is stored to the cent."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
import flow_checks as f  # noqa: E402
import seed  # noqa: E402

gid, me, guest = os.environ["GROUP_ID"], os.environ["ME_ID"], os.environ["GUEST_ID"]
f.check_group_expense(gid, f.LABEL + " dinner", "30", {me: "30"}, {me: "18", guest: "12"})
