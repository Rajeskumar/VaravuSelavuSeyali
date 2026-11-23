#!/usr/bin/env python3
"""Guard the direct Make target as well as the verification wrapper; do not print DB secrets."""

import os
import sys
from verification import local_test_environment

if not local_test_environment(os.environ):
    sys.exit(
        "Dedicated localhost E2E_DATABASE_URL and SDLC_TEST_ENV=local required; database must be disposable and initialized."
    )
