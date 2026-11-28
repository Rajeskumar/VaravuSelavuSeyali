#!/usr/bin/env python3
"""Two personal expenses: one to edit, one to delete."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
import flow_checks as f  # noqa: E402
import seed  # noqa: E402

f.personal_expense(f.LABEL + " keep", "12.50")
f.personal_expense(f.LABEL + " drop", "4.25")
print(json.dumps({}))
