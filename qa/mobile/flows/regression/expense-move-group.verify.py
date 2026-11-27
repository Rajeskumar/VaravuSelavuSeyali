#!/usr/bin/env python3
"""Moved once: split equally in the group and no longer a personal expense."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
import flow_checks as f  # noqa: E402
import seed  # noqa: E402

gid, me, guest = os.environ["GROUP_ID"], os.environ["ME_ID"], os.environ["GUEST_ID"]
f.check_group_expense(gid, f.LABEL + " hotel", "18", {me: "18"}, {me: "9", guest: "9"})
f.check(f.personal(f.LABEL + " hotel") == [], "the moved expense is still a personal expense")
f.check(f.transfers(gid) == [(guest, me, f.money("9"))], f"transfers: {f.transfers(gid)}")
