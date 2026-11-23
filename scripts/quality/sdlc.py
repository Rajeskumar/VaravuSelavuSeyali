#!/usr/bin/env python3
"""Repo-local artifact validation and evidence gates. Does not grant permissions or deploy."""

import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
PHASES = ["discover", "plan", "build", "validate", "deploy"]
PLAN_FIELDS = ("id", "risk", "mode", "acceptance_criteria", "required_evidence")


def read(path):
    return json.loads(Path(path).read_text())


def validate_document(data, name):
    from jsonschema import Draft202012Validator, FormatChecker

    schema = read(ROOT / f".ai-sdlc/schemas/{name}.schema.json")
    Draft202012Validator.check_schema(schema)
    errors = sorted(
        Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(data),
        key=lambda e: str(e.path),
    )
    if errors:
        raise ValueError("; ".join(f"{list(e.path)}: {e.message}" for e in errors))


def plan_fingerprint(folder):
    folder = Path(folder)
    work = read(folder / "work-item.json")
    payload = {k: work[k] for k in PLAN_FIELDS}
    h = hashlib.sha256(json.dumps(payload, sort_keys=True).encode())
    for name in ("requirements.md", "implementation.md", "test-plan.md"):
        h.update(name.encode())
        h.update(
            (folder / name).read_bytes() if (folder / name).exists() else b"<missing>"
        )
    return h.hexdigest()


def snapshot(root=ROOT):
    """Hash tracked + unignored worktree content, modes and symlinks, including deletions.

    Artifact ledgers/reports are excluded to avoid a self-referential hash; feature plans
    stay included. No staging, commits, file contents, environment variables or secrets printed.
    """
    root = Path(root)
    raw = subprocess.check_output(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=root,
    )
    h = hashlib.sha256()
    for name in sorted(set(raw.split(b"\0")) - {b""}):
        rel = name.decode()
        if rel.startswith("docs/sdlc/") and Path(rel).name in (
            "README.md",
            "evidence.json",
            "findings.json",
            "release.json",
            "release.md",
            "validation.md",
        ):
            continue
        path = root / rel
        h.update(len(name).to_bytes(8, "big") + name)
        if path.is_symlink():
            content = str(path.readlink()).encode()
            kind = b"link"
        elif path.is_file():
            if rel.startswith("docs/sdlc/") and path.name == "work-item.json":
                work = read(path)
                content = json.dumps(
                    {k: work[k] for k in PLAN_FIELDS}, sort_keys=True
                ).encode()
            else:
                content = path.read_bytes()
            kind = str(path.stat().st_mode & 0o777).encode()
        elif not path.exists():
            content = b""
            kind = b"deleted"
        else:
            # Submodule content requires separate pinned evidence, not an apparent pass.
            raise ValueError(f"unsupported tracked directory: {rel}")
        h.update(kind + b"\0" + len(content).to_bytes(8, "big") + content)
    return h.hexdigest()


def load_work(folder):
    folder = Path(folder)
    docs = {}
    for name in ("work-item", "evidence", "findings"):
        docs[name] = read(folder / f"{name}.json")
        validate_document(docs[name], name)
    w = docs["work-item"]
    for label, values in [
        ("acceptance criteria", [a["id"] for a in w["acceptance_criteria"]]),
        ("required evidence", w["required_evidence"]),
        ("evidence", [r["id"] for r in docs["evidence"]["results"]]),
        ("findings", [f["id"] for f in docs["findings"]["findings"]]),
    ]:
        if len(values) != len(set(values)):
            raise ValueError(f"duplicate {label}")
    ac = {a["id"] for a in w["acceptance_criteria"]}
    for result in docs["evidence"]["results"]:
        if not set(result["acceptance_criteria"]) <= ac:
            raise ValueError(f"unknown acceptance criterion in {result['id']}")
    return docs


