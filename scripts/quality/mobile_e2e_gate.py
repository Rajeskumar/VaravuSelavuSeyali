#!/usr/bin/env python3
"""Change classification and the final 'Native mobile gate' verdict for .github/workflows/mobile-e2e.yml (TS-QA-103).

    mobile_e2e_gate.py scope   --base SHA --head SHA --event NAME [--input-suite S]   -> writes relevant=/suite= to $GITHUB_OUTPUT
    mobile_e2e_gate.py verdict --changes R --relevant true|false --android R --ios R  -> exit 0 pass / 1 fail

Since 2026-11-25 the workflow is dormant (manual dispatch only) and the native E2E is local, release-time evidence;
MOBILE_AFFECTING_* is also what release_tools.py uses to decide whether a release needs it. If the workflow's PR/push
triggers are re-enabled, "not applicable" is decided here: the device jobs run only when the change can affect the native
app or the suite itself. When the changed files cannot be determined (no diff, a new branch, a forced push) the jobs run:
never skip silently. Manual runs always run. The gate passes only for a classified not-applicable change or when BOTH platform jobs
succeeded; failed, cancelled and unexpectedly skipped platform jobs, or a failed classification, all fail it.
Keep MOBILE_AFFECTING_* identical to MOBILE_E2E_* in routing.py (a test pins them together). Stdlib only.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys

# What can change the native app or the suite: the app, the suite, this workflow and gate, and the two backend launchers the
# suite runs (qa/scripts/*). The backend itself is NOT listed (owner decision: native E2E only when mobile code changed), so a
# backend-only release never runs the app on a simulator (open finding C-16). To include it, add "varavu_selavu_app/" here and
# in routing.py (a test keeps both lists identical).
MOBILE_AFFECTING_PREFIXES = ("varavu_selavu_mobile/", "qa/mobile/")
MOBILE_AFFECTING_FILES = (".github/workflows/mobile-e2e.yml", "scripts/quality/mobile_e2e_gate.py",
                          "qa/scripts/bootstrap_schema.py", "qa/scripts/provision_qa_session_user.py")


def is_mobile_affecting(path: str) -> bool:
    return path.startswith(MOBILE_AFFECTING_PREFIXES) or path in MOBILE_AFFECTING_FILES


def is_relevant(files: list[str]) -> bool:
    if not files:
        return True  # the diff could not be determined: run
    return any(is_mobile_affecting(f) for f in files)


def suite_for(event: str, input_suite: str | None) -> str:
    if event in ("push", "schedule"):
        return "regression"
    if event == "workflow_dispatch" and input_suite in ("smoke", "regression"):
        return input_suite
    return "smoke"


def decide(*, changes: str, relevant: str, android: str, ios: str) -> tuple[bool, str]:
    if changes != "success":
        return False, f"change classification did not succeed ({changes or 'no result'})"
    if relevant not in ("true", "false"):
        return False, f"unknown relevance {relevant!r}"
    if relevant == "false":
        if android in ("failure", "cancelled") or ios in ("failure", "cancelled"):
            return False, f"platform job failed although the change was classified not applicable (android={android}, ios={ios})"
        return True, "not applicable: no mobile-affecting change, device jobs intentionally skipped"
    if android == "success" and ios == "success":
        return True, "both platforms passed"
    return False, f"relevant change but not both platforms passed (android={android or 'no result'}, ios={ios or 'no result'})"


def _changed_files(base: str, head: str, cwd: str | None = None) -> list[str]:
    # -z: NUL-separated, never C-quoted (without it a non-ASCII or odd name is printed as "dir/\303\251.ts" and misses the prefix
    # match, so a mobile change could be classified not applicable). --no-renames: both sides of a rename are listed.
    out = subprocess.run(["git", "diff", "-z", "--name-only", "--no-renames", f"{base}...{head}"],
                         capture_output=True, text=True, check=True, cwd=cwd)
    return [name for name in out.stdout.split("\0") if name]


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("scope")
    s.add_argument("--base", default="")
    s.add_argument("--head", default="")
    s.add_argument("--event", required=True)
    s.add_argument("--input-suite")
    v = sub.add_parser("verdict")
    v.add_argument("--changes", default="")
    v.add_argument("--relevant", default="")
    v.add_argument("--android", default="")
    v.add_argument("--ios", default="")
    a = ap.parse_args()
    if a.cmd == "scope":
        if a.event in ("pull_request", "push") and a.base and a.head and set(a.base) != {"0"}:
            try:
                relevant = is_relevant(_changed_files(a.base, a.head))
            except subprocess.CalledProcessError:
                relevant = True  # e.g. a forced push whose previous commit is gone: run rather than skip silently
        else:
            relevant = True  # schedule / dispatch always run; so does a push with no usable previous commit (before=0000...)
        lines = [f"relevant={'true' if relevant else 'false'}", f"suite={suite_for(a.event, a.input_suite)}"]
        print("\n".join(lines))
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
                fh.write("\n".join(lines) + "\n")
        return 0
    ok, message = decide(changes=a.changes, relevant=a.relevant, android=a.android, ios=a.ios)
    print(("PASS: " if ok else "FAIL: ") + message)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
