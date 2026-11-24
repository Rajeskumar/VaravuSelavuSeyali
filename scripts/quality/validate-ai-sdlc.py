#!/usr/bin/env python3
"""Validate the AI SDLC setup: skills, Claude subagents, AGENTS.md/CLAUDE.md, symlinks and
referenced paths. Stdlib only (uses PyYAML for strict frontmatter parsing when installed).
    python3 scripts/quality/validate-ai-sdlc.py               exit 1 on any error
    python3 scripts/quality/validate-ai-sdlc.py --sync-codex  regenerate .codex/agents from .claude/agents
"""
import glob, json, os, re, sys

root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.chdir(root)
errors, warns = [], []
err = errors.append

try:
    import yaml  # type: ignore
except ImportError:
    yaml = None
    warns.append("PyYAML not installed — using the basic frontmatter check only")

def frontmatter(path):
    text = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        err(f"{path}: missing YAML frontmatter"); return {}, text
    raw = m.group(1)
    if yaml:
        try:
            data = yaml.safe_load(raw) or {}
        except Exception as e:  # noqa: BLE001
            err(f"{path}: invalid YAML frontmatter ({e})"); return {}, text
    else:
        data = {}
        for line in raw.splitlines():
            k, _, v = line.partition(":"); data[k.strip()] = v.strip()
            if re.search(r": ", v) and not v.startswith(('"', "'")):
                err(f"{path}: unquoted ': ' in {k.strip()} breaks YAML")
    return data, text

# ---- skills (shared source in .agents/skills, mirrored for Claude)
skills = sorted(glob.glob(".agents/skills/*/SKILL.md"))
if not skills: err("no skills found in .agents/skills")
names = []
for f in skills:
    d = os.path.basename(os.path.dirname(f))
    fm, _ = frontmatter(f)
    n, desc = fm.get("name"), fm.get("description")
    names.append(d)
    if n != d: err(f"{f}: name '{n}' must equal directory '{d}'")
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", d or ""): err(f"{f}: directory name must be lowercase-hyphen")
    if not desc or not isinstance(desc, str): err(f"{f}: description missing")
    elif len(desc) > 1024: err(f"{f}: description > 1024 chars")
    extra = set(fm) - {"name", "description"}
    if extra: err(f"{f}: unexpected frontmatter keys {sorted(extra)} (keep skills portable across Claude/Codex)")
    link = f".claude/skills/{d}"
    if not os.path.islink(link): err(f"{link}: expected symlink to ../../.agents/skills/{d}")
    elif not os.path.exists(os.path.join(link, "SKILL.md")): err(f"{link}: broken symlink")
for link in glob.glob(".claude/skills/*"):
    if os.path.basename(link) not in names: err(f"{link}: no matching .agents/skills entry")

# ---- Claude subagents
agent_files = sorted(glob.glob(".claude/agents/*.md"))
if not agent_files: err("no subagents in .claude/agents")
for f in agent_files:
    fm, text = frontmatter(f)
    base = os.path.basename(f)[:-3]
    if fm.get("name") != base: err(f"{f}: name must equal filename")
    if not fm.get("description"): err(f"{f}: description missing")
    if not fm.get("tools"): err(f"{f}: tools missing (keep reviewers read-only)")
    elif re.search(r"\b(Edit|Write|NotebookEdit)\b", str(fm["tools"])): err(f"{f}: reviewer must not have write tools")
    m = re.search(r"\.agents/skills/([a-z-]+)/SKILL\.md", text)
    if not m or m.group(1) not in names: err(f"{f}: must reference an existing skill")

# ---- Codex agents are generated from the Claude agents (one source of truth)
CODEX_NOTE = ("Codex note: Codex cannot sandbox a single subagent; run reviews in a read-only session "
              "(codex --sandbox read-only) and never edit files from this role.")

def codex_toml(md_path):
    fm, text = frontmatter(md_path)
    body = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S).strip()
    desc = " ".join(str(fm.get("description", "")).split())
    if "'''" in body or "'" in desc:
        err(f"{md_path}: body may not contain ''' and description may not contain a single quote (TOML literal strings)")
    # Literal strings: no escape processing, so backslashes and quotes in the prose stay intact.
    return (f"# Generated from {md_path} by validate-ai-sdlc.py --sync-codex. Do not edit.\n"
            f"name = '{fm.get('name')}'\ndescription = '{desc}'\n"
            f"developer_instructions = '''\n{body}\n\n{CODEX_NOTE}\n'''\n")

expected_codex = {f".codex/agents/{os.path.basename(f)[:-3]}.toml": codex_toml(f) for f in agent_files}
if "--sync-codex" in sys.argv:
    os.makedirs(".codex/agents", exist_ok=True)
    for old in glob.glob(".codex/agents/*.toml"):
        if old not in expected_codex: os.remove(old)
    for path, content in expected_codex.items():
        open(path, "w").write(content)
    print(f"synced {len(expected_codex)} Codex agents")
try:
    import tomllib
except ImportError:  # Python < 3.11
    tomllib = None
for path, content in expected_codex.items():
    if not os.path.exists(path) or open(path).read() != content:
        err(f"{path}: out of sync with .claude/agents (run validate-ai-sdlc.py --sync-codex)")
    elif tomllib:
        try:
            parsed = tomllib.loads(content)
            if not parsed.get("developer_instructions", "").strip(): err(f"{path}: empty developer_instructions")
        except tomllib.TOMLDecodeError as e:
            err(f"{path}: invalid TOML ({e})")
