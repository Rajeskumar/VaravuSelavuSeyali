#!/usr/bin/env python3
"""Validate the AI SDLC setup: skills, Claude subagents, AGENTS.md/CLAUDE.md, symlinks and
referenced paths. Stdlib only (uses PyYAML for strict frontmatter parsing when installed).
    python3 scripts/quality/validate-ai-sdlc.py          exit 1 on any error
"""
import glob, os, re, sys

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

# ---- entry points
if not os.path.exists("AGENTS.md"): err("AGENTS.md missing")
else:
    a = open("AGENTS.md").read()
    for n in names:
        if f"`{n}`" not in a: err(f"AGENTS.md: skill `{n}` not in routing table")
    if len(a.encode()) > 32 * 1024: err("AGENTS.md exceeds Codex's 32 KiB default limit")
if os.path.exists("CLAUDE.md"):
    c = open("CLAUDE.md").read().strip()
    if c != "@AGENTS.md": warns.append("CLAUDE.md has content beyond the @AGENTS.md import — risk of duplicated/contradicting guidance")

# ---- referenced paths exist
prefixes = (".ai-sdlc/", ".agents/", ".claude/", "scripts/", "docs/", "qa/")
scan = glob.glob(".ai-sdlc/**/*.md", recursive=True) + skills + agent_files + ["AGENTS.md"]
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
