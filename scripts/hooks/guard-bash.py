#!/usr/bin/env python3
"""PreToolUse guard for shell commands, shared by Claude Code and Codex.

Turns the repo's "never without asking" rules into a deterministic check:
  deny  force-push to main/release refs, `npm audit fix --force`
  ask   git push, hook bypass (--no-verify, -n, SKIP_HOOKS, core.hooksPath), release tags and
        scripts/release.sh, any gcloud command that is not a known read (list/describe/...),
        alembic unless the same command sets DATABASE_URL to a localhost URL, destructive git
        resets, mutating gh calls, test-integrity acknowledgements

Claude Code supports "ask" (the user confirms in the permission prompt). Codex parses "ask" but
does not support it yet, so on Codex an ask-class command is denied unless the command starts
with SDLC_GUARD_APPROVED=1, which the agent may add only after the user approved it in chat.
This is a guardrail, not a security boundary: `sh -c`, aliases or scripts can evade it; CI,
branch rules and Cloud Build remain the enforcement points.

stdin: hook JSON with tool_input.command. stdout: hookSpecificOutput JSON or nothing. Exit 0.
Unreadable input fails open with a message on stderr (the tool's own permission rules still apply).
"""

import argparse
import json
import re
import shlex
import sys
from urllib.parse import urlparse

APPROVED_PREFIX = re.compile(r"^\s*SDLC_GUARD_APPROVED=1\s+")
QUOTED = re.compile(r"'[^']*'|\"(?:\\.|[^\"\\])*\"")
# Heredoc bodies are data (file contents, messages), not commands.
HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1[^\n]*\n.*?^\s*\2\s*$", re.S | re.M)
# git global options between `git` and the subcommand (git -C path push, git -c k=v commit).
# Any option is skipped (git -p, --no-optional-locks, ...); options that take a separate value
# also skip that value, quoted or not.
_GIT_VALUE = r"(?:\"[^\"]*\"|'[^']*'|\S+)"
GIT_GLOBALS = re.compile(
    r"\bgit((?:\s+(?:(?:-C|-c|--git-dir|--work-tree|--namespace|--exec-path|--config-env|--super-prefix)"
    r"\s+" + _GIT_VALUE + r"|-\S*))+)(?=\s)"
)
# && || |& ; | & (background, not the & in 2>&1 / &>) and newlines all separate commands.
SEGMENT_SPLIT = re.compile(r"&&|\|\||\|&|;|\||(?<![<>&])&(?![>&])|\n")
# Command substitutions run even inside double quotes: their bodies are judged as commands.
SUBSTITUTION = re.compile(r"\$\(([^()]*)\)|`([^`]*)`")
GCLOUD_VALUE_FLAGS = {"--format", "--filter", "--project", "--region", "--limit", "--sort-by", "--zone", "--location"}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
# gcloud verbs that only read. Anything else (deploy, rm, restore, access, set, run, ...) asks.
GCLOUD_MUTATING_VERBS = {
    "deploy", "update", "delete", "execute", "submit", "create", "add", "destroy", "replace",
    "update-traffic", "import", "export", "patch", "set-iam-policy", "add-iam-policy-binding",
    "remove-iam-policy-binding", "enable", "disable", "rollback", "rollout", "rm", "cp", "mv",
    "restore", "access", "set", "unset", "start", "stop", "reset", "resume", "pause", "failover",
    "cancel", "promote", "remove", "attach", "detach", "print-access-token", "activate-service-account",
}
GCLOUD_READ_VERBS = {
    "list", "describe", "read", "get-iam-policy", "info", "version", "help", "log", "tail",
    "list-tags", "list-grantable-roles", "get-value", "get-server-config", "logs",
}

