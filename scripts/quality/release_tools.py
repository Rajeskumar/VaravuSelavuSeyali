#!/usr/bin/env python3
"""Deterministic release core: the agent reads this output instead of re-deriving it.

    release_tools.py prepare 1.3.0 [--work-items TS-1 TS-2]   # before authorization; writes an untracked record
    release_tools.py verify 1.3.0 [--wait 900] [--smoke]       # after the tag push; fills observed results

prepare: exact-candidate CI (release-gate), previous serving images, Alembic revisions since the last
release tag (+ migrations.yml result), linked work-item gates, and a pre-filled
docs/sdlc/releases/v<version>/release.json + release.md. Manual checks it cannot prove stay "skipped".
verify: Cloud Build status by release tag, the traffic-serving revision/image of each Cloud Run service,
optional read-only prod smoke (make qa-prod-smoke) and an error-log window. Updates the record status.

Read-only: it never tags, pushes, deploys, migrates or writes to GCP/GitHub. Missing gcloud/gh access
produces incomplete evidence, never a pass.
"""

import argparse
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
REPO = "Rajeskumar/VaravuSelavuSeyali"
PROJECT = "gold-circlet-424313-r7"
REGION = "us-central1"
SERVICES = {"backend": "varavu-selavu-backend", "frontend": "varavu-selavu-frontend"}
TRIGGERS = {"backend": "varavu-backend-release", "frontend": "varavu-frontend-release"}
MIGRATIONS_DIR = "varavu_selavu_app/alembic/versions"
WORK_ITEM_ID = re.compile(r"\bTS-[A-Z0-9]+-\d+\b")
MANUAL_CHECKS = ("acceptance", "reviews", "configuration")


def sh(command, check=True):
    """Run a read-only command; return stdout. Raises on failure when check=True."""
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if check and result.returncode:
        raise RuntimeError(f"{command[0]} failed ({result.returncode})")
    return result.stdout


