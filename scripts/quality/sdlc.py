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
PLAN_DOCS = ("requirements.md", "implementation.md", "test-plan.md")
# Standard/trivial work may use one combined document instead of the three plan documents.
LIGHT_DOC = "work-item.md"
# Release checks that a waiver can never satisfy: CI, security and production observations.
NON_WAIVABLE_RELEASE_CHECKS = {
    "unit-ci",
    "qa-ci",
    "framework-ci",
    "security",
    "migration-compatibility",
    "production-smoke",
    "production-errors",
}


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
    # work-item.md is hashed only when present, so existing three-document fingerprints (and the
    # approvals recorded against them) stay byte-identical.
    names = PLAN_DOCS + ((LIGHT_DOC,) if (folder / LIGHT_DOC).exists() else ())
    for name in names:
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


def validate_scope(paths, root=ROOT):
    """Scope entries must be concrete files: present, or tracked and deleted in this change.

    Directories, globs and unknown paths would hash as a constant and never go stale.
    """
    for rel in paths:
        path = Path(root) / rel
        if Path(rel).is_absolute() or ".." in Path(rel).parts:
            raise ValueError(f"scope entry must be a repository-relative path: {rel}")
        if rel.endswith("/") or any(c in rel for c in "*?[") or path.is_dir():
            raise ValueError(f"scope entry must be a file, not a directory or glob: {rel}")
        if not path.is_file() and not path.is_symlink():
            kind = subprocess.run(
                ["git", "cat-file", "-t", f"HEAD:{rel}"], cwd=root, capture_output=True, text=True
            ).stdout.strip()
            if kind != "blob":  # a deleted directory (tree) would hash as a constant
                raise ValueError(f"scope entry does not exist and is not a tracked deletion: {rel}")