DENY_RULES = [
    (
        re.compile(r"\bnpm\s+audit\s+fix\b.*--force\b"),
        "`npm audit fix --force` downgrades Expo on mobile; use the reviewed audit allowlist instead.",
    ),
]
FORCE_PUSH = re.compile(r"\bgit\s+push(?=\s|$)(?=.*(\s--force\b|\s--force-with-lease\b|\s-[a-zA-Z]*f\b|\s\+|:\+))")
# A segment that IS a push (after env assignments), so a commit message mentioning one isn't.
STARTS_WITH_PUSH = re.compile(r"^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*git\s+push(?=\s|$)")
PROTECTED_REF = re.compile(r"\b(main|master|release-)")

ASK_RULES = [
    (re.compile(r"\bgit\s+push(?=\s|$)"), "Pushing needs the user's explicit go-ahead."),
    (
        re.compile(
            r"\bgit\s+(commit|push|merge|rebase|am|cherry-pick)\b.*\s--no-v\w*"
            r"|\bgit\s+commit\b.*\s-[a-zA-Z]*n[a-zA-Z]*(\s|$)|\bSKIP_HOOKS=1\b",
        ),
        "Bypassing git hooks needs the user's explicit request.",
    ),
    (
        re.compile(r"(^|[\s;&|/])(\./)?scripts/release\.sh\b"),
        "Release tags deploy to production; deployment needs explicit authorization.",
    ),
    (
        re.compile(r"\bgit\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f|checkout\s+--\s+\.|restore\s+(--staged\s+)?\.(\s|$))"),
        "This discards local work; confirm with the user first.",
    ),
    (
        re.compile(
            r"\bgh\s+(pr\s+(merge|close)|release\s+(create|delete|edit)|issue\s+(close|delete)|repo\s+(edit|delete)"
            r"|workflow\s+(run|disable|enable)|secret\s|variable\s|ruleset\s"
            r"|api\b.*(-X|--method)\s*(POST|PUT|PATCH|DELETE))",
            re.IGNORECASE,
        ),
        "This changes GitHub state outside the standing board authorization.",
    ),
]
# Checked on the raw command (quotes included): acknowledgements must come from the human.
RAW_ASK_RULES = [
    # Before git-option normalization: `git -c core.hooksPath=/dev/null commit` skips hooks.
    (re.compile(r"core\.hooksPath", re.IGNORECASE), "Bypassing git hooks needs the user's explicit request."),
    (
        re.compile(r"\bTEST_INTEGRITY_ACK=|Test-Change-Approved:"),
        "A test-integrity acknowledgement must come from the user, not the agent.",
    ),
]


def strip_quotes(command):
    """Command shape only: drop heredoc bodies and quoted strings (data, not commands)."""
    return QUOTED.sub("''", HEREDOC.sub("<<heredoc", command))


def unquote(command):
    """Heredocs dropped, git options normalized (quoted values intact), then quote characters
    removed but quoted words kept (for refs like "main" or '+main')."""
    return normalize_git(HEREDOC.sub("<<heredoc", command)).replace('"', "").replace("'", "")


def normalize_git(command):
    return GIT_GLOBALS.sub("git", command)


def segments(command):
    return [s for s in SEGMENT_SPLIT.split(command) if s.strip()]


def tokens(segment):
    try:
        return shlex.split(segment)
    except ValueError:
        return segment.split()


def gcloud_needs_approval(command):
    for segment in segments(command):
        words = tokens(segment)
        names = [w.rsplit("/", 1)[-1] for w in words]  # /opt/homebrew/bin/gcloud counts too
        if "gcloud" not in names:
            continue
        verbs, skip = [], False
        for w in words[names.index("gcloud") + 1 :]:
            if skip:
                skip = False
            elif w.startswith("-"):
                skip = w in GCLOUD_VALUE_FLAGS  # "--format list": the value is not a verb
            else:
                verbs.append(w)
        # "run" is a command group first (gcloud run ...) but a mutating verb later (triggers run).
        mutating = any(v in GCLOUD_MUTATING_VERBS for v in verbs) or "run" in verbs[1:]
        if mutating or not any(v in GCLOUD_READ_VERBS for v in verbs):
            return True
    return False


def local_url(url):
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    # libpq honours ?host=/hostaddr=/service= over the netloc, so any query string is suspect.
    return (
        parsed.scheme.startswith("postgres")
        and parsed.hostname in LOCAL_HOSTS
        and not parsed.query
        and bool(parsed.path.strip("/"))
    )