def finding_issues(findings, passed_ids):
    blocked, missing, waived = [], [], False
    for f in findings:
        if f["status"] == "fixed":
            if f["verification_evidence"] not in passed_ids:
                missing.append(f"{f['id']}: fix needs current passing verification")
        elif f["status"] == "accepted":
            waiver = f["waiver"]
            if f["severity"] == "P0":
                blocked.append(f"{f['id']}: P0 cannot be waived")
            elif not waiver or date.fromisoformat(waiver["expires"]) < date.today():
                blocked.append(f"{f['id']}: missing or expired waiver")
            else:
                waived = True
        elif f["status"] == "dismissed":
            if f["verification_evidence"] not in passed_ids:
                missing.append(f"{f['id']}: dismissal needs evidence")
        elif f["severity"] in ("P0", "P1"):
            (missing if f["certainty"] == "Suspected" else blocked).append(
                f"{f['id']}: unresolved {f['severity']}"
            )
    return blocked, missing, waived


def verdict(blocked, missing, waived=False):
    return {
        "verdict": (
            "BLOCKED"
            if blocked
            else (
                "INCOMPLETE_EVIDENCE"
                if missing
                else ("PASS_WITH_APPROVED_WAIVERS" if waived else "PASS")
            )
        ),
        "blocking": blocked,
        "missing": missing,
    }


def work_gate(folder, phase, current_snapshot):
    docs = load_work(folder)
    w = docs["work-item"]
    blocked, missing = [], []
    index = PHASES.index(phase)
    if not w["acceptance_criteria"]:
        missing.append("observable acceptance criteria")
    names = ["requirements.md"] + (
        ["implementation.md", "test-plan.md"] if index >= 1 else []
    )
    for name in names:
        p = Path(folder) / name
        if not p.exists() or not p.read_text().strip():
            missing.append(name)
    if index >= 1 and not w["required_evidence"]:
        missing.append("required evidence IDs established in Plan")
    if index >= 2 and w["risk"] == "high":
        approval = w["implementation_approval"]
        if not approval or approval["fingerprint"] != plan_fingerprint(folder):
            missing.append(
                "implementation authorization for current plan (existing user authorization may be recorded)"
            )
    waived = False
    if index >= 3:
        results = {r["id"]: r for r in docs["evidence"]["results"]}
        passed = {
            k
            for k, r in results.items()
            if r["status"] == "passed" and r["snapshot"] == current_snapshot
        }
        blocked += [
            f"{key}: failed"
            for key, r in results.items()
            if r["snapshot"] == current_snapshot and r["status"] == "failed"
        ]
        # Required entries are explicitly selected in Plan; source content changes invalidate them.
        for key in w["required_evidence"]:
            r = results.get(key)
            if not r or r["snapshot"] != current_snapshot or r["status"] == "skipped":
                missing.append(f"{key}: missing, stale or skipped")
        covered = {ac for key in passed for ac in results[key]["acceptance_criteria"]}
        missing += [
            f"{a['id']}: no current passing verification"
            for a in w["acceptance_criteria"]
            if a["id"] not in covered
        ]
        b, m, waived = finding_issues(docs["findings"]["findings"], passed)
        blocked += b
        missing += m
    if phase == "deploy":
        missing.append(
            "use release-gate with a candidate release record; a work item cannot authorize deployment"
        )
    return verdict(blocked, missing, waived)


RELEASE_CHECKS = {
    "unit-ci",
    "qa-ci",
    "framework-ci",
    "security",
    "acceptance",
    "reviews",
    "migration-compatibility",
    "configuration",
    "recovery",
}


