#!/usr/bin/env python3
"""Lightweight tracked AND untracked text scan; print locations only, never secret values."""

from pathlib import Path
import re
import subprocess
import sys

PATTERN = re.compile(
    r'-----BEGIN (?:(?:RSA|EC|OPENSSH|DSA) )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,}|"private_key"\s*:'
)


def scan(root):
    root = Path(root).resolve()
    findings = []
    raw = subprocess.check_output(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=root,
    )
    for name in sorted(set(raw.split(b"\0")) - {b""}):
        rel = name.decode()
        path = root / rel
        if path.is_symlink():
            if not path.resolve().is_relative_to(root):
                findings.append(f"{rel}: external symlink not scanned")
            continue
        if not path.exists():
            continue  # deletion
        if not path.is_file():
            continue
        try:
            data = path.read_bytes()
            if b"\0" in data:
                continue
            content = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        except OSError:
            findings.append(f"{rel}: unreadable")
            continue
        for line, text in enumerate(content.splitlines(), 1):
            if PATTERN.search(text):
                findings.append(f"{rel}:{line}: secret-like pattern (redacted)")
    return findings


if __name__ == "__main__":
    root = subprocess.check_output(
        ["git", "rev-parse", "--show-toplevel"], text=True
    ).strip()
    results = scan(root)
    print(
        "\n".join(results)
        if results
        else "No known secret patterns found (lightweight scan; not exhaustive)."
    )
    sys.exit(1 if results else 0)
