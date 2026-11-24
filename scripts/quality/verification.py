#!/usr/bin/env python3
"""Named check profiles; execution results are evidence, not product/release approval.

Output is a short summary: one line per command, plus a bounded excerpt for each failure.
Full logs are written to .sdlc-logs/<run>/ (gitignored) so they never flood an agent's
context. Use --stream for the raw output.
"""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import urlparse
from routing import changed_files, classify

ROOT = Path(__file__).resolve().parents[2]
LOG_ROOT = ROOT / ".sdlc-logs"
EXCERPT_LINES = 20
# Lines worth showing from a failing log, across pytest, Jest, tsc, eslint, Playwright and make.
FAILURE_PATTERN = re.compile(
    r"(FAILED|ERROR|Error:|error TS\d+|✕|●|AssertionError|^E\s|Traceback|"
    r"\d+ (failed|errors?)\b|^\s*\d+:\d+\s+error|npm ERR!|make: \*\*\*|INCOMPLETE_EVIDENCE|"
    r"Test Suites:.*failed|Tests:.*failed|vulnerabilit)",
    re.IGNORECASE,
)
AUDIT_TARGETS = {
    "varavu_selavu_app/": "audit-backend",
    "varavu_selavu_ui/": "audit-web",
    "varavu_selavu_mobile/": "audit-mobile",
    "qa/": "audit-qa",
}


def commands(profile, files, all_areas=False, build=False, base=None):
    routed = classify(files)
    checks = set(routed["checks"])
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
        if "dependency-audit" in checks and profile == "fast":
            targets = sorted(
                {
                    target
                    for prefix, target in AUDIT_TARGETS.items()
                    for f in routed["files"]
                    if f.startswith(prefix)
                }
            )
            if targets:
                result.append(["make", *targets])
        result.append(["python3", "scripts/quality/test_integrity.py"] + (["--base", base] if base else []))
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
            # libpq honours ?host=/hostaddr=/service= over the netloc: no query strings at all.
            and not url.query
        )
    except ValueError:
        return False


NOISE_PATTERN = re.compile(r"\b0 (vulnerabilities|failed|errors?)\b|console\.error|found 0\b", re.IGNORECASE)


def failure_excerpt(text, limit=EXCERPT_LINES):
    """Bounded, actionable excerpt: the LAST matching error lines (summaries and final failures
    come at the end of test output) with one line of context, else the tail."""
    lines = text.splitlines()
    picked = []
    for i, line in enumerate(lines):
        if FAILURE_PATTERN.search(line) and not NOISE_PATTERN.search(line):
            for j in (i, i + 1):
                if j < len(lines) and (not picked or picked[-1] < j):
                    picked.append(j)
    chosen = [lines[i] for i in picked[-limit:]] or lines[-limit:]
    return [line[:300] for line in chosen]


def slug(command):
    return re.sub(r"[^a-zA-Z0-9]+", "-", " ".join(command[:3])).strip("-")[:48]


def run_summarized(plan, env, log_dir, keep_going):
    log_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for index, command in enumerate(plan, 1):
        log = log_dir / f"{index:02d}-{slug(command)}.log"
        started = time.monotonic()
        with open(log, "w", encoding="utf-8", errors="replace") as handle:
            code = subprocess.run(
                command, env=env, stdout=handle, stderr=subprocess.STDOUT
            ).returncode
        elapsed = round(time.monotonic() - started, 1)
        status = "PASS" if code == 0 else "FAIL"
        rel = os.path.relpath(log, ROOT)
        print(f"{status}  {' '.join(command)}  ({elapsed}s)  log: {rel}", flush=True)
        entry = {"command": command, "status": status, "exit": code, "seconds": elapsed, "log": rel}
        if code:
            excerpt = failure_excerpt(log.read_text(encoding="utf-8", errors="replace"))
            entry["excerpt"] = excerpt
            for line in excerpt:
                print(f"    {line}")
        results.append(entry)
        if code and not keep_going:
            break
    (log_dir / "summary.json").write_text(json.dumps(results, indent=2))
    return results


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
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
    p.add_argument("--stream", action="store_true", help="print raw command output (no log files)")
    p.add_argument("--stop-on-failure", action="store_true", help="fast profile keeps going by default")
    p.add_argument("--base")
    p.add_argument("--files", nargs="*")
    args = p.parse_args()
    os.chdir(ROOT)
    profile = "release" if args.full else args.profile
    files = args.files if args.files is not None else changed_files(args.base)
    plan = commands(profile, files, args.all_areas, args.build, args.base)
    routed = classify(files)
    header = {
        "profile": profile,
        "commands": len(plan),
        "manual_evidence": routed["manual"],
        "excluded_paths": len(routed["excluded"]),
    }
    if args.dry_run:
        header["commands"] = plan
        header["limits"] = "No native device, product acceptance, live cloud or reviewer approval is implied."
        print(json.dumps(header, indent=2))
        return 0
    print(json.dumps(header), flush=True)
    if profile == "fast" and "unmapped-area-checks" in routed["manual"]:
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
    run_id = f"sdlc{time.time_ns()}"
    env = dict(os.environ, SDLC_PYTHON=sys.executable, QA_RUN_ID=run_id)
    if args.stream:
        for command in plan:
            print("Running: " + " ".join(command), flush=True)
            code = subprocess.run(command, env=env).returncode
            if code:
                return code
        print("Selected checks passed. Apply the work-item/release gate before claiming readiness.")
        return 0
    keep_going = profile == "fast" and not args.stop_on_failure
    results = run_summarized(plan, env, LOG_ROOT / f"{profile}-{run_id}", keep_going)
    failed = [r for r in results if r["status"] == "FAIL"]
    if failed:
        print(f"{len(failed)} of {len(plan)} checks failed. Read only the failing log sections.")
        return failed[0]["exit"] or 1
    print(f"All {len(plan)} selected checks passed. Apply the work-item/release gate before claiming readiness.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
