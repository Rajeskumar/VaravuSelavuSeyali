#!/usr/bin/env python3
"""Non-blocking reminder: application code changed but CHANGELOG.md did not.

Used as a Stop hook (Claude Code and Codex) and runnable directly (`make docs-touch`).
It never blocks or continues a turn; it only surfaces a warning via `systemMessage`.
Hook mode reads (and ignores) the hook JSON on stdin; plain mode prints text.
"""

import json
import subprocess
import sys

CODE_PREFIXES = ("varavu_selavu_app/", "varavu_selavu_ui/src/", "varavu_selavu_mobile/src/")


def is_code(path):
    if not path.startswith(CODE_PREFIXES):
        return False
    return not (
        "/tests/" in path or ".test." in path or "/__tests__/" in path or path.endswith(".md")
    )


def changed_files():
    def git(*args):
        return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout

    base = "HEAD"
    for ref in ("origin/main", "main"):
        if subprocess.run(["git", "rev-parse", "--verify", "-q", ref], capture_output=True).returncode == 0:
            base = git("merge-base", ref, "HEAD").strip()
            break
    names = set(git("diff", "--name-only", base).splitlines())
    names |= set(git("ls-files", "--others", "--exclude-standard").splitlines())
    return names


def message(files):
    code = sorted(f for f in files if is_code(f))
    if not code or "CHANGELOG.md" in files:
        return None
    return (
        f"{len(code)} application file(s) changed but CHANGELOG.md did not. If this is a meaningful "
        "change, follow the AGENTS.md maintenance instruction (CHANGELOG, FEATURE_STATUS, spec)."
    )


def main():
    hook = "--hook" in sys.argv
    if hook:
        try:
            json.load(sys.stdin)
        except ValueError:
            pass
    try:
        text = message(changed_files())
    except (subprocess.CalledProcessError, OSError):
        return 0
    if text:
        print(json.dumps({"systemMessage": f"[docs] {text}"}) if hook else f"docs-touch: {text}")
    elif not hook:
        print("docs-touch: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
