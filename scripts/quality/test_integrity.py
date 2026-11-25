#!/usr/bin/env python3
"""Flag changes that weaken tests: deleted test files, new skip/xfail/only markers, and a net
loss of assertions. Deterministic backstop for the "never weaken tests to pass" rule.

    test_integrity.py                 working tree (staged + unstaged + untracked) vs merge-base
    test_integrity.py --staged        staged changes only (pre-commit)
    test_integrity.py --range A B     commits A..B (CI)

A deliberate change (e.g. removing an obsolete test) is acknowledged by a human with a commit
trailer `Test-Change-Approved: <reason>` in the range, or TEST_INTEGRITY_ACK="<reason>" locally.
Exit 1 on unacknowledged findings.
"""

import argparse
import os
from pathlib import Path
import re
import subprocess
import sys

TEST_FILE = re.compile(
    r"(^|/)(tests?|__tests__)/|(^|/)test_[^/]+\.py$|_test\.py$|\.(test|spec)\.[jt]sx?$|"
    r"(^|/)qa/mobile/flows/.+\.(ya?ml|py)$"  # native E2E flows and their server-side verify/seed scripts (TS-QA-103)
)
SKIP_MARKER = re.compile(
    r"\bpytest\.mark\.(skip|skipif|xfail)\b|\bpytest\.(skip|xfail|importorskip)\(|"
    r"\bunittest\.(skip|skipIf|skipUnless|expectedFailure)\b|"
    r"\.(skip|only|todo|fixme)\(|\b(xit|xtest|xdescribe|fit|fdescribe)\(|\bself\.skipTest\("
)
ASSERTION = re.compile(
    r"\bassert\b|\bself\.assert\w*\(|\bexpect\(|\bassert_\w+\(|\.should\("
    r"|\bassert(?:Not)?Visible\b|\bassertTrue\b|\bextendedWaitUntil\b"  # Maestro flow steps that assert
)
TRAILER = "Test-Change-Approved:"
# This checker's own fixtures contain the markers it detects.
SELF_FIXTURES = {"scripts/quality/tests/test_test_integrity.py"}


def is_test(path):
    return bool(TEST_FILE.search(path)) and path not in SELF_FIXTURES


# Pin diff output format: user config (noprefix, mnemonicPrefix, color, external diff) would
# otherwise change the "+++ b/<path>" lines this parser relies on and silently disable the check.
GIT_PIN = ["-c", "diff.noprefix=false", "-c", "diff.mnemonicPrefix=false", "-c", "color.ui=never"]
DIFF_FLAGS = ["--no-color", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", "-M"]


def git(*args):
    return subprocess.run(
        ["git", *GIT_PIN, *args], check=True, capture_output=True, text=True
    ).stdout


def default_base():
    for ref in ("origin/main", "main"):
        if subprocess.run(["git", "rev-parse", "--verify", "-q", ref], capture_output=True).returncode == 0:
            return git("merge-base", ref, "HEAD").strip()
    return "HEAD"


def collect(staged=False, range_=None, base=None):
    """Return (name_status_lines, unified_diff_text, untracked_test_files)."""
    if range_:
        # Three-dot: compare against the merge base, so commits that landed on the base branch
        # after the branch point don't look like deletions on this branch.
        spec = [f"{range_[0]}...{range_[1]}"]
        untracked = []
    elif staged:
        spec = ["--cached"]
        untracked = []
    else:
        spec = [base or default_base()]
        untracked = [
            f for f in git("ls-files", "--others", "--exclude-standard").splitlines()
            if is_test(f)
        ]
    status = git("diff", *DIFF_FLAGS, "--name-status", *spec).splitlines()
    diff = git("diff", *DIFF_FLAGS, "-U0", *spec)
    return status, diff, untracked


def analyse(status_lines, diff_text, untracked=(), read=lambda p: Path(p).read_text(errors="replace")):
    findings = []
    for line in status_lines:
        parts = line.split("\t")
        if parts and parts[0].startswith("D") and is_test(parts[-1]):
            findings.append(f"deleted test file: {parts[-1]}")
        elif parts and parts[0][:1] in ("R", "C") and len(parts) == 3:
            old, new = parts[1], parts[2]
            if parts[0][0] == "R" and is_test(old) and not is_test(new):
                findings.append(f"test file moved out of test paths: {old} -> {new}")

    # Assertions are counted per file: new asserts elsewhere don't hide removed ones here.
    added, removed = {}, {}
    current = None
    for line in diff_text.splitlines():
        if line.startswith("+++ "):
            path = line[4:]
            current = path[2:] if path.startswith("b/") else None
            continue
        if line.startswith("--- "):
            continue
        if not current or not is_test(current):
            continue
        if line.startswith("+"):
            body = line[1:]
            if SKIP_MARKER.search(body):
                findings.append(f"new skip/only marker: {current}: {body.strip()[:120]}")
            added[current] = added.get(current, 0) + len(ASSERTION.findall(body))
        elif line.startswith("-"):
            removed[current] = removed.get(current, 0) + len(ASSERTION.findall(line[1:]))

    for path in untracked:
        try:
            text = read(path)
        except OSError:
            continue
        for body in text.splitlines():
            if SKIP_MARKER.search(body):
                findings.append(f"new skip/only marker: {path}: {body.strip()[:120]}")
        added[path] = added.get(path, 0) + len(ASSERTION.findall(text))

    for path in sorted(removed):
        if removed[path] > added.get(path, 0):
            findings.append(f"assertion loss in {path}: -{removed[path]} +{added.get(path, 0)}")
    return findings


def acknowledged(range_):
    if os.environ.get("TEST_INTEGRITY_ACK", "").strip():
        return "TEST_INTEGRITY_ACK"
    if range_:
        log = git("log", "--format=%B", f"{range_[0]}..{range_[1]}")
        for line in log.splitlines():
            if line.startswith(TRAILER) and line[len(TRAILER):].strip():
                return line.strip()
    return None


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--staged", action="store_true")
    mode.add_argument("--range", nargs=2, metavar=("FROM", "TO"))
    mode.add_argument("--base")
    args = p.parse_args()
    root = git("rev-parse", "--show-toplevel").strip()
    os.chdir(root)
    if args.base:
        args.base = git("merge-base", args.base, "HEAD").strip()
    findings = analyse(*collect(args.staged, args.range, args.base))
    if not findings:
        print("test-integrity: OK")
        return 0
    ack = acknowledged(args.range)
    for f in findings:
        print(f"test-integrity: {f}")
    if ack:
        print(f"test-integrity: acknowledged by {ack[:120]}")
        return 0
    print(
        "test-integrity: tests may have been weakened. Restore them, or have a human acknowledge "
        f"with a commit trailer '{TRAILER} <reason>' (CI) or TEST_INTEGRITY_ACK='<reason>' (local)."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
