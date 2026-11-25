#!/usr/bin/env python3
"""Fail closed unless required GitHub workflows passed on this exact main-branch commit.

Used by local release hooks AND Cloud Build before any build, migration or deployment.
GH_TOKEN is optional for public repos; private repos require Actions read permission.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

WORKFLOWS = ("unit.yml", "qa.yml", "framework.yml")

# Native mobile E2E (TS-QA-103). A green mobile-e2e.yml run is only release evidence when BOTH platform jobs of the
# REGRESSION suite succeeded: a smoke-only or one-platform run must not pass. The job names come from the workflow
# ("ios (<suite>)" / "android (<suite>)"). The workflow only runs device jobs for mobile-affecting changes, so a candidate
# without one has no run: main() then tells the operator to dispatch a regression run for it.
MOBILE_E2E_WORKFLOW = "mobile-e2e.yml"
MOBILE_E2E_REQUIRED_JOBS = ("ios (regression)", "android (regression)")
# Promotion switch. The workflow is advisory until its promotion criteria (work item TS-QA-103) are met; flip this
# in that change (and update the test that pins it). `--require-mobile-e2e` enforces it for a single run.
ENFORCE_MOBILE_E2E = False


def select_run(runs, sha):
    eligible = [
        r
        for r in runs
        if r.get("head_sha") == sha
        and r.get("head_branch") == "main"
        and r.get("event") in ("push", "workflow_dispatch")
    ]
    if not eligible:
        return None
    # A new pending/failed run supersedes an old success. PR-only and scheduled runs are insufficient.
    return max(
        eligible,
        key=lambda r: (r.get("run_number", 0), r.get("run_attempt", 0), r.get("id", 0)),
    )


def evaluate_jobs(jobs, required):
    problems = []
    for name in required:
        matching = [j for j in jobs if j.get("name") == name]
        if not matching:
            problems.append(f"{name}: missing")
        elif not all(j.get("status") == "completed" and j.get("conclusion") == "success" for j in matching):
            problems.append(f"{name}: " + "/".join(str(j.get("conclusion") or j.get("status")) for j in matching))
    if problems:
        return False, "required jobs not green (" + "; ".join(problems) + ")"
    return True, "required jobs green: " + ", ".join(required)


def evaluate_runs(runs, sha):
    run = select_run(runs, sha)
    if run is None:
        return False, "no main-branch run on candidate commit"
    passed = run.get("status") == "completed" and run.get("conclusion") == "success"
    return (
        passed,
        f"{run.get('status')}/{run.get('conclusion')} {run.get('html_url','')}",
    )


def fetch_runs(repo, workflow, sha, token):
    query = urllib.parse.urlencode({"head_sha": sha, "per_page": 100})
    url = (
        f"https://api.github.com/repos/{repo}/actions/workflows/{workflow}/runs?{query}"
    )
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "trackspense-release-gate",
    }
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        data = json.load(response)
    if data.get("total_count", 0) > 100:
        raise ValueError(
            "more than 100 candidate runs; cannot establish latest evidence safely"
        )
    return data["workflow_runs"]


def fetch_jobs(repo, run_id, token):
    url = f"https://api.github.com/repos/{repo}/actions/runs/{int(run_id)}/jobs?per_page=100&filter=latest"
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "trackspense-release-gate",
    }
    if token:
        headers["Authorization"] = "Bearer " + token
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
        data = json.load(response)
    if data.get("total_count", 0) > 100:
        raise ValueError("more than 100 jobs; cannot establish evidence safely")
    return data["jobs"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="Rajeskumar/VaravuSelavuSeyali")
    parser.add_argument("--sha", required=True)
    parser.add_argument(
        "--require-mobile-e2e",
        action="store_true",
        help="also require ios+android regression jobs of mobile-e2e.yml (always on once ENFORCE_MOBILE_E2E is True)",
    )
    args = parser.parse_args()
    if not re.fullmatch(
        r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repo
    ) or not re.fullmatch(r"[0-9a-f]{40}", args.sha):
        parser.error("repository owner/name and full 40-character commit SHA required")
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        try:
            token = subprocess.check_output(
                ["gh", "auth", "token"], stderr=subprocess.DEVNULL, text=True
            ).strip()
        except (OSError, subprocess.CalledProcessError):
            pass
    passed = True
    workflows = WORKFLOWS + (
        (MOBILE_E2E_WORKFLOW,) if ENFORCE_MOBILE_E2E or args.require_mobile_e2e else ()
    )
    for workflow in workflows:
        try:
            runs = fetch_runs(args.repo, workflow, args.sha, token)
            ok, detail = evaluate_runs(runs, args.sha)
            if ok and workflow == MOBILE_E2E_WORKFLOW:
                run = select_run(runs, args.sha)
                ok, jobs_detail = evaluate_jobs(
                    fetch_jobs(args.repo, run["id"], token), MOBILE_E2E_REQUIRED_JOBS
                )
                detail = f"{detail}; {jobs_detail}"
            if not ok and workflow == MOBILE_E2E_WORKFLOW:
                # The workflow starts on every push to main but only runs the device jobs for mobile-affecting changes, so
                # a candidate has either no run or a run whose device jobs were skipped.
                detail += ("; mobile-e2e.yml only runs device jobs for mobile-affecting changes: to produce the evidence run "
                           "`gh workflow run mobile-e2e.yml --ref main -f suite=regression` (the candidate must be the "
                           "tip of that ref) and re-run this gate")
        except (OSError, ValueError, KeyError) as exc:
            # Never print HTTP response bodies or credentials.
            ok, detail = (
                False,
                f"evidence unavailable ({type(exc).__name__}); check access and retry",
            )
        print(f'{workflow}: {"PASS" if ok else "BLOCKED"} — {detail}')
        passed = passed and ok
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
