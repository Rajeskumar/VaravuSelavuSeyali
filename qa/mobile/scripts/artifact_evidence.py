#!/usr/bin/env python3
"""Build evidence for the native-E2E artifact (TS-QA-103, AC-001).

    artifact_evidence.py write  --artifact PATH --platform ios|android --api-url URL --out FILE
    artifact_evidence.py verify --artifact PATH --evidence FILE [--platform ios|android]

`write` records what was built (variant, endpoint, commit, SHA-256 of the exact .app directory / .apk file).
`verify` is what run.sh calls before installing: it refuses an artifact whose digest differs from the
evidence, a non-e2e variant, or an endpoint that is not a local test backend. Stdlib only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e2e_guard  # noqa: E402


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def digest(path: Path) -> str:
    """SHA-256 of a file, or a deterministic digest of a directory tree (paths, kinds, contents, links)."""
    path = Path(path)
    if path.is_file():
        return file_sha256(path)
    if not path.is_dir():
        raise e2e_guard.GuardError(f"artifact not found: {path}")
    h = hashlib.sha256()
    for root, dirs, files in os.walk(path):
        dirs.sort()
        for name in sorted(files + [d for d in dirs if (Path(root) / d).is_symlink()]):
            p = Path(root) / name
            rel = p.relative_to(path).as_posix()
            if p.is_symlink():
                h.update(f"L\0{rel}\0{os.readlink(p)}\n".encode())
            else:
                h.update(f"F\0{rel}\0{file_sha256(p)}\n".encode())
    return h.hexdigest()


def _git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return ""


def write(artifact: Path, platform: str, api_url: str, out: Path) -> dict:
    e2e_guard.validate_app_api_url(api_url)
    if platform not in ("ios", "android"):
        raise e2e_guard.GuardError(f"unknown platform {platform!r}")
    evidence = {
        "variant": "e2e",
        "platform": platform,
        "api_url": api_url,
        "commit": _git("rev-parse", "HEAD"),
        "tree_dirty": bool(_git("status", "--porcelain")),
        "artifact": Path(artifact).name,
        "sha256": digest(artifact),
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    Path(out).write_text(json.dumps(evidence, indent=2) + "\n")
    return evidence


def verify(artifact: Path, evidence_file: Path, platform: str | None = None) -> dict:
    try:
        evidence = json.loads(Path(evidence_file).read_text())
    except (OSError, ValueError) as exc:
        raise e2e_guard.GuardError(f"cannot read build evidence {evidence_file}: {exc}") from exc
    if evidence.get("variant") != "e2e":
        raise e2e_guard.GuardError("build evidence is not for the e2e variant")
    if platform and evidence.get("platform") != platform:
        raise e2e_guard.GuardError(f"build evidence is for {evidence.get('platform')!r}, not {platform!r}")
    e2e_guard.validate_app_api_url(evidence.get("api_url"))
    actual = digest(artifact)
    if actual != evidence.get("sha256"):
        raise e2e_guard.GuardError(f"artifact digest {actual[:12]}... differs from build evidence {str(evidence.get('sha256'))[:12]}...")
    return evidence


def _main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("write")
    w.add_argument("--artifact", required=True)
    w.add_argument("--platform", required=True)
    w.add_argument("--api-url", required=True)
    w.add_argument("--out", required=True)
    v = sub.add_parser("verify")
    v.add_argument("--artifact", required=True)
    v.add_argument("--evidence", required=True)
    v.add_argument("--platform")
    a = ap.parse_args(argv)
    try:
        if a.cmd == "write":
            ev = write(Path(a.artifact), a.platform, a.api_url, Path(a.out))
        else:
            ev = verify(Path(a.artifact), Path(a.evidence), a.platform)
        print(json.dumps(ev))
    except e2e_guard.GuardError as exc:
        print(f"REFUSED: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