def alembic_on_unnamed_db(command):
    """True when an alembic upgrade/downgrade/stamp isn't pinned to a localhost DATABASE_URL.

    alembic/env.py reads only DATABASE_URL (falling back to .env, which may be production), so the
    same command segment must start with `DATABASE_URL=<localhost url>` (optionally via `env`).
    """
    # Each segment of the original text (quotes kept) is judged on its own: the URL must be set on
    # the very command that runs alembic. Separators inside quotes only split more (asks more).
    for raw in segments(HEREDOC.sub("<<heredoc", command)):
        if not re.search(r"\balembic\b.*\b(upgrade|downgrade|stamp)\b", raw.replace('"', "").replace("'", "")):
            continue
        words = tokens(raw)
        if words and words[0] == "env":
            words = words[1:]
        assignments = {}
        for word in words:
            if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", word):
                key, _, value = word.partition("=")
                assignments[key] = value
            else:
                break
        if not local_url(assignments.get("DATABASE_URL", "")):
            return True
    return False


def decide(command, depth=0):
    """Return (decision, reason) with decision in {None, 'ask', 'deny'}."""
    if not command:
        return None, ""
    if depth < 3:
        for match in SUBSTITUTION.finditer(HEREDOC.sub("<<heredoc", command)):
            inner = decide(match.group(1) or match.group(2) or "", depth + 1)
            if inner[0]:
                return inner
    shape = normalize_git(strip_quotes(command))
    for rule, reason in DENY_RULES:
        if rule.search(shape):
            return "deny", reason
    # Refs may be quoted ("main"): the push shape comes from the stripped form, refs from the unquoted one.
    for segment in segments(unquote(command)):
        if STARTS_WITH_PUSH.search(segment) and FORCE_PUSH.search(segment) and PROTECTED_REF.search(segment):
            return "deny", "Force-pushing main or a release ref is never allowed."
    for rule, reason in RAW_ASK_RULES:
        if rule.search(command):
            return "ask", reason
    for rule, reason in ASK_RULES:
        if rule.search(shape):
            return "ask", reason
    if re.search(r"\bgit\s+tag\b", shape) and re.search(r"\brelease-", unquote(command)):
        return "ask", "Release tags deploy to production; deployment needs explicit authorization."
    if gcloud_needs_approval(command):
        return "ask", "Only read-only gcloud commands run without approval (deploy/secrets/IAM/data need it)."
    if alembic_on_unnamed_db(command):
        return "ask", (
            "Alembic reads DATABASE_URL (from .env, which may be production). Start the command with "
            "DATABASE_URL=<localhost postgres url>, or get the user's explicit approval."
        )
    return None, ""


def emit(decision, reason):
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": decision,
                    "permissionDecisionReason": f"[repo guard] {reason}",
                }
            }
        )
    )


def run(tool, raw_input):
    try:
        payload = json.loads(raw_input)
        command = payload["tool_input"]["command"] if isinstance(payload, dict) else None
    except (ValueError, KeyError, TypeError):
        command = None
    if not isinstance(command, str):
        print("guard-bash: unreadable hook input; not enforcing", file=sys.stderr)
        return
    approved = bool(APPROVED_PREFIX.match(command))
    decision, reason = decide(APPROVED_PREFIX.sub("", command))
    if decision is None:
        return
    if decision == "ask" and tool == "codex":
        if approved:
            return
        decision = "deny"
        reason += (
            " Codex hooks cannot prompt: ask the user in chat; after explicit approval rerun the "
            "command prefixed with SDLC_GUARD_APPROVED=1."
        )
    emit(decision, reason)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tool", choices=["claude", "codex"], default="claude")
    args = parser.parse_args()
    try:
        run(args.tool, sys.stdin.read())
    except Exception as exc:  # noqa: BLE001 - a crashing hook must never look like approval silently
        print(f"guard-bash: internal error ({type(exc).__name__}); not enforcing", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