for path in glob.glob(".codex/agents/*.toml"):
    if path not in expected_codex: err(f"{path}: no matching .claude/agents file")

# ---- routing names map to real skills and agents
sys.path.insert(0, os.path.join(root, "scripts", "quality"))
try:
    import routing as _routing
    agent_names = {os.path.basename(f)[:-3] for f in agent_files}
    for reviewer, agent in _routing.REVIEWER_AGENT.items():
        if reviewer not in names: err(f"routing.py: reviewer skill '{reviewer}' does not exist")
        if agent not in agent_names: err(f"routing.py: reviewer agent '{agent}' does not exist")
except Exception as e:  # noqa: BLE001
    err(f"routing.py import failed: {e}")

# ---- hook configuration points at real scripts
for cfg in (".claude/settings.json", ".codex/hooks.json"):
    if not os.path.exists(cfg):
        err(f"{cfg}: missing (shared guardrail hooks)"); continue
    try:
        hooks = json.load(open(cfg)).get("hooks", {})
    except ValueError as e:
        err(f"{cfg}: invalid JSON ({e})"); continue
    commands = [h.get("command", "") for groups in hooks.values() for g in groups for h in g.get("hooks", [])]
    if not any("guard-bash.py" in c for c in commands): err(f"{cfg}: PreToolUse guard-bash.py hook missing")
    for c in commands:
        for script in re.findall(r"scripts/hooks/[\w.-]+", c):
            if not os.path.exists(script): err(f"{cfg}: hook script not found: {script}")

# ---- entry points
if not os.path.exists("AGENTS.md"): err("AGENTS.md missing")
else:
    a = open("AGENTS.md").read()
    for n in names:
        if f"`{n}`" not in a: err(f"AGENTS.md: skill `{n}` not in routing table")
    if len(a.encode()) > 32 * 1024: err("AGENTS.md exceeds Codex's 32 KiB default limit")
    # Loaded into every session and subagent of both tools: keep it short (area rules go nested).
    if len(a.encode()) > 9 * 1024: err(f"AGENTS.md is {len(a.encode())} bytes; budget is 9 KiB — move area rules to nested AGENTS.md")
if os.path.exists("CLAUDE.md"):
    c = open("CLAUDE.md").read().strip()
    if c != "@AGENTS.md": warns.append("CLAUDE.md has content beyond the @AGENTS.md import — risk of duplicated/contradicting guidance")

# Nested AGENTS.md (Codex reads them natively) need a sibling CLAUDE.md importing them for Claude.
for nested in glob.glob("*/AGENTS.md"):
    sibling = os.path.join(os.path.dirname(nested), "CLAUDE.md")
    if not os.path.exists(sibling) or open(sibling).read().strip() != "@AGENTS.md":
        err(f"{sibling}: must contain exactly '@AGENTS.md' so Claude loads {nested}")

# ---- portable entry points and phase references
for adapter in (".github/copilot-instructions.md", "GEMINI.md"):
    if not os.path.exists(adapter) or "AGENTS.md" not in open(adapter).read():
        err(f"{adapter}: must reference AGENTS.md")
for phase in ("discover", "plan", "build", "validate", "deploy"):
    if not os.path.exists(f".ai-sdlc/workflows/{phase}.md"):
        err(f"missing phase workflow: {phase}")

# ---- GitHub Project board mirror (optional integration, but its config must be coherent)
try:
    import json as _json
    cfg = _json.load(open(".ai-sdlc/github.json"))
    for key in ("owner", "repo", "project_owner", "project_number", "fields", "status", "labels"):
        if key not in cfg: err(f".ai-sdlc/github.json: missing '{key}'")
    for key in ("backlog", "ready", "in_progress", "in_review", "done"):
        if key not in cfg.get("status", {}): err(f".ai-sdlc/github.json: status map needs '{key}'")
    for key in ("sdlc", "blocked", "emergency", "bug", "feature"):
        if key not in cfg.get("labels", {}): err(f".ai-sdlc/github.json: labels need '{key}'")
    for f in (".ai-sdlc/workflows/plan.md", ".ai-sdlc/workflows/build.md", ".ai-sdlc/workflows/validate.md"):
        if "sdlc.py github" not in open(f).read(): err(f"{f}: must tell the agent when to use `sdlc.py github`")
except (OSError, ValueError) as e:
    err(f".ai-sdlc/github.json: {e}")

# ---- referenced paths exist
prefixes = (".ai-sdlc/", ".agents/", ".claude/", "scripts/", "docs/", "qa/")
scan = glob.glob(".ai-sdlc/**/*.md", recursive=True) + skills + agent_files + ["AGENTS.md"] + glob.glob("*/AGENTS.md")
for f in scan:
    for ref in re.findall(r"`([^`\s]+)`", open(f, encoding="utf-8").read()):
        ref = ref.rstrip(".,;:)").split("#")[0]
        if not ref.startswith(prefixes) or any(c in ref for c in "*<>[]{}|") or ref.endswith("/"): continue
        if not os.path.exists(ref): err(f"{f}: referenced path not found: {ref}")
# bare standards names used inside skills ("`security.md`")
for f in skills:
    for ref in re.findall(r"`([a-z]+\.md)`", open(f).read()):
        if not os.path.exists(f".ai-sdlc/standards/{ref}"): err(f"{f}: unknown standard {ref}")

for w in warns: print("warn:", w)
for e in errors: print("ERROR:", e)
print(f"skills={len(skills)} agents={len(agent_files)} errors={len(errors)} warnings={len(warns)}")
sys.exit(1 if errors else 0)