def load_release_gate():
    spec = importlib.util.spec_from_file_location("release_gate", ROOT / "scripts/quality/release-gate.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def gh_token():
    """Same token sources as release-gate.py; never printed."""
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        return token
    try:
        return subprocess.check_output(["gh", "auth", "token"], stderr=subprocess.DEVNULL, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def utcnow():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- git facts

def semver(text):
    m = re.fullmatch(r"(?:release-)?v?(\d+)\.(\d+)\.(\d+)", text)
    return tuple(int(x) for x in m.groups()) if m else None


def previous_tag(version=None, run=sh):
    """Newest release tag strictly older than `version` (re-running prepare after tagging must not
    compare a release with itself)."""
    tags = [t for t in run(["git", "tag", "--list", "release-v*"]).split() if semver(t)]
    if version:
        tags = [t for t in tags if semver(t) < semver(version)]
    return max(tags, key=semver) if tags else None


MIGRATION_PATHS = (
    "varavu_selavu_app/alembic",  # versions, env.py, script template
    "varavu_selavu_app/alembic.ini",
    "varavu_selavu_app/varavu_selavu_service/db",
    "scripts/quality/migration-rehearsal.sh",
    ".github/workflows/migrations.yml",
)


def migrations_since(tag, sha, run=sh):
    """(added, changed): new revision files, and existing revisions modified/deleted/renamed."""
    if not tag:
        return [], []
    out = run(["git", "diff", "--name-status", "--diff-filter=AMDR", f"{tag}..{sha}", "--", MIGRATIONS_DIR])
    added, changed = [], []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) < 2 or not parts[-1].endswith(".py"):
            continue
        (added if parts[0] == "A" else changed).append(Path(parts[-1]).name)
    return added, changed


def commits_since(tag, sha, run=sh):
    spec = f"{tag}..{sha}" if tag else sha
    out = run(["git", "log", "--format=%h%x09%s", spec])
    return [line.split("\t", 1) for line in out.splitlines() if "\t" in line]


def linked_work_items(commits, explicit=None):
    found = set(explicit or [])
    for _, subject in commits:
        found.update(WORK_ITEM_ID.findall(subject))
    return sorted(found)


# ---------------------------------------------------------------- GCP facts (read-only)

def serving(service, run=sh):
    """Traffic-serving revisions of a Cloud Run service with their images."""
    svc = json.loads(
        run(["gcloud", "run", "services", "describe", service, f"--project={PROJECT}",
             f"--region={REGION}", "--format=json"])
    )
    revisions = []
    for entry in svc.get("status", {}).get("traffic", []):
        name = entry.get("revisionName")
        if not name or not entry.get("percent"):
            continue
        rev = json.loads(
            run(["gcloud", "run", "revisions", "describe", name, f"--project={PROJECT}",
                 f"--region={REGION}", "--format=json"])
        )
        containers = rev.get("spec", {}).get("containers") or [{}]
        revisions.append(
            {
                "revision": name,
                "percent": entry["percent"],
                "image": containers[0].get("image", ""),
                "digest": rev.get("status", {}).get("imageDigest", ""),
            }
        )
    return revisions


def builds_for_tag(tag, run=sh):
    out = run(["gcloud", "builds", "list", f"--project={PROJECT}",
               f"--filter=substitutions.TAG_NAME={tag}", "--format=json"])
    return json.loads(out or "[]")


def resolve_digest(image, run=sh):
    """Tag -> sha256 digest (Cloud Run revisions record the digest, not the tag). None if unknown."""
    try:
        out = run(["gcloud", "container", "images", "describe", image, "--format=value(image_summary.digest)"])
    except RuntimeError:
        return None
    digest = out.strip().splitlines()[-1] if out.strip() else ""
    return digest if digest.startswith("sha256:") else None


def builds_for_component(builds, name):
    """Newest first (gcloud's order); keep only the component's release trigger."""
    return [b for b in builds if (b.get("substitutions") or {}).get("TRIGGER_NAME") == TRIGGERS[name]]


def error_count(revisions, since, run=sh):
    names = " OR ".join(f'"{r}"' for r in revisions)
    query = (
        f'resource.type="cloud_run_revision" AND resource.labels.revision_name=({names}) '
        f'AND (severity>=ERROR OR httpRequest.status>=500) AND timestamp>="{since}"'
    )
    out = run(["gcloud", "logging", "read", query, f"--project={PROJECT}", "--limit=200", "--format=json"])
    return len(json.loads(out or "[]")), query


# ---------------------------------------------------------------- record building

def check(id, status, candidate, source):
    return {"id": id, "status": status, "candidate": candidate, "source": source}


def ci_checks(sha, gate=None, fetch=None, has_security=None):
    gate = gate or load_release_gate()
    fetch = fetch or (lambda wf: gate.fetch_runs(REPO, wf, sha, gh_token()))
    results = {}
    for wf, cid in (("unit.yml", "unit-ci"), ("qa.yml", "qa-ci"), ("framework.yml", "framework-ci")):
        try:
            ok, detail = gate.evaluate_runs(fetch(wf), sha)
        except (OSError, ValueError, KeyError, RuntimeError) as exc:
            ok, detail = None, f"evidence unavailable ({type(exc).__name__})"
        results[cid] = check(cid, "passed" if ok else ("failed" if ok is False else "skipped"), sha,
                             f"{wf}: {detail} (release-gate)")
    unit = results["unit-ci"]
    if (has_security(sha) if has_security else has_security_job(sha)):
        results["security"] = check(
            "security", unit["status"], sha,
            "unit.yml security job on the candidate: secret scan + dependency audits; Cloud Build re-audits",
        )
    else:
        results["security"] = check(
            "security", "skipped", sha,
            "unit.yml at this candidate has no security job: record pre-push/Cloud Build audit and secret-scan evidence",
        )
    return results


def has_security_job(sha, run=sh):
    """True when the candidate's own unit.yml runs the secret-scan/audit job (added by TS-SDLC-002)."""
    try:
        text = run(["git", "show", f"{sha}:.github/workflows/unit.yml"])
    except RuntimeError:
        return False
    return "secret_scan.py" in text and "make audit-all" in text


def fetch_branch_runs(workflow, token=None):
    """Recent main-branch runs of a workflow (read-only GitHub API; the token is never printed)."""
    import urllib.request

    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{workflow}/runs?branch=main&per_page=30"
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "trackspense-release-tools"}
    if token:
        headers["Authorization"] = "Bearer " + token
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
        return json.load(response)["workflow_runs"]