def release_gate(record, production=False):
    validate_document(record, "release")
    blocked, missing = [], []
    candidate = record["candidate"]
    if candidate == "0" * 40:
        missing.append("real candidate commit")
    authorization = record["authorization"]
    if not authorization or authorization["candidate"] != candidate:
        missing.append("deployment authorization for this candidate")
    ids = [c["id"] for c in record["checks"]]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate release check IDs")
    checks = {c["id"]: c for c in record["checks"]}
    required = RELEASE_CHECKS | (
        {"production-smoke", "production-errors"} if production else set()
    )
    for key in sorted(required | set(checks)):
        c = checks.get(key)
        if not c or c["candidate"] != candidate or c["status"] == "skipped":
            missing.append(f"{key}: missing, stale or skipped")
        elif c["status"] == "failed":
            blocked.append(f"{key}: failed")
    components = {c["name"]: c for c in record["components"]}
    if len(components) != len(record["components"]):
        raise ValueError("duplicate component names")
    for name in sorted({"backend", "frontend"} | set(components)):
        c = components.get(name)
        if not c:
            missing.append(f"{name}: component and previous image required")
        elif production:
            if c["status"] == "failed":
                blocked.append(f"{name}: deployment failed")
            elif (
                c["status"] != "deployed"
                or c["observed_image"] != c["expected_image"]
                or not c["revision"]
                or not c["build_url"]
            ):
                missing.append(f"{name}: deployed image, revision and build evidence")
    if not record["work_items"]:
        missing.append("linked work items or a documented legacy release record")
    result = verdict(blocked, missing)
    result["limitations"] = [
        "Linked work-item content, candidate-bound validation and waiver validity require original-source review; a nonempty link list is not proof.",
        "Recorded authorization and manual results are declarations; verify the actual user and evidence sources. Exact-candidate CI is independently checked by release-gate.py.",
    ]
    return result


def validate_all():
    count = 0
    seen = set()
    for directory in ("work-items", "archive"):
        for path in (ROOT / "docs/sdlc" / directory).rglob("work-item.json"):
            item = load_work(path.parent)["work-item"]
            if item["id"] in seen:
                raise ValueError(f"duplicate work item ID: {item['id']}")
            seen.add(item["id"])
            count += 1
    for path in (ROOT / "docs/sdlc").rglob("release.json"):
        validate_document(read(path), "release")
        count += 1
    for name in ("work-item", "evidence", "findings", "release"):
        path = (
            ROOT
            / ".ai-sdlc/templates"
            / ("release" if name == "release" else "work-item")
            / f"{name}.json"
        )
        validate_document(read(path), name)
    print(
        f"Artifacts valid: {count} records; templates valid (validation is not a gate verdict)"
    )


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("validate")
    sub.add_parser("snapshot")
    init = sub.add_parser("init")
    init.add_argument("id")
    init.add_argument("--title", required=True)
    init.add_argument(
        "--risk", choices=["trivial", "standard", "high"], default="standard"
    )
    fp = sub.add_parser("plan-fingerprint")
    fp.add_argument("folder")
    gate = sub.add_parser("gate")
    gate.add_argument("folder")
    gate.add_argument("--phase", choices=PHASES, required=True)
    rel = sub.add_parser("release-gate")
    rel.add_argument("record")
    rel.add_argument("--production", action="store_true")
    args = p.parse_args()
    try:
        if args.command == "validate":
            validate_all()
        elif args.command == "snapshot":
            print(snapshot())
        elif args.command == "plan-fingerprint":
            print(plan_fingerprint(args.folder))
        elif args.command == "init":
            if not re.fullmatch(r"TS-[A-Z0-9-]+", args.id):
                raise ValueError(
                    "ID must be TS- followed by uppercase letters, numbers or hyphens"
                )
            dest = ROOT / "docs/sdlc/work-items" / args.id
            if any((ROOT / "docs/sdlc").rglob(args.id + "/work-item.json")):
                raise ValueError("work item ID already exists")
            shutil.copytree(ROOT / ".ai-sdlc/templates/work-item", dest)
            w = read(dest / "work-item.json")
            w.update(id=args.id, title=args.title, risk=args.risk)
            (dest / "work-item.json").write_text(json.dumps(w, indent=2) + "\n")
            print(dest.relative_to(ROOT))
        else:
            result = (
                work_gate(args.folder, args.phase, snapshot())
                if args.command == "gate"
                else release_gate(read(args.record), args.production)
            )
            print(json.dumps(result, indent=2))
            return (
                0 if result["verdict"] in ("PASS", "PASS_WITH_APPROVED_WAIVERS") else 1
            )
    except (ValueError, OSError, subprocess.CalledProcessError) as e:
        print(f"SDLC error: {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
