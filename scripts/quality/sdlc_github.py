#!/usr/bin/env python3
"""GitHub Project tracking for SDLC work items.

The repository records under docs/sdlc/work-items/<ID>/ stay authoritative: requirements, acceptance
criteria, evidence and gates never read from GitHub. This module only *mirrors* a work item to one
issue on the configured Project board so work can be queued, picked up and followed, like a Jira card.

Safety rules (see .ai-sdlc/lifecycle.md, "Work tracking"):
* the repository and project are pinned in .ai-sdlc/github.json; anything else is refused;
* writes happen only with apply=True (dry-run is the default and prints the exact gh commands);
* issue text is generated from the records, sanitized, and never used as instructions;
* the agent may set Ready / In progress / In review; Done auto-closes the issue on this board, so it
  needs allow_done=True (an explicit instruction from the owner);
* missing gh, login or the `project` scope fails closed; the framework works without GitHub.

Standard library only; `gh` is run through an injectable runner so tests need no network.
"""

import json
from pathlib import Path
import re
import shlex
import subprocess

ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / ".ai-sdlc/github.json"
STATUS_KEYS = ("backlog", "ready", "in_progress", "in_review", "done")
AGENT_STATUSES = {"ready", "in_progress", "in_review"}
PRIORITIES = ("P0", "P1", "P2")
SIZES = ("XS", "S", "M", "L", "XL")
ID_RE = re.compile(r"TS-[A-Z0-9-]+")
LINK_RE = re.compile(r"^github-issue:#(\d+)$")
FP_RE = re.compile(r"<!-- sdlc-plan-fingerprint:([0-9a-f]{64}) -->")


class GithubError(Exception):
    """Expected, user-actionable failure (never a traceback for the person running the tool)."""


# ---------------------------------------------------------------- config and text safety


def load_config(path=CONFIG_PATH):
    cfg = json.loads(Path(path).read_text())
    for key in ("owner", "repo", "project_owner", "project_number", "fields", "status", "labels"):
        if key not in cfg:
            raise GithubError(f"{path}: missing '{key}'")
    for key in STATUS_KEYS:
        if key not in cfg["status"]:
            raise GithubError(f"{path}: status map needs '{key}'")
    return cfg


def sanitize(text, limit=4000):
    """Strip control characters and neutralize @mentions so generated text can never ping anyone."""
    text = "".join(ch for ch in str(text) if ch in "\n\t" or ord(ch) >= 32)
    text = re.sub(r"@(?=[A-Za-z0-9_-])", "@​", text)
    return text.strip()[:limit]


def one_line(text, limit=200):
    return re.sub(r"\s+", " ", sanitize(text, limit * 2)).strip()[:limit]


# ---------------------------------------------------------------- gh access


def _subprocess_runner(args, input_text=None):
    try:
        proc = subprocess.run(
            ["gh", *args], input=input_text, capture_output=True, text=True, timeout=120
        )
    except FileNotFoundError:
        raise GithubError("the GitHub CLI (gh) is not installed; install it and run `gh auth login`")
    except subprocess.TimeoutExpired:
        raise GithubError(f"gh {args[0]} timed out; check the outcome before retrying a write")
    return proc.returncode, proc.stdout, proc.stderr


class Gh:
    """Thin wrapper so tests can substitute a fake runner returning (returncode, stdout, stderr)."""

    def __init__(self, runner=None):
        self.runner = runner or _subprocess_runner
        self.log = []

    def raw(self, args, input_text=None):
        self.log.append(list(args))
        return self.runner(list(args), input_text)

    def __call__(self, args, input_text=None):
        code, out, err = self.raw(args, input_text)
        if code != 0:
            first = (err or out).strip().splitlines()[:1]
            raise GithubError(f"gh {' '.join(args[:2])} failed: {first[0] if first else 'no output'}")
        return out

    def json(self, args, input_text=None):
        out = self(args, input_text)
        try:
            return json.loads(out) if out.strip() else None
        except json.JSONDecodeError:
            raise GithubError(f"gh {' '.join(args[:2])} did not return JSON")