def rehearsal_run(sha, runs, run=sh):
    """Newest completed main-branch rehearsal on the candidate or an ancestor with no
    migration-relevant change after it. Returns the run or None."""
    for r in sorted(runs, key=lambda r: r.get("run_number", 0), reverse=True):
        if r.get("status") != "completed" or r.get("event") not in ("push", "workflow_dispatch"):
            continue
        if r.get("conclusion") in ("cancelled", "skipped", "stale"):
            continue  # not evidence either way; an older run may still cover the candidate
        head = r.get("head_sha", "")
        if not re.fullmatch(r"[0-9a-f]{40}", head):
            continue
        ancestor = subprocess.run(["git", "merge-base", "--is-ancestor", head, sha], cwd=ROOT).returncode == 0
        if not ancestor:
            continue
        unchanged = subprocess.run(["git", "diff", "--quiet", head, sha, "--", *MIGRATION_PATHS], cwd=ROOT).returncode == 0
        if unchanged:
            return r
    return None


def migration_check(sha, tag, added, changed=(), runs=None, find=rehearsal_run):
    cid = "migration-compatibility"
    if not tag:
        return check(cid, "skipped", sha, "No previous release tag: assess schema compatibility manually")
    if changed:
        return check(cid, "failed", sha,
                     f"Existing Alembic revision(s) modified/deleted since {tag}: {', '.join(changed)}. "
                     "Applied revisions must never change; add a new revision instead")
    if not added:
        return check(cid, "passed", sha, f"No new Alembic revisions since {tag}")
    summary = f"{len(added)} revision(s) since {tag}: {', '.join(added)}"
    try:
        runs = runs if runs is not None else fetch_branch_runs("migrations.yml", gh_token())
    except (OSError, ValueError, KeyError) as exc:
        return check(cid, "skipped", sha, f"{summary}; rehearsal evidence unavailable ({type(exc).__name__})")
    found = find(sha, runs)
    if not found:
        return check(cid, "skipped", sha,
                     f"{summary}; no rehearsal covers this candidate: run `gh workflow run migrations.yml --ref main` "
                     "(asks for approval) or record a local `make migration-rehearsal`")
    status = "passed" if found.get("conclusion") == "success" else "failed"
    return check(cid, status, sha, f"{summary}; migrations.yml {found.get('conclusion')} {found.get('html_url', '')}")


def component(name, sha, previous):
    short = sha[:7]
    prev = "; ".join(f"{r['image']} {r['digest']} (revision {r['revision']}, {r['percent']}%)" for r in previous)
    return {
        "name": name,
        "status": "pending",
        "expected_image": f"gcr.io/{PROJECT}/{SERVICES[name]}:{short}",
        "observed_image": "",
        "revision": "",
        "build_url": "",
        "previous_image": prev or "unknown (gcloud unavailable at prepare time)",
    }


def gate_verdicts(items):
    sys.path.insert(0, str(ROOT / "scripts/quality"))
    import sdlc

    current = sdlc.snapshot()
    verdicts = {}
    for item in items:
        matches = list((ROOT / "docs/sdlc").rglob(f"{item}/work-item.json"))
        if not matches:
            verdicts[item] = "NO_RECORD"
            continue
        try:
            verdicts[item] = sdlc.work_gate(matches[0].parent, "validate", current)["verdict"]
        except (ValueError, OSError) as exc:
            verdicts[item] = f"ERROR ({exc})"[:80]
    return verdicts


def build_record(version, sha, ci, migration, components, items, verdicts, unlinked, tag):
    all_pass = items and all(v in ("PASS", "PASS_WITH_APPROVED_WAIVERS") for v in verdicts.values())
    gates = ", ".join(f"{k} {v}" for k, v in verdicts.items()) or "no linked work items"
    checks = [ci["unit-ci"], ci["qa-ci"], ci["framework-ci"], ci["security"], migration]
    checks.append(check("acceptance", "passed" if all_pass else "skipped", sha, f"Work-item validate gates: {gates}"))
    reviews_ok = all_pass and not unlinked
    checks.append(check(
        "reviews", "passed" if reviews_ok else "skipped", sha,
        f"Work-item gates: {gates}; commits since {tag} without a work item: "
        + (", ".join(h for h, _ in unlinked[:12]) or "none")
        + (" — review them or record an approved waiver" if unlinked else ""),
    ))
    checks.append(check("configuration", "skipped", sha,
                        "Confirm secrets, flags and env for this release (manual; see release-checklist.md)"))
    previous_known = all(not c["previous_image"].startswith("unknown") for c in components)
    recovery_ok = previous_known and migration["status"] == "passed" and bool(tag)
    checks.append(check(
        "recovery", "passed" if recovery_ok and migration["source"].startswith("No new") else "skipped", sha,
        "Previous serving images recorded; rollback = redeploy them"
        + ("" if migration["source"].startswith("No new") else "; confirm the new revisions are backward compatible"),
    ))
    return {
        "schema_version": 1,
        "version": f"v{version}",
        "candidate": sha,
        "work_items": items,
        "status": "prepared",
        "authorization": None,
        "checks": checks,
        "components": components,
        "recovery_plan": "Redeploy the previous images listed per component; schema compatibility per the migration check.",
        "notes": f"Prepared by release_tools.py at {utcnow()}; previous release {tag or 'none'}.",
    }


