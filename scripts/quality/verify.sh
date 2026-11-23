#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
exec "${SDLC_PYTHON:-python3}" scripts/quality/verification.py "$@"
