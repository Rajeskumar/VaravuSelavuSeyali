#!/usr/bin/env python3
"""Network check for receipt-ocr-native-android: the recognised text was posted to parse_ocr once, and any upload fallback to
/parse carried allow_ai=false (the declined consent choice; the server enforces it)."""
import os
import subprocess
import sys
import time

here = os.path.dirname(os.path.abspath(__file__))
seed = os.path.join(here, "..", "..", "scripts", "seed.py")
state = os.environ["E2E_STATE"]


def expect(path, *flags):
    return subprocess.run([sys.executable, seed, "expect-proxy", "--state", state, "--method", "POST", "--path", path, *flags]).returncode


# The proxy logs a request only after the backend has answered: give a request fired by the last tap time to land.
time.sleep(5)
sys.exit(
    expect("/api/v1/ingest/receipt/parse_ocr", "--equals", "1")
    | expect("/api/v1/ingest/receipt/parse", "--at-most", "1", "--allow-ai", "false")
)