def render_md(record):
    lines = [f"# Release {record['version']}", "", f"Candidate `{record['candidate']}` · status **{record['status']}**", "",
             "| Check | Status | Source |", "|---|---|---|"]
    lines += [f"| {c['id']} | {c['status']} | {c['source']} |" for c in record["checks"]]
    lines += ["", "| Component | Status | Expected | Observed | Revision | Previous |", "|---|---|---|---|---|---|"]
    lines += [f"| {c['name']} | {c['status']} | {c['expected_image']} | {c['observed_image']} | {c['revision']} | {c['previous_image']} |"
              for c in record["components"]]
    lines += ["", f"Work items: {', '.join(record['work_items']) or 'none'}", "", record["notes"], ""]
    return "\n".join(lines)


def summarize(record):
    for c in record["checks"]:
        print(f"{c['status'].upper():8s} {c['id']:24s} {c['source'][:140]}")
    for c in record["components"]:
        print(f"{c['status'].upper():8s} {c['name']:24s} expected {c['expected_image']} observed {c['observed_image'] or '-'}")
    open_items = [c["id"] for c in record["checks"] if c["status"] not in ("passed", "waived")]
    print("Open: " + (", ".join(open_items) or "none") + ". Then record authorization and run scripts/release.sh.")


# ---------------------------------------------------------------- commands

def docs_only(commit, run=sh):
    files = run(["git", "show", "--name-only", "--format=", commit]).split()
    return bool(files) and all(Path(f).suffix in (".md", ".txt", ".png", ".jpg", ".svg") for f in files)


def prepare(args):
    sha = args.sha or sh(["git", "rev-parse", "HEAD"]).strip()
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        print("--sha must be a full 40-character commit SHA", file=sys.stderr)
        return 2
    folder = ROOT / "docs/sdlc/releases" / f"v{args.version}"
    if (folder / "release.json").exists() and not args.force:
        print(f"{folder / 'release.json'} exists; use --force to regenerate", file=sys.stderr)
        return 2
    tag = previous_tag(args.version)
    commits = commits_since(tag, sha)
    items = linked_work_items(commits, args.work_items)
    unlinked = [(h, s) for h, s in commits if not WORK_ITEM_ID.search(s) and not docs_only(h)]
    ci = ci_checks(sha)
    migration = migration_check(sha, tag, *migrations_since(tag, sha))
    components = []
    for name, service in SERVICES.items():
        try:
            previous = serving(service)
        except (RuntimeError, ValueError, OSError):
            previous = []
        components.append(component(name, sha, previous))
    record = build_record(args.version, sha, ci, migration, components, items, gate_verdicts(items), unlinked, tag)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "release.json").write_text(json.dumps(record, indent=2) + "\n")
    (folder / "release.md").write_text(render_md(record))
    print(f"Wrote {folder.relative_to(ROOT)}/release.json (untracked until the release is recorded)")
    summarize(record)
    return 0 if all(c["status"] in ("passed", "waived") for c in record["checks"]) else 1


