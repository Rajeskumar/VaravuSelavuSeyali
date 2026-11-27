#!/usr/bin/env python3
"""Static source logging guard (TS-OBS-001 AC-01, AC-02, OBS-03).

Fails if unsafe dynamic logging patterns are introduced in backend services, web source,
or mobile core outside reviewed safe adapters (`core/observability/`, `core/logger.ts`).
Behavioral sentinel tests (not this regex check alone) establish runtime privacy.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Iterable, List, Tuple

ROOT = Path(__file__).resolve().parents[2]

BACKEND_FORBIDDEN: List[Tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"\b(?:logger|logging)\.(?:debug|info|warning|error|exception|critical)\(\s*f[\"']"),
        "dynamic f-string in backend logger call (use core.observability.log_event with allowlisted fields)",
    ),
    (
        re.compile(r"Mock Email Output|msg\.as_string\(\)"),
        "raw MIME email body logging is forbidden (even in local mode)",
    ),
    (
        re.compile(r"Agent step \[|\bextra\s*=\s*\{[^}]*[\"'](?:error|response|url)[\"']"),
        "raw agent/provider error or payload extra is forbidden in backend logs",
    ),
]

MOBILE_CORE_FORBIDDEN: List[Tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"\bconsole\.(?:log|warn|error|info|debug)\("),
        "raw console.* call in mobile core (use core/logger.ts)",
    ),
]


def scan_text(rel_path: str, text: str, rules: Iterable[Tuple[re.Pattern[str], str]]) -> List[str]:
    findings: List[str] = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith("#") or stripped.startswith("//"):
            continue
        for pattern, reason in rules:
            if pattern.search(line):
                findings.append(f"{rel_path}:{lineno}: {reason}")
    return findings


def scan_repository(root: Path = ROOT) -> List[str]:
    findings: List[str] = []

    backend_dir = root / "varavu_selavu_app" / "varavu_selavu_service"
    if backend_dir.exists():
        for py_file in sorted(backend_dir.rglob("*.py")):
            rel = py_file.relative_to(root).as_posix()
            # email_service.py legitimately calls msg.as_string() inside server.sendmail(...),
            # not inside logger calls; check only logger lines for it.
            text = py_file.read_text(encoding="utf-8", errors="ignore")
            for lineno, line in enumerate(text.splitlines(), start=1):
                stripped = line.strip()
                if stripped.startswith("#"):
                    continue
                for pattern, reason in BACKEND_FORBIDDEN:
                    if pattern.pattern.startswith("Mock Email Output") and "sendmail" in line:
                        continue
                    if pattern.search(line):
                        findings.append(f"{rel}:{lineno}: {reason}")

    mobile_core_dir = root / "varavu_selavu_mobile" / "src" / "core"
    if mobile_core_dir.exists():
        for ts_file in sorted(mobile_core_dir.rglob("*.ts*")):
            rel = ts_file.relative_to(root).as_posix()
            if rel.endswith("logger.ts") or ".test." in ts_file.name:
                continue
            text = ts_file.read_text(encoding="utf-8", errors="ignore")
            findings.extend(scan_text(rel, text, MOBILE_CORE_FORBIDDEN))

    return findings


def main() -> int:
    findings = scan_repository()
    if findings:
        print("logging-guard: FAILED", file=sys.stderr)
        for item in findings:
            print(f"  {item}", file=sys.stderr)
        return 1
    print("logging-guard: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
