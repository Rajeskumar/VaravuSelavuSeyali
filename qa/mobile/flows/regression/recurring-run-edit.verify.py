#!/usr/bin/env python3
"""Run now stored one expense; the later edit changed only the template."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
import flow_checks as f  # noqa: E402
import seed  # noqa: E402

rows = f.personal(f.LABEL + " rent")
f.check([f.money(x["cost"]) for x in rows] == [f.money("15")], f"expenses: {rows}")
tpl = f.templates(f.LABEL + " rent")
f.check([f.money(t["default_cost"]) for t in tpl] == [f.money("17.25")], f"template: {tpl}")