def evaluate_component(comp, revisions, builds, expected_digest=None):
    """Pure: update a component from observed serving revisions and builds.

    A revision matches when its image is the expected tag or the digest that tag resolved to.
    """
    comp = dict(comp)
    serving_images = [r["image"] for r in revisions]

    def matches(image):
        return image == comp["expected_image"] or bool(
            expected_digest and image.endswith("@" + expected_digest)
        )

    build = builds[0] if builds else None
    if build:
        comp["build_url"] = build.get("logUrl", "") or comp["build_url"]
    if build and build.get("status") in ("FAILURE", "INTERNAL_ERROR", "TIMEOUT", "CANCELLED", "EXPIRED"):
        comp["status"] = "failed"
    elif revisions and all(matches(img) for img in serving_images):
        comp.update(status="deployed", observed_image=comp["expected_image"],
                    revision=", ".join(r["revision"] for r in revisions)
                    + (f" ({expected_digest})" if expected_digest else ""))
    else:
        comp.update(status="pending", observed_image=", ".join(serving_images))
    return comp


def verify(args):
    path = ROOT / "docs/sdlc/releases" / f"v{args.version}" / "release.json"
    record = json.loads(path.read_text())
    tag = f"release-v{args.version}"
    deadline = time.monotonic() + args.wait
    started = (datetime.now(timezone.utc) - timedelta(minutes=args.window)).strftime("%Y-%m-%dT%H:%M:%SZ")
    while True:
        updated = []
        for comp in record["components"]:
            try:
                builds = builds_for_component(builds_for_tag(tag), comp["name"])
                digest = resolve_digest(comp["expected_image"])
                updated.append(evaluate_component(comp, serving(SERVICES[comp["name"]]), builds, digest))
            except (RuntimeError, ValueError, OSError) as exc:
                print(f"{comp['name']}: GCP evidence unavailable ({type(exc).__name__})")
                updated.append(comp)
        record["components"] = updated
        if all(c["status"] in ("deployed", "failed") for c in updated) or time.monotonic() >= deadline:
            break
        time.sleep(30)
    sha = record["candidate"]
    record["checks"] = [c for c in record["checks"] if c["id"] not in ("production-smoke", "production-errors")]
    if args.smoke:
        log = ROOT / ".sdlc-logs" / f"prod-smoke-{int(time.time())}.log"
        log.parent.mkdir(exist_ok=True)
        with open(log, "w") as handle:
            code = subprocess.run(["make", "qa-prod-smoke"], cwd=ROOT, stdout=handle, stderr=subprocess.STDOUT).returncode
        record["checks"].append(check("production-smoke", "passed" if code == 0 else "failed", sha,
                                      f"make qa-prod-smoke at {utcnow()} (read-only); log {log.relative_to(ROOT)}"))
    revisions = [r.split(" (")[0].strip() for c in record["components"] for r in c["revision"].split(",") if r.strip()]
    if revisions:
        try:
            count, query = error_count(revisions, started)
            status = "passed" if count <= args.max_errors else "failed"
            record["checks"].append(check("production-errors", status, sha,
                                          f"{count} error/5xx entries since {started} (max {args.max_errors}); query: {query}"))
        except (RuntimeError, ValueError, OSError) as exc:
            print(f"error window unavailable ({type(exc).__name__})")
    statuses = {c["status"] for c in record["components"]}
    checks_ok = {c["id"] for c in record["checks"] if c["status"] in ("passed", "waived")} >= {"production-smoke", "production-errors"}
    record["status"] = (
        "deployment_failed" if "failed" in statuses
        else "verified" if statuses == {"deployed"} and checks_ok
        else "verification_incomplete"
    )
    path.write_text(json.dumps(record, indent=2) + "\n")
    path.with_name("release.md").write_text(render_md(record))
    summarize(record)
    print(f"Release status: {record['status']}")
    return 0 if record["status"] == "verified" else 1


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)
    pr = sub.add_parser("prepare")
    pr.add_argument("version", help="semver without the v, e.g. 1.3.0")
    pr.add_argument("--sha")
    pr.add_argument("--work-items", nargs="*")
    pr.add_argument("--force", action="store_true")
    ve = sub.add_parser("verify")
    ve.add_argument("version")
    ve.add_argument("--wait", type=int, default=0, help="seconds to poll builds/revisions")
    ve.add_argument("--smoke", action="store_true", help="run the read-only prod smoke")
    ve.add_argument("--window", type=int, default=10, help="minutes of error logs to inspect")
    ve.add_argument("--max-errors", type=int, default=0)
    args = p.parse_args()
    if not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
        p.error("version must look like 1.3.0")
    return prepare(args) if args.command == "prepare" else verify(args)


if __name__ == "__main__":
    sys.exit(main())
