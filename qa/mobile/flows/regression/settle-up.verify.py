#!/usr/bin/env python3
"""A partial payment to me and a full payment by me are each recorded exactly once."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
import flow_checks as f  # noqa: E402
import seed  # noqa: E402

e = os.environ
f.check(f.settlements(e["OWED_ID"]) == [(e["OWED_GUEST"], e["OWED_ME"], f.money("5"))], f"partial: {f.settlements(e['OWED_ID'])}")
f.check(f.transfers(e["OWED_ID"]) == [(e["OWED_GUEST"], e["OWED_ME"], f.money("10"))], f"left: {f.transfers(e['OWED_ID'])}")
f.check(f.settlements(e["OWE_ID"]) == [(e["OWE_ME"], e["OWE_GUEST"], f.money("11"))], f"full: {f.settlements(e['OWE_ID'])}")
f.check(f.transfers(e["OWE_ID"]) == [], f"still owing: {f.transfers(e['OWE_ID'])}")
