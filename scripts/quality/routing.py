#!/usr/bin/env python3
"""Risk-tiered review routing. Paths set a conservative baseline; intent can add risk, never remove it.

Tiers (see .ai-sdlc/lifecycle.md):
  trivial  docs/copy/assets only            -> deterministic checks, no reviewers
  standard application code, tests, framework docs -> implementation-review (+ ui-review for UI)
  high     auth, money, migrations, AI/LLM, personal-data exports, uploads, CI/deploy, gates,
           hooks and permission settings     -> + security-review and the Tier-3 process
Product review is requested by the work item (--product), not inferred from paths.
"""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ORDER = ["implementation-review", "product-review", "security-review", "ui-review"]
REVIEWER_AGENT = {
    "implementation-review": "code-reviewer",
    "product-review": "product-reviewer",
    "security-review": "security-reviewer",
    "ui-review": "ui-reviewer",
}

APP = "varavu_selavu_app/"
SVC = APP + "varavu_selavu_service/"

# Tier 3 (high): a wrong change here loses money, leaks data, bypasses auth or ships unchecked.
HIGH_PREFIXES = (
    SVC + "auth/",
    SVC + "oauth/",
    SVC + "mcp/",
    SVC + "core/",
    SVC + "db/",
    SVC + "repo/",
    SVC + "services/ocr/",
    APP + "alembic/",
    APP + "scripts/ai_access.py",
    "varavu_selavu_ui/src/api/request.ts",
    "varavu_selavu_ui/src/api/csrf.ts",
    "varavu_selavu_ui/src/api/auth.ts",
    "varavu_selavu_ui/src/api/apiconfig.ts",
    "varavu_selavu_mobile/src/core/auth/",
    "varavu_selavu_mobile/src/core/api/",
    ".github/workflows/",
    ".github/rulesets/",
    ".cloudbuild/",
    ".githooks/",
    "scripts/hooks/",
    "scripts/release.sh",
    "scripts/pre-commit.sh",
    "scripts/pre-push.sh",
    ".claude/settings.json",
    ".codex/hooks.json",
    ".codex/config.toml",
)
HIGH_FILES = {SVC + "main.py"} | {
    SVC + "services/" + name
    for name in (
        # Ownership/membership checks live in these (an IDOR here is a P0).
        "expense_service.py",
        "expense_comment_service.py",
        "group_service.py",
        "budget_service.py",
        "split_suggestion_service.py",
        "recurring_service.py",
        "fx_rate_service.py",
        "card_rewards_engine.py",
        "ai_quota_service.py",
        "chat_service.py",
        "categorization_service.py",
        "receipt_service.py",
        "split_engine.py",
        "item_split_engine.py",
        "settlement_service.py",
        "balance_service.py",
        "friend_balance_service.py",
        "group_expense_service.py",
        "expense_write_service.py",
        "personal_write_lock.py",
        "account_export_service.py",
        "personal_export_service.py",
        "group_export_service.py",
        "email_service.py",
    )
}
# Gate/enforcement logic in the framework itself. Its tests are ordinary code.
FRAMEWORK_GATE_FILES = {
    "scripts/quality/" + name
    for name in (
        "routing.py",
        "verification.py",
        "release-gate.py",
        "release_tools.py",
        "sdlc.py",
        "sdlc_github.py",
        "secret_scan.py",
        "test_integrity.py",
        "check-local-test-env.py",
        "migration-rehearsal.sh",
        "validate-ai-sdlc.py",
        "verify.sh",
        "route-review.sh",
        "security.sh",
    )
}
# Security review at standard risk: endpoints and request models (authorization, validation),
# consent and HTML-safety utilities, audit gating, and the reviewer instructions themselves.
SECURITY_PREFIXES = (
    SVC + "api/",
    SVC + "models/",
    # Every service scopes data to the requesting user somewhere (an IDOR is a P0), so all of them
    # get security review; the money/auth/data-export ones above are additionally high risk.
    SVC + "services/",
    "varavu_selavu_ui/src/utils/aiConsent.ts",
    "varavu_selavu_ui/src/utils/html.ts",
    "varavu_selavu_mobile/src/features/ask/utils/aiConsent.ts",
    "varavu_selavu_mobile/audit-allowlist.json",
    "scripts/check-audit.js",
    ".claude/agents/",
    ".codex/agents/",
    ".agents/skills/security-review/",
    "Makefile",
)
DEPENDENCY_FILES = ("package.json", "package-lock.json", "pyproject.toml", "poetry.lock")
FRAMEWORK_PREFIXES = (".ai-sdlc/", ".agents/", ".claude/", ".codex/", "scripts/quality/", "scripts/hooks/")
FRAMEWORK_FILES = ("gemini.md", ".github/copilot-instructions.md")
INSTRUCTION_FILES = ("agents.md", "claude.md")  # root or nested
# Work-item ledgers: validated by framework-check, never part of a reviewer's scope (recording a
# review would otherwise change the reviewer's own scope hash). Same exclusion idea as sdlc.snapshot().
RECORD_SUFFIXES = (".json", ".md")
INFRA_NAMES = ("dockerfile", "docker-compose", "cloudbuild")
DOC_SUFFIXES = (".md", ".txt", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")
PERFORMANCE_HINTS = (
    "analytics", "insight", "analysis", "aggregation", "balance", "export",
    "recurring", "plotly", "chart", "feed", "virtual",
)
# Generated or scratch output is never a reviewable change; exclude it before routing.
EXCLUDED_SEGMENTS = {
    "node_modules", "__pycache__", "build", "dist", "coverage", ".sdlc-logs",
    "playwright-report", "test-results", ".expo", ".pytest_cache", ".venv-sdlc",
}
EXCLUDED_TOP_PREFIXES = ("tmp", "scratch", ".tmp")


def excluded(path):
    parts = Path(path).parts
    return bool(parts) and (
        any(p in EXCLUDED_SEGMENTS for p in parts)
        or parts[0].lower().startswith(EXCLUDED_TOP_PREFIXES)
    )


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


def scope_hash(paths, root=None):
    """Content hash of exactly these paths (missing files hash as absent).

    A reviewer whose scope hash matches its recorded evidence has nothing new to review.
    """
    root = Path(root or Path(__file__).resolve().parents[2])
    h = hashlib.sha256()
    for rel in sorted(set(paths)):
        path = root / rel
        h.update(rel.encode() + b"\0")
        if path.is_symlink():
            h.update(b"link\0" + str(path.readlink()).encode())
        elif path.is_file():
            h.update(b"file\0" + path.read_bytes())
        else:
            h.update(b"absent\0")
    return h.hexdigest()


def _is_ui(p):
    if ".test." in p or "/__tests__/" in p:
        return False
    if p.endswith((".tsx", ".jsx")) and p.startswith(
        ("varavu_selavu_ui/src/", "varavu_selavu_mobile/src/")
    ):
        return True
    return p.startswith(("varavu_selavu_ui/src/", "varavu_selavu_mobile/src/")) and (
        p.endswith((".css", ".scss")) or "/theme" in p
    )


def classify(files, risk=None, product=False):
    reviewers, checks, manual, focus = {}, set(), set(), set()
    high = False
    skipped = sorted(f for f in files if excluded(f))
    files = [f for f in files if not excluded(f)]

    def add(reviewer, path):
        reviewers.setdefault(reviewer, set()).add(path)

    for path in files:
        p = path.lower()
        name = Path(p).name
        framework = (
            p.startswith(FRAMEWORK_PREFIXES) or p in FRAMEWORK_FILES or name in INSTRUCTION_FILES
        )
        records = p.startswith("docs/sdlc/")
        infra = name.startswith(INFRA_NAMES) or p == "makefile"
        # CI/build configuration is checked by framework-check (test_configuration.py).
        ci_config = (
            p.startswith((".github/", ".cloudbuild/", ".githooks/"))
            or p in (".gitignore", "makefile")
            or (p.startswith("scripts/") and p.count("/") == 1 and p.endswith(".sh"))
        )
        docs = Path(p).suffix in DOC_SUFFIXES

        if records or framework or ci_config or infra:
            checks.add("framework")
        if records and Path(p).suffix in RECORD_SUFFIXES:
            continue
        if docs and not framework:
            continue  # Tier 1: ordinary docs, copy and images

        add("implementation-review", path)
        gate = path in FRAMEWORK_GATE_FILES
        is_high = (
            path.startswith(HIGH_PREFIXES)
            or path in HIGH_FILES
            or gate
            or (infra and p != "makefile")
        )
        if is_high:
            high = True
            add("security-review", path)
            checks.add("security")
        elif path.startswith(SECURITY_PREFIXES):
            add("security-review", path)
            checks.add("security")
        if name in DEPENDENCY_FILES:
            checks.update(("security", "dependency-audit"))
        if p.startswith(APP):
            checks.add("backend")
        if p.startswith("varavu_selavu_ui/"):
            checks.add("web")
        if p.startswith("varavu_selavu_mobile/"):
            checks.add("mobile")
        if p.startswith("qa/"):
            checks.add("qa-typecheck")
            manual.add("local-integration")
        if _is_ui(p):
            add("ui-review", path)
            if p.startswith("varavu_selavu_ui/"):
                checks.add("web-accessibility")
            else:
                manual.add("native-device")
        if any(hint in p for hint in PERFORMANCE_HINTS) and not docs:
            focus.add("performance")
        if p.startswith(APP + "alembic/") or p.startswith(SVC + "db/"):
            manual.add("migration-postgres")
        if infra or p.startswith((".github/workflows/", ".cloudbuild/")):
            manual.add("release-readiness")
        if not (
            framework
            or infra
            or ci_config
            or records
            or p.startswith(
                ("varavu_selavu_app/", "varavu_selavu_ui/", "varavu_selavu_mobile/", "qa/")
            )
        ):
            manual.add("unmapped-area-checks")

    # Escalations widen review to every reviewable file, never to work-item ledgers or plain docs.
    reviewable = [
        f for f in files
        if not (f.lower().startswith("docs/sdlc/") and Path(f).suffix in RECORD_SUFFIXES)
    ]
    if risk == "high" and files:
        high = True
        for path in reviewable:
            add("implementation-review", path)
            add("security-review", path)
    if product and reviewable:
        for path in reviewable:
            add("product-review", path)

    ordered = [r for r in ORDER if r in reviewers]
    return {
        "files": files,
        "excluded": skipped,
        "risk": "high" if high else ("standard" if reviewers else "trivial"),
        "reviewers": ordered,
        "agents": [REVIEWER_AGENT[r] for r in ordered],
        "focus": sorted(focus),
        "checks": sorted(checks),
        "manual": sorted(manual),
        "scopes": {r: sorted(reviewers[r]) for r in ordered},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
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
    result["scope_hashes"] = {r: scope_hash(fs) for r, fs in result["scopes"].items()}
    if args.json:
        print(json.dumps(result, indent=2))
        return
    print(f"Changed files: {len(result['files'])}; risk: {result['risk']}")
    if result["excluded"]:
        print(f"Excluded (generated/scratch): {len(result['excluded'])}")
    for r, agent in zip(result["reviewers"], result["agents"]):
        print(f"Reviewer: {r} (agent {agent}) files={len(result['scopes'][r])} scope={result['scope_hashes'][r][:12]}")
    if not result["reviewers"]:
        print("Reviewers: none (deterministic checks only)")
    print("Focus: " + (", ".join(result["focus"]) or "none"))
    print("Check categories: " + (", ".join(result["checks"]) or "none"))
    print("Additional evidence: " + (", ".join(result["manual"]) or "none"))
    print("Next: make check (summary output). Skip a reviewer whose scope hash matches its recorded evidence.")


if __name__ == "__main__":
    main()