def preflight(gh, cfg):
    """Fail closed unless gh is logged in, has the project scope and targets the pinned repository."""
    code, out, err = gh.raw(["auth", "status"])
    text = f"{out}\n{err}"
    if code != 0:
        raise GithubError("gh is not logged in (run `gh auth login`)")
    scopes = re.search(r"Token scopes:(.*)", text)
    if scopes and "project" not in scopes.group(1):
        raise GithubError("the gh token lacks the 'project' scope (run `gh auth refresh -s project`)")
    repo = gh.json(["repo", "view", "--json", "nameWithOwner"])
    expected = f"{cfg['owner']}/{cfg['repo']}"
    if not repo or repo.get("nameWithOwner") != expected:
        raise GithubError(f"this checkout is not {expected}; refusing to touch another repository")


def repo_flag(cfg):
    return ["--repo", f"{cfg['owner']}/{cfg['repo']}"]


# ---------------------------------------------------------------- records


def _sdlc():
    import importlib.util

    spec = importlib.util.spec_from_file_location("sdlc", ROOT / "scripts/quality/sdlc.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def work_folder(work_id, root=ROOT):
    if not ID_RE.fullmatch(work_id):
        raise GithubError("work item ID must look like TS-EXAMPLE-001")
    for directory in ("work-items", "archive"):
        for path in (Path(root) / "docs/sdlc" / directory).rglob("work-item.json"):
            if path.parent.name == work_id:
                return path.parent
    raise GithubError(f"no record for {work_id} under docs/sdlc")


def parse_tasks(implementation_text):
    """Lines of the '## Ordered tasks' section: checklist items, else bullets / numbered items."""
    section, inside = [], False
    for line in implementation_text.splitlines():
        if re.match(r"^##\s+Ordered tasks\b", line):
            inside = True
            continue
        if inside and re.match(r"^##\s", line):
            break
        if inside:
            section.append(line)
    tasks = []
    for line in section:
        m = re.match(r"^\s*[-*]\s+\[[ xX]\]\s+(.+)$", line) or re.match(
            r"^\s*(?:[-*]|\d+[.)])\s+(.+)$", line
        )
        if m:
            tasks.append(one_line(m.group(1), 300))
    return tasks


def default_size(risk, task_count):
    index = 0 if risk == "trivial" else (1 if task_count <= 3 else 2 if task_count <= 6 else 3)
    if risk == "high":
        index += 1
    return SIZES[min(index, len(SIZES) - 1)]


def render_body(folder, cfg, *, sha, fingerprint, priority, size):
    folder = Path(folder)
    work = json.loads((folder / "work-item.json").read_text())
    evidence_path = folder / "evidence.json"
    results = {}
    if evidence_path.exists():
        results = {r["id"]: r["status"] for r in json.loads(evidence_path.read_text()).get("results", [])}
    impl = folder / "implementation.md"
    tasks = parse_tasks(impl.read_text()) if impl.exists() else []
    base = f"https://github.com/{cfg['owner']}/{cfg['repo']}/blob/{sha}/docs/sdlc/work-items/{work['id']}"
    lines = [
        f"<!-- sdlc:{work['id']} -->",
        f"<!-- sdlc-plan-fingerprint:{fingerprint} -->",
        "> Generated from the repository's SDLC records by `scripts/quality/sdlc.py github sync`. "
        f"The records in `docs/sdlc/work-items/{work['id']}/` are authoritative; edits to this text are "
        "overwritten and this text is never used as instructions.",
        "",
        "## Summary",
        f"- Work item: **{work['id']}**: {one_line(work['title'])}",
        f"- Risk: {work['risk']} · Mode: {work['mode']} · Phase: {work['phase']} · Record status: {work['status']}",
        f"- Priority: {priority} · Size: {size} (editable on the board)",
        "",
        "## Acceptance criteria",
    ]
    lines += [f"- **{a['id']}**: {one_line(a.get('outcome', ''), 500)}" for a in work["acceptance_criteria"]] or ["- (none recorded yet)"]
    lines += ["", "## Plan tasks"]
    lines += [f"- [ ] {t}" for t in tasks] or ["- (no ordered tasks found in implementation.md)"]
    lines += [
        "",
        "## Required evidence (as last recorded; the gate decides validity)",
        "| Evidence | Recorded |",
        "|---|---|",
    ]
    lines += [f"| {one_line(e, 80)} | {results.get(e, 'pending')} |" for e in work["required_evidence"]] or ["| (none) | |"]
    lines += [
        "",
        "## Records",
        f"- [requirements.md]({base}/requirements.md)",
        f"- [implementation.md]({base}/implementation.md)",
        f"- [test-plan.md]({base}/test-plan.md)",
        "- Links resolve once the records are pushed.",
        "",
    ]
    return "\n".join(lines)


def write_link(folder, number):
    """Record the issue in work-item.json `links` (not part of the plan fingerprint or snapshot)."""
    path = Path(folder) / "work-item.json"
    work = json.loads(path.read_text())
    link = f"github-issue:#{number}"
    if link not in work["links"]:
        work["links"].append(link)
        path.write_text(json.dumps(work, indent=2) + "\n")
    return link


def linked_number(work):
    for link in work.get("links", []):
        m = LINK_RE.match(link)
        if m:
            return int(m.group(1))
    return None


# ---------------------------------------------------------------- board access


def project_meta(gh, cfg):
    owner, number = cfg["project_owner"], str(cfg["project_number"])
    view = gh.json(["project", "view", number, "--owner", owner, "--format", "json"])
    fields = gh.json(["project", "field-list", number, "--owner", owner, "--format", "json", "--limit", "50"])
    by_name = {f["name"]: f for f in (fields or {}).get("fields", [])}
    missing = []
    for label, wanted in (
        ("status", list(cfg["status"].values())),
        ("priority", list(PRIORITIES)),
        ("size", list(SIZES)),
    ):
        field = by_name.get(cfg["fields"][label])
        if not field:
            missing.append(f"field '{cfg['fields'][label]}'")
            continue
        options = {o["name"] for o in field.get("options", [])}
        missing += [f"{cfg['fields'][label]} option '{w}'" for w in wanted if w not in options]
    if missing:
        raise GithubError("the board does not match .ai-sdlc/github.json: " + ", ".join(missing))
    return {"project_id": view["id"], "fields": by_name}


def option_id(meta, field_label, cfg, name):
    field = meta["fields"][cfg["fields"][field_label]]
    for option in field["options"]:
        if option["name"] == name:
            return field["id"], option["id"]
    raise GithubError(f"no {field_label} option '{name}'")


def set_field(gh, meta, cfg, item_id, field_label, name):
    field_id, opt_id = option_id(meta, field_label, cfg, name)
    gh([
        "project", "item-edit", "--id", item_id, "--project-id", meta["project_id"],
        "--field-id", field_id, "--single-select-option-id", opt_id,
    ])


def board_items(gh, cfg):
    data = gh.json([
        "project", "item-list", str(cfg["project_number"]), "--owner", cfg["project_owner"],
        "--limit", "200", "--format", "json",
    ])
    return (data or {}).get("items", [])


def find_item(items, cfg, number):
    repo = f"{cfg['owner']}/{cfg['repo']}"
    for item in items:
        content = item.get("content") or {}
        if content.get("number") == number and content.get("repository") == repo:
            return item
    return None


def find_issue(gh, cfg, work_id, work):
    number = linked_number(work)
    fields = "number,title,url,state,body,labels"
    if number:
        return gh.json(["issue", "view", str(number), *repo_flag(cfg), "--json", fields])
    found = gh.json(["issue", "list", *repo_flag(cfg), "--label", cfg["labels"]["sdlc"], "--state", "all",
                     "--limit", "200", "--json", fields]) or []
    marker = f"<!-- sdlc:{work_id} -->"
    for issue in found:
        if marker in (issue.get("body") or ""):
            return issue
    return None


def ensure_labels(gh, cfg, names, apply, actions):
    existing = {l["name"] for l in (gh.json(["label", "list", *repo_flag(cfg), "--limit", "100", "--json", "name"]) or [])}
    for name in names:
        if name in existing:
            continue
        cmd = ["label", "create", name, *repo_flag(cfg), "--description", "AI SDLC work tracking", "--color", "ededed"]
        actions.append(cmd)
        if apply:
            gh(cmd)


# ---------------------------------------------------------------- operations


def sync(work_id, *, apply=False, priority=None, size=None, kind="feature", gh=None, cfg=None,
         root=ROOT, sha=None):
    """Create or update the work item's issue and board card. Status is set to Ready only on create."""
    cfg = cfg or load_config()
    gh = gh or Gh()
    folder = work_folder(work_id, root)
    sdlc = _sdlc()
    gate = sdlc.work_gate(folder, "plan", "n/a")
    if gate["verdict"] not in ("PASS", "PASS_WITH_APPROVED_WAIVERS"):
        raise GithubError("the Plan gate is not passing, so there is nothing to queue yet: " + "; ".join(gate["missing"] + gate["blocking"]))
    work = json.loads((folder / "work-item.json").read_text())
    if work["mode"] == "emergency" and priority is None:
        priority = "P0"
    priority = priority or "P1"
    if priority not in PRIORITIES:
        raise GithubError(f"priority must be one of {PRIORITIES}")
    tasks = parse_tasks((folder / "implementation.md").read_text())
    size = size or default_size(work["risk"], len(tasks))
    if size not in SIZES:
        raise GithubError(f"size must be one of {SIZES}")
    fingerprint = sdlc.plan_fingerprint(folder)
    if sha is None:
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    body = render_body(folder, cfg, sha=sha, fingerprint=fingerprint, priority=priority, size=size)
    title = f"[{work['id']}] {one_line(work['title'])}"
    label_names = [cfg["labels"]["sdlc"], cfg["labels"]["bug" if kind == "bug" else "feature"]]
    if work["mode"] == "emergency":
        label_names.append(cfg["labels"]["emergency"])

    preflight(gh, cfg)
    meta = project_meta(gh, cfg)
    actions = []
    ensure_labels(gh, cfg, label_names, apply, actions)
    issue = find_issue(gh, cfg, work["id"], work)
    if issue:
        number = issue["number"]
        cmd = ["issue", "edit", str(number), *repo_flag(cfg), "--title", title, "--body-file", "-"]
        actions.append(cmd)
        if apply:
            gh(cmd, body)
        created = False
    else:
        cmd = ["issue", "create", *repo_flag(cfg), "--title", title, "--body-file", "-"]
        for name in label_names:
            cmd += ["--label", name]
        actions.append(cmd)
        number = None
        created = True
        if apply:
            url = gh(cmd, body).strip().splitlines()[-1]
            m = re.search(r"/issues/(\d+)$", url)
            if not m:
                raise GithubError(f"could not read the new issue number from: {url}")
            number = int(m.group(1))
    item = find_item(board_items(gh, cfg), cfg, number) if number else None
    if item is None:
        url = (issue or {}).get("url") or f"https://github.com/{cfg['owner']}/{cfg['repo']}/issues/{number or 'NEW'}"
        cmd = ["project", "item-add", str(cfg["project_number"]), "--owner", cfg["project_owner"], "--url", url, "--format", "json"]
        actions.append(cmd)
        item_id = gh.json(cmd)["id"] if apply else "<new item>"
    else:
        item_id = item["id"]
    wanted = [("priority", priority), ("size", size)] + ([("status", cfg["status"]["ready"])] if created or item is None else [])
    for label, name in wanted:
        field_id, opt = option_id(meta, label, cfg, name)
        cmd = ["project", "item-edit", "--id", item_id, "--project-id", meta["project_id"], "--field-id", field_id, "--single-select-option-id", opt]
        actions.append(cmd)
        if apply:
            gh(cmd)
    link = write_link(folder, number) if apply and number else None
    return {"applied": apply, "issue": number, "title": title, "created": created, "priority": priority,
            "size": size, "link_recorded": link, "commands": [shlex.join(["gh", *a]) for a in actions]}


def set_status(work_id, to, *, apply=False, allow_done=False, reason=None, gh=None, cfg=None, root=ROOT):
    cfg = cfg or load_config()
    gh = gh or Gh()
    if to != "blocked" and to not in STATUS_KEYS:
        raise GithubError(f"status must be one of {STATUS_KEYS + ('blocked',)}")
    if to == "done" and not allow_done:
        raise GithubError("Done auto-closes the issue on this board; it needs an explicit instruction (--allow-done)")
    if to not in AGENT_STATUSES and to not in ("blocked", "done"):
        raise GithubError(f"the agent does not set '{to}'; use the board")
    if to == "blocked" and not reason:
        raise GithubError("blocked needs a reason (--reason)")
    folder = work_folder(work_id, root)
    work = json.loads((folder / "work-item.json").read_text())
    preflight(gh, cfg)
    issue = find_issue(gh, cfg, work["id"], work)
    if not issue:
        raise GithubError(f"{work_id} has no issue yet; run `sdlc.py github sync {work_id} --apply` after the Plan gate")
    if to == "in_progress":
        current = _sdlc().plan_fingerprint(folder)
        m = FP_RE.search(issue.get("body") or "")
        if not m or m.group(1) != current:
            raise GithubError("the plan changed since the card was created (fingerprint mismatch); re-run sync after the plan is re-approved")
    meta = project_meta(gh, cfg)
    item = find_item(board_items(gh, cfg), cfg, issue["number"])
    if item is None:
        raise GithubError(f"issue #{issue['number']} is not on the board; run sync --apply")
    actions = []
    labels = {l["name"] for l in issue.get("labels", [])}
    blocked = cfg["labels"]["blocked"]
    if to == "blocked":
        cmds = [["issue", "edit", str(issue["number"]), *repo_flag(cfg), "--add-label", blocked],
                ["issue", "comment", str(issue["number"]), *repo_flag(cfg), "--body", f"Blocked: {one_line(reason, 500)}"]]
        actions += cmds
        if apply:
            ensure_labels(gh, cfg, [blocked], True, [])
            for c in cmds:
                gh(c)
    else:
        field_id, opt = option_id(meta, "status", cfg, cfg["status"][to])
        cmd = ["project", "item-edit", "--id", item["id"], "--project-id", meta["project_id"], "--field-id", field_id, "--single-select-option-id", opt]
        actions.append(cmd)
        if apply:
            gh(cmd)
        if blocked in labels:
            rm = ["issue", "edit", str(issue["number"]), *repo_flag(cfg), "--remove-label", blocked]
            actions.append(rm)
            if apply:
                gh(rm)
    return {"applied": apply, "issue": issue["number"], "status": to, "commands": [shlex.join(["gh", *a]) for a in actions]}


def next_ready(*, gh=None, cfg=None, root=ROOT):
    """Ready cards, best first (Priority, then board order), with the local-record check for each."""
    cfg = cfg or load_config()
    gh = gh or Gh()
    preflight(gh, cfg)
    repo = f"{cfg['owner']}/{cfg['repo']}"
    rank = {p: i for i, p in enumerate(PRIORITIES)}
    ready = cfg["status"]["ready"]
    rows = []
    for index, item in enumerate(board_items(gh, cfg)):
        content = item.get("content") or {}
        if content.get("repository") != repo or item.get("status") != ready:
            continue
        title = content.get("title", "")
        m = re.match(r"^\[(TS-[A-Z0-9-]+)\]", title)
        work_id = m.group(1) if m else None
        state = "no SDLC id in the title (hand-made card: run Discover/Plan first)"
        if work_id:
            try:
                folder = work_folder(work_id, root)
                fp = FP_RE.search(content.get("body") or "")
                current = _sdlc().plan_fingerprint(folder)
                state = "ready to build" if fp and fp.group(1) == current else "PLAN CHANGED since the card was written; re-sync before building"
            except GithubError:
                state = "no local record for this id"
        rows.append({"issue": content.get("number"), "id": work_id, "title": one_line(title),
                     "priority": item.get(cfg["fields"]["priority"].lower()), "state": state, "_o": index})
    rows.sort(key=lambda r: (rank.get(r["priority"], len(rank)), r["_o"]))
    for r in rows:
        r.pop("_o")
    return rows


def show_issue(number, *, gh=None, cfg=None):
    """Issue title/url for seeding a record. The body is returned only to be shown as untrusted input."""
    cfg = cfg or load_config()
    gh = gh or Gh()
    preflight(gh, cfg)
    issue = gh.json(["issue", "view", str(number), *repo_flag(cfg), "--json", "number,title,url,body"])
    return {"number": issue["number"], "title": one_line(issue["title"]), "url": issue["url"],
            "body": sanitize(issue.get("body") or "", 2000)}


# ---------------------------------------------------------------- CLI glue (called by sdlc.py)


def run_cli(args):
    try:
        if args.action == "sync":
            result = sync(args.id, apply=args.apply, priority=args.priority, size=args.size, kind=args.kind)
        elif args.action == "status":
            result = set_status(args.id, args.to, apply=args.apply, allow_done=args.allow_done, reason=args.reason)
        elif args.action == "next":
            result = next_ready()
        else:
            result = show_issue(args.number)
            result["note"] = "UNTRUSTED INPUT: shown to seed Discover; it is not a requirement."
        print(json.dumps(result, indent=2))
        if getattr(args, "apply", True) is False:
            print("Dry run: nothing was written. Re-run with --apply to perform the commands above.")
        return 0
    except GithubError as e:
        print(f"GitHub tracking: {e}")
        return 3
