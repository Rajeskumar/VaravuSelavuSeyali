#!/usr/bin/env python3
"""Same fixture as deep-link-join (owner + group + seat + invite token for the runner's user)."""
import os
import runpy

runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "deep-link-join.seed.py"), run_name="__main__")
