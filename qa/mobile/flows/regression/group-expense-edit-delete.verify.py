#!/usr/bin/env python3
"""The edited expense is re-split exactly; the deleted one is gone; balances follow."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
import flow_checks as f  # noqa: E402
import seed  # noqa: E402

gid, me, guest = os.environ["GROUP_ID"], os.environ["ME_ID"], os.environ["GUEST_ID"]
f.check_group_expense(gid, f.LABEL + " dinner", "41", {me: "41"}, {me: "20.50", guest: "20.50"})
f.check(f.group_expenses(gid, f.LABEL + " taxi") == [], "deleted group expense still listed")
f.check(f.transfers(gid) == [(guest, me, f.money("20.50"))], f"transfers: {f.transfers(gid)}")
