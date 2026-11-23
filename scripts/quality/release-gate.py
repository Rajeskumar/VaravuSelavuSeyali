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


def evaluate_runs(runs, sha):
    eligible = [
        r
        for r in runs
        if r.get("head_sha") == sha
        and r.get("head_branch") == "main"
        and r.get("event") in ("push", "workflow_dispatch")
    ]
    if not eligible:
        return False, "no main-branch run on candidate commit"
    # A new pending/failed run supersedes an old success. PR-only runs are insufficient.
    run = max(
        eligible,
        key=lambda r: (r.get("run_number", 0), r.get("run_attempt", 0), r.get("id", 0)),
    )
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="Rajeskumar/VaravuSelavuSeyali")
    parser.add_argument("--sha", required=True)
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
    for workflow in WORKFLOWS:
        try:
            ok, detail = evaluate_runs(
                fetch_runs(args.repo, workflow, args.sha, token), args.sha
            )
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
