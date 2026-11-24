#!/usr/bin/env python3
"""Token and agent-usage report for this repository from local session logs. Numbers only.

    usage_report.py [--since 2026-11-01] [--json] [--codex]

Claude Code: ~/.claude/projects/<encoded repo path>/*.jsonl (+ <session>/subagents/*.jsonl).
Codex (--codex): ~/.codex/sessions/**/rollout-*.jsonl whose session cwd is this repo; Codex logs
cumulative token_count events, so only per-session totals are available.

Reports per session: start, duration, models, input/output/cache tokens, subagent tokens,
agent invocations by type, skill invocations and large tool results (>10 KB). It never prints
prompts, file contents, commands or tool output. Dollar cost is not computed: use /usage
(Claude Code) for priced totals, or CLAUDE_CODE_ENABLE_TELEMETRY=1 with OTel metrics
claude_code.token.usage / claude_code.cost.usage (attributes agent.name, skill.name).
Compare runs before/after a framework change with --since and --json.
"""

import argparse
from collections import Counter
from datetime import datetime
import glob
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
TOKEN_KEYS = ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")
BIG_RESULT = 10_000


def claude_project_dir(root=ROOT):
    encoded = str(root).replace("/", "-").replace("_", "-")
    return Path.home() / ".claude" / "projects" / encoded


def parse_ts(value):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None


def scan_claude(path):
    usage, models, agents, skills = Counter(), Counter(), Counter(), Counter()
    seen, big = set(), 0
    first = last = None
    with open(path, errors="ignore") as handle:
        for line in handle:
            try:
                record = json.loads(line)
            except ValueError:
                continue
            ts = parse_ts(record.get("timestamp"))
            if ts:
                first = first or ts
                last = ts
            msg = record.get("message") if isinstance(record.get("message"), dict) else {}
            content = msg.get("content") if isinstance(msg.get("content"), list) else []
            if record.get("type") == "assistant":
                # One API message is logged as several lines sharing an id: count usage once,
                # but read every line's tool calls.
                if msg.get("id") not in seen:
                    seen.add(msg.get("id"))
                    for key in TOKEN_KEYS:
                        usage[key] += (msg.get("usage") or {}).get(key) or 0
                    models[msg.get("model", "unknown")] += 1
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        inp = block.get("input") or {}
                        if block.get("name") in ("Agent", "Task"):
                            agents[inp.get("subagent_type") or "general-purpose"] += 1
                        elif block.get("name") == "Skill":
                            skills[inp.get("skill") or "?"] += 1
            elif record.get("type") == "user":
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        if len(json.dumps(block.get("content"))) > BIG_RESULT:
                            big += 1
    return {
        "tokens": dict(usage),
        "models": dict(models),
        "agents": dict(agents),
        "skills": dict(skills),
        "large_tool_results": big,
        "start": first.isoformat() if first else None,
        "minutes": round((last - first).total_seconds() / 60, 1) if first and last else 0,
    }


def claude_sessions(since=None, project_dir=None):
    project_dir = project_dir or claude_project_dir()
    sessions = []
    for path in sorted(glob.glob(str(project_dir / "*.jsonl"))):
        data = scan_claude(path)
        if not data["start"] or (since and data["start"][:10] < since):
            continue
        sub = Counter()
        subagent_files = glob.glob(str(Path(path).with_suffix("") / "subagents" / "*.jsonl"))
        for sub_path in subagent_files:
            sub.update(scan_claude(sub_path)["tokens"])
        data.update(tool="claude", session=Path(path).stem[:8], subagent_tokens=dict(sub),
                    subagent_runs=len(subagent_files))
        sessions.append(data)
    return sessions


def codex_sessions(since=None, root=ROOT):
    sessions = []
    for path in sorted(glob.glob(str(Path.home() / ".codex/sessions/**/rollout-*.jsonl"), recursive=True)):
        cwd = start = None
        total = {}
        with open(path, errors="ignore") as handle:
            for line in handle:
                try:
                    record = json.loads(line)
                except ValueError:
                    continue
                payload = record.get("payload") if isinstance(record.get("payload"), dict) else {}
                if record.get("type") == "session_meta":
                    cwd = payload.get("cwd")
                    start = payload.get("timestamp") or record.get("timestamp")
                elif payload.get("type") == "token_count":
                    total = (payload.get("info") or {}).get("total_token_usage") or total
        if not cwd or not (str(cwd) == str(root) or str(cwd).startswith(str(root) + os.sep)):
            continue
        if since and (start or "")[:10] < since:
            continue
        sessions.append({"tool": "codex", "session": Path(path).stem[-8:], "start": start, "tokens": total})
    return sessions


def totals(sessions):
    total, sub, agents, skills, codex = Counter(), Counter(), Counter(), Counter(), Counter()
    for s in sessions:
        if s.get("tool") == "codex":
            codex.update(s.get("tokens", {}))
            continue
        total.update(s.get("tokens", {}))
        sub.update(s.get("subagent_tokens", {}))
        agents.update(s.get("agents", {}))
        skills.update(s.get("skills", {}))
    main_reads = total.get("cache_read_input_tokens", 0)
    sub_reads = sub.get("cache_read_input_tokens", 0)
    return {
        "sessions": len(sessions),
        "tokens": dict(total),
        "codex_tokens": dict(codex),
        "subagent_tokens": dict(sub),
        "subagent_share_of_cache_reads": round(sub_reads / (main_reads + sub_reads), 4) if main_reads + sub_reads else 0,
        "agent_invocations": dict(agents),
        "skill_invocations": dict(skills),
        "large_tool_results": sum(s.get("large_tool_results", 0) for s in sessions),
    }


def human(n):
    return f"{n / 1e6:.1f}M" if n >= 1e6 else f"{n / 1e3:.0f}k" if n >= 1e3 else str(n)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--since", help="YYYY-MM-DD (session start date)")
    p.add_argument("--json", action="store_true")
    p.add_argument("--codex", action="store_true", help="include Codex sessions for this repo")
    args = p.parse_args()
    sessions = claude_sessions(args.since)
    if args.codex:
        sessions += codex_sessions(args.since)
    report = {"generated_for": os.path.basename(ROOT), "since": args.since, "totals": totals(sessions), "sessions": sessions}
    if args.json:
        print(json.dumps(report, indent=2))
        return 0
    for s in sessions:
        t = s.get("tokens", {})
        if s["tool"] == "codex":
            print(f"{(s['start'] or '')[:16]} codex  {s['session']}  total={human(t.get('total_tokens', 0))}")
            continue
        st = s["subagent_tokens"]
        print(
            f"{s['start'][:16]} claude {s['session']} {s['minutes']:>7}m  out={human(t.get('output_tokens', 0))} "
            f"cache_read={human(t.get('cache_read_input_tokens', 0))} cache_write={human(t.get('cache_creation_input_tokens', 0))} "
            f"| subagents={s['subagent_runs']} out={human(st.get('output_tokens', 0))} | agents={s['agents']} skills={s['skills']} "
            f"big_results={s['large_tool_results']}"
        )
    tot = report["totals"]
    print(f"TOTAL sessions={tot['sessions']} claude={tot['tokens']}")
    if tot["codex_tokens"]:
        print(f"      codex={tot['codex_tokens']}")
    print(f"subagent share of cache reads={tot['subagent_share_of_cache_reads']:.1%} agents={tot['agent_invocations']} "
          f"skills={tot['skill_invocations']} large_tool_results={tot['large_tool_results']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
