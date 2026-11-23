#!/usr/bin/env python3
"""Named check profiles; execution results are evidence, not product/release approval."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlparse
from routing import changed_files, classify

ROOT = Path(__file__).resolve().parents[2]


def commands(profile, files, all_areas=False, build=False):
    checks = set(classify(files)["checks"])
    result = []
    if profile in ("fast", "release"):
        if all_areas or profile == "release":
            checks.update(
                ("framework", "backend", "web", "mobile", "qa-typecheck", "security")
            )
        if "framework" in checks:
            result.append(["make", "framework-check"])
        if "backend" in checks:
            result.append(["make", "test-backend"])
        if "web" in checks:
            result.append(["make", "lint-web", "typecheck-web", "test-web"])
        if "mobile" in checks:
            result.append(["make", "typecheck-mobile", "test-mobile"])
        if "qa-typecheck" in checks:
            result.append(["npm", "--prefix", "qa", "run", "typecheck"])
        if "security" in checks:
            result.append(["bash", "scripts/quality/security.sh", "--no-audit"])
        if build or profile == "release":
            result.append(["npm", "--prefix", "varavu_selavu_ui", "run", "build"])
    if profile in ("integration", "release"):
        result += [
            ["make", "test-postgres"],
            ["make", "qa-all"],
            ["node", "scripts/quality/axe-scan.mjs", "http://localhost:3000"],
        ]
    if profile == "release":
        result.append(["make", "qa-regression-extra"])
    if profile in ("integration", "release"):
        result.append(["make", "qa-account"])
    if profile == "release":
        result.append(["make", "audit-all"])
    if profile == "production":
        result.append(["make", "qa-prod-smoke"])
    return result


def local_test_environment(env):
    try:
        url = urlparse(env.get("E2E_DATABASE_URL", ""))
        return (
            env.get("SDLC_TEST_ENV") == "local"
            and url.scheme in ("postgresql", "postgresql+psycopg2")
            and url.hostname in ("localhost", "127.0.0.1", "::1")
            and bool(url.path.strip("/"))
        )
    except ValueError:
        return False


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--profile",
        choices=["fast", "integration", "release", "production"],
        default="fast",
    )
    p.add_argument(
        "--full",
        action="store_true",
        help="compatibility alias for release; needs local integration environment",
    )
    p.add_argument("--all-areas", action="store_true")
    p.add_argument("--build", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--base")
    p.add_argument("--files", nargs="*")
    args = p.parse_args()
    os.chdir(ROOT)
    profile = "release" if args.full else args.profile
    files = args.files if args.files is not None else changed_files(args.base)
    plan = commands(profile, files, args.all_areas, args.build)
    print(
        json.dumps(
            {
                "profile": profile,
                "commands": plan,
                "manual_evidence": classify(files)["manual"],
                "limits": "No native device, product acceptance, live cloud or reviewer approval is implied.",
            },
            indent=2,
        ),
        flush=True,
    )
    if args.dry_run:
        return 0
    if profile == "fast" and "unmapped-area-checks" in classify(files)["manual"]:
        print(
            "INCOMPLETE_EVIDENCE: executable/configuration changes outside mapped areas need an explicit check mapping."
        )
        return 2
    if profile in ("integration", "release"):
        if not local_test_environment(os.environ):
            print(
                "INCOMPLETE_EVIDENCE: set SDLC_TEST_ENV=local and E2E_DATABASE_URL to a dedicated local throwaway database; start the local QA stack."
            )
            return 2
    env = dict(
        os.environ, SDLC_PYTHON=sys.executable, QA_RUN_ID=f"sdlc{time.time_ns()}"
    )
    for command in plan:
        print("Running: " + " ".join(command), flush=True)
        code = subprocess.run(command, env=env).returncode
        if code:
            return code
    print(
        "Selected checks passed. Apply the work-item/release gate before claiming readiness."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