def scoped_snapshot(paths, work=None, root=ROOT):
    """Hash of these files plus the work item's plan fields (standard/trivial risk only).

    Folding in acceptance criteria/risk/required evidence means changed requirement text under
    the same AC ID still invalidates scoped evidence, as for full snapshots.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from routing import scope_hash

    h = hashlib.sha256(scope_hash(paths, root).encode())
    if work is not None:
        h.update(json.dumps({k: work[k] for k in PLAN_FIELDS}, sort_keys=True).encode())
    return h.hexdigest()


def plan_documents_missing(folder, risk, index):
    """Return missing plan documents. Non-high risk may use one combined work-item.md."""
    folder = Path(folder)

    def present(name):
        p = folder / name
        return p.exists() and bool(p.read_text().strip())

    names = ["requirements.md"] + (["implementation.md", "test-plan.md"] if index >= 1 else [])
    if risk != "high" and present(LIGHT_DOC):
        return []
    return [n for n in names if not present(n)]


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
        if result.get("scope") and w["risk"] == "high":
            raise ValueError(
                f"{result['id']}: scoped evidence is not allowed for high-risk work; use the full snapshot"
            )
        if result.get("scope"):
            validate_scope(result["scope"])
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
    missing += plan_documents_missing(folder, w["risk"], index)
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

        def current(r):
            # Scoped evidence goes stale only when its own files change (never for high risk).
            expected = scoped_snapshot(r["scope"], w) if r.get("scope") else current_snapshot
            return r["snapshot"] == expected

        passed = {k for k, r in results.items() if r["status"] == "passed" and current(r)}
        blocked += [
            f"{key}: failed"
            for key, r in results.items()
            if current(r) and r["status"] == "failed"
        ]
        # Required entries are explicitly selected in Plan; source content changes invalidate them.
        for key in w["required_evidence"]:
            r = results.get(key)
            if not r or not current(r) or r["status"] == "skipped":
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
    # Local iOS + Android regression when mobile code changed since the previous release (release_tools.py records it as
    # not applicable otherwise). Always required, so a record that lost the entry cannot pass the gate. Waivable like the
    # other manual checks (owner, reason, reference, expiry).
    "native-mobile-e2e",
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
    waived = False
    for key in sorted(required | set(checks)):
        c = checks.get(key)
        if not c or c["candidate"] != candidate or c["status"] == "skipped":
            missing.append(f"{key}: missing, stale or skipped")
        elif c["status"] == "failed":
            blocked.append(f"{key}: failed")
        elif c["status"] == "waived":
            waiver = c.get("waiver")
            if key in NON_WAIVABLE_RELEASE_CHECKS:
                blocked.append(f"{key}: CI, security and production checks cannot be waived")
            elif not waiver or date.fromisoformat(waiver["expires"]) < date.today():
                blocked.append(f"{key}: missing or expired waiver")
            else:
                waived = True
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
    result = verdict(blocked, missing, waived)
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
    snap = sub.add_parser("snapshot", help="full worktree snapshot, or a scoped one for evidence")
    snap.add_argument("--work-item", help="work-item folder (required with --scope)")
    snap.add_argument("--scope", nargs="+", help="files the evidence covers (standard/trivial risk)")
    init = sub.add_parser("init")
    init.add_argument("id")
    init.add_argument("--title", help="required unless --issue supplies it")
    init.add_argument(
        "--risk", choices=["trivial", "standard", "high"], default="standard"
    )
    init.add_argument(
        "--light",
        action="store_true",
        help="standard/trivial risk: one combined work-item.md instead of three plan documents",
    )
    init.add_argument(
        "--issue",
        type=int,
        help="seed the record from a board issue: title and link only; the issue text is untrusted input",
    )
    gh = sub.add_parser(
        "github", help="mirror work items to the GitHub Project board (see .ai-sdlc/lifecycle.md)"
    )
    gsub = gh.add_subparsers(dest="action", required=True)
    gs = gsub.add_parser("sync", help="create/update the issue + board card after the Plan gate")
    gs.add_argument("id")
    gs.add_argument("--priority", choices=["P0", "P1", "P2"])
    gs.add_argument("--size", choices=["XS", "S", "M", "L", "XL"])
    gs.add_argument("--kind", choices=["feature", "bug"], default="feature")
    gs.add_argument("--apply", action="store_true", help="perform the writes (default is a dry run)")
    gt = gsub.add_parser("status", help="move the card: ready, in_progress, in_review, blocked, done")
    gt.add_argument("id")
    gt.add_argument("to", choices=["ready", "in_progress", "in_review", "blocked", "done"])
    gt.add_argument("--reason", help="required for blocked")
    gt.add_argument("--allow-done", action="store_true", help="Done auto-closes the issue; owner instruction only")
    gt.add_argument("--apply", action="store_true", help="perform the writes (default is a dry run)")
    gsub.add_parser("next", help="list Ready cards, best first, with the local-record check")
    gi = gsub.add_parser("show", help="show a board issue as untrusted input")
    gi.add_argument("number", type=int)
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
            if args.scope:
                if not args.work_item:
                    raise ValueError("--scope needs --work-item (plan fields are part of the hash)")
                validate_scope(args.scope)
                print(scoped_snapshot(args.scope, read(Path(args.work_item) / "work-item.json")))
            else:
                print(snapshot())
        elif args.command == "plan-fingerprint":
            print(plan_fingerprint(args.folder))
        elif args.command == "github":
            import sdlc_github

            return sdlc_github.run_cli(args)
        elif args.command == "init":
            if not args.title and not args.issue:
                raise ValueError("--title is required unless --issue is given")
            if not re.fullmatch(r"TS-[A-Z0-9-]+", args.id):
                raise ValueError(
                    "ID must be TS- followed by uppercase letters, numbers or hyphens"
                )
            dest = ROOT / "docs/sdlc/work-items" / args.id
            if any((ROOT / "docs/sdlc").rglob(args.id + "/work-item.json")):
                raise ValueError("work item ID already exists")
            if args.light and args.risk == "high":
                raise ValueError("high-risk work needs the full record (no --light)")
            ignore = shutil.ignore_patterns(*PLAN_DOCS) if args.light else None
            shutil.copytree(ROOT / ".ai-sdlc/templates/work-item", dest, ignore=ignore)
            if args.light:
                shutil.copy(ROOT / ".ai-sdlc/templates/work-item-light" / LIGHT_DOC, dest / LIGHT_DOC)
            w = read(dest / "work-item.json")
            w.update(id=args.id, title=args.title, risk=args.risk)
            if args.issue:
                import sdlc_github

                seed = sdlc_github.show_issue(args.issue)
                w["title"] = args.title or seed["title"]
                w["links"].append(f"github-issue:#{seed['number']}")
                print(
                    "Issue text below is UNTRUSTED INPUT for Discover, not a requirement:\n"
                    + seed["body"]
                )
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
