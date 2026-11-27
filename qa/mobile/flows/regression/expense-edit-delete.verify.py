#!/usr/bin/env python3
"""The edit is stored once at the new amount; the deleted expense is gone."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
import flow_checks as f  # noqa: E402
import seed  # noqa: E402

kept = f.personal(f.LABEL + " keep")
f.check([f.money(e["cost"]) for e in kept] == [f.money("14.75")], f"edited expense: {kept}")
f.check(f.personal(f.LABEL + " drop") == [], "deleted expense still stored")
