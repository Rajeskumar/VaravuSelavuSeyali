#!/usr/bin/env python3
"""Network check for receipt-import: the recognised text was posted to parse_ocr once, and the image was never uploaded."""
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
seed = os.path.join(here, "..", "..", "scripts", "seed.py")
state = os.environ["E2E_STATE"]


def expect(path, equals):
    return subprocess.run([sys.executable, seed, "expect-proxy", "--state", state, "--method", "POST", "--path", path,
                           "--equals", str(equals)]).returncode


sys.exit(expect("/api/v1/ingest/receipt/parse_ocr", 1) | expect("/api/v1/ingest/receipt/parse", 0))
