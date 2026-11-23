#!/usr/bin/env python3
"""Conservative path-based review routing; intent can add risk, never remove checks."""

import argparse
import json
from pathlib import Path
import re
import subprocess

ORDER = [
    "implementation-review",
    "product-review",
    "test-review",
    "security-review",
    "accessibility-review",
    "ux-review",
    "performance-review",
]


def changed_files(base=None):
    def git(*args):
        return subprocess.check_output(["git", *args])

    if base is None:
        base = (
            "origin/main"
            if subprocess.run(
                ["git", "rev-parse", "--verify", "-q", "origin/main"],
                stdout=subprocess.DEVNULL,
            ).returncode
            == 0
            else "main"
        )
    # Bad refs must fail; falling back to HEAD can silently omit the actual change.
    merge_base = git("merge-base", base, "HEAD").decode().strip()
    paths = set()
    for args in [
        ("diff", "--name-only", "-z", merge_base, "HEAD"),
        ("diff", "--name-only", "-z"),
        ("diff", "--cached", "--name-only", "-z"),
        ("ls-files", "--others", "--exclude-standard", "-z"),
    ]:
        paths.update(p.decode() for p in git(*args).split(b"\0") if p)
    return sorted(paths)


def classify(files, risk=None, product=False):
    reviewers, checks, manual = set(), set(), set()
    high = False
    for path in files:
        p = path.lower()
        framework = p.startswith(
            (".ai-sdlc/", ".agents/", ".agent/", ".claude/", "scripts/quality/")
        ) or p in (
            "agents.md",
            "claude.md",
            "gemini.md",
            ".github/copilot-instructions.md",
        )
        records = p.startswith("docs/sdlc/")
        infra = (
            p.startswith((".github/workflows/", ".cloudbuild/", ".githooks/"))
            or Path(p).name.startswith(("dockerfile", "docker-compose", "cloudbuild"))
            or p
            in (
                "makefile",
                ".gitignore",
                "scripts/release.sh",
                "scripts/pre-push.sh",
                "scripts/pre-commit.sh",
            )
        )
        docs = Path(p).suffix in (
            ".md",
            ".txt",
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".svg",
        )
        if records:
            checks.add("framework")
            if Path(p).suffix in (".json", ".md"):
                continue
        if docs and not framework and not infra:
            continue
        style = Path(p).suffix in (".css", ".scss") or "/theme" in p
        reviewers.update(("implementation-review", "test-review"))
        if framework or infra:
            checks.add("framework")
            reviewers.add("security-review")
            high = True
        if p.startswith("varavu_selavu_app/"):
            checks.add("backend")
        if p.startswith("varavu_selavu_ui/"):
            checks.add("web")
        if p.startswith("varavu_selavu_mobile/"):
            checks.add("mobile")
        if p.startswith("qa/"):
            checks.add("qa-typecheck")
            manual.add("local-integration")
        sensitive = re.search(
            r"/(auth|oauth|mcp|core|db|alembic)/|/api/|permission|authoriz|csrf|cors|upload|secret|ai_quota|chat|llm|prompt|expense|split|settle|money|payment|budget",
            p,
        )
        dependencies = Path(p).name in (
            "package.json",
            "package-lock.json",
            "pyproject.toml",
            "poetry.lock",
        )
        if sensitive or dependencies or infra or framework:
            reviewers.add("security-review")
            checks.add("security")
            high = high or bool(sensitive or infra or framework)
        ui = p.endswith((".tsx", ".jsx")) and p.startswith(
            ("varavu_selavu_ui/src/", "varavu_selavu_mobile/")
        )
        behavior = ui or ("/services/" in p and p.endswith(".py"))
        if behavior or product:
            reviewers.add("product-review")
        if ui or style:
            reviewers.update(("accessibility-review", "ux-review"))
            if p.startswith("varavu_selavu_ui/"):
                checks.add("web-accessibility")
            if p.startswith("varavu_selavu_mobile/"):
                manual.add("native-device")
        if re.search(
            r"analytics|insight|analysis|aggregation|balance|export|recurring|plotly|chart|feed|virtual",
            p,
        ):
            reviewers.add("performance-review")
        if "/alembic/" in p or "/db/" in p:
            manual.add("migration-postgres")
        if infra:
            manual.add("release-readiness")
        if not (
            framework
            or infra
            or p.startswith(
                (
                    "varavu_selavu_app/",
                    "varavu_selavu_ui/",
                    "varavu_selavu_mobile/",
                    "qa/",
                )
            )
        ):
            manual.add("unmapped-area-checks")
    if risk == "high":
        high = True
        reviewers.update(("implementation-review", "test-review", "security-review"))
    if product and files:
        reviewers.add("product-review")
    return {
        "files": files,
        "risk": "high" if high else ("standard" if reviewers else "trivial"),
        "reviewers": [r for r in ORDER if r in reviewers],
        "checks": sorted(checks),
        "manual": sorted(manual),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base", nargs="?")
    parser.add_argument("--files", nargs="*")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--risk", choices=["high"])
    parser.add_argument("--product", action="store_true")
    args = parser.parse_args()
    result = classify(
        args.files if args.files is not None else changed_files(args.base),
        args.risk,
        args.product,
    )
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"Changed files: {len(result['files'])}; risk: {result['risk']}")
        print("Reviewers to run: " + (", ".join(result["reviewers"]) or "none"))
        print("Check categories: " + (", ".join(result["checks"]) or "none"))
        print("Additional evidence: " + (", ".join(result["manual"]) or "none"))
        print(
            "Run verify.sh --profile fast first. Integration/release profiles require their documented environment."
        )
        print(
            "Path routing is a baseline: inspect behavior and requirements; escalate risk when needed."
        )


if __name__ == "__main__":
    main()
