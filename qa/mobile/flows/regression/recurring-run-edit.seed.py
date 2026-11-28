#!/usr/bin/env python3
"""One monthly template that is not due yet."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts"))
import flow_checks as f  # noqa: E402
import seed  # noqa: E402

f.recurring_template(f.LABEL + " rent", "15.00")
print(json.dumps({}))
