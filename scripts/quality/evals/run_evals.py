#!/usr/bin/env python3
"""Framework evaluations. Run after changing AGENTS.md, skills, agents, hooks or routing.

    run_evals.py                     deterministic routing expectations only (free; also in CI)
    run_evals.py --agent claude      + behavioral prompts via `claude -p` in plan (read-only) mode
    run_evals.py --agent codex       + behavioral prompts via `codex exec --sandbox read-only`
    run_evals.py --agent claude --only minor-ui

Behavioral runs cost tokens and are never automatic. Prompts run against the current working tree
(so uncommitted framework changes are what gets evaluated) in Claude plan mode / Codex read-only
sandbox, which cannot edit files; repo guard hooks stay active. Results (verdict hints, tokens, cost, duration)
go to .sdlc-logs/evals/<run>.json; append the summary row to .ai-sdlc/evaluations.md. A human scores
the transcript: expect_any/forbid are coarse hints, not proof of good behavior.
"""

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))
from routing import classify  # noqa: E402


def load(path=HERE / "scenarios.json"):
    return json.loads(Path(path).read_text())["scenarios"]


def routing_failures(scenario):
    expected = scenario["routing"]
    actual = classify(scenario["files"])
    problems = []
    for key in ("risk", "reviewers"):
        if actual[key] != expected[key]:
            problems.append(f"{key}: expected {expected[key]}, got {actual[key]}")
    for key in ("checks", "manual"):
        missing = set(expected.get(key, [])) - set(actual[key])
        if missing:
            problems.append(f"{key}: missing {sorted(missing)}")
    return problems


def run_agent(agent, prompt, cwd):
    if agent == "claude":
        cmd = ["claude", "-p", prompt, "--output-format", "json", "--permission-mode", "plan"]
    else:
        cmd = ["codex", "exec", "--sandbox", "read-only", prompt]
    started = time.monotonic()
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=900)
    seconds = round(time.monotonic() - started, 1)
    text, usage, cost = proc.stdout, {}, None
    if agent == "claude":
        try:
            data = json.loads(proc.stdout)
            text = data.get("result", "")
            usage = data.get("usage", {})
            cost = data.get("total_cost_usd")
        except ValueError:
            pass
    return {"exit": proc.returncode, "seconds": seconds, "text": text, "usage": usage, "cost_usd": cost}


def hints(scenario, text):
    low = text.lower()
    return {
        "expected_seen": any(e.lower() in low for e in scenario.get("expect_any", [])),
        "forbidden_seen": [f for f in scenario.get("forbid", []) if f.lower() in low],
    }


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--agent", choices=["claude", "codex"])
    p.add_argument("--only", nargs="*")
    args = p.parse_args()
    scenarios = [s for s in load() if not args.only or s["id"] in args.only]
    failed = 0
    for s in scenarios:
        problems = routing_failures(s)
        failed += bool(problems)
        print(f"{'FAIL' if problems else 'PASS'}  routing  {s['id']}" + (f"  {'; '.join(problems)}" if problems else ""))
    if not args.agent:
        return 1 if failed else 0
    if not shutil.which(args.agent):
        print(f"{args.agent} CLI not found; behavioral evals not run (INCOMPLETE_EVIDENCE)")
        return 2
    run_id = time.strftime("%Y%m%dT%H%M%S")
    results = []
    for s in scenarios:
        out = run_agent(args.agent, s["prompt"], ROOT)
        h = hints(s, out["text"])
        verdict = "REVIEW" if h["expected_seen"] and not h["forbidden_seen"] else "SUSPECT"
        print(f"{verdict:7s} {args.agent}  {s['id']}  {out['seconds']}s  cost={out['cost_usd']}  "
              f"forbidden={h['forbidden_seen']}")
        results.append({"id": s["id"], "verdict_hint": verdict, **h, **out})
    log = ROOT / ".sdlc-logs" / "evals" / f"{args.agent}-{run_id}.json"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(json.dumps({"agent": args.agent, "run": run_id, "results": results}, indent=2))
    print(f"Transcripts and metrics: {log.relative_to(ROOT)}. Score them and log a row in .ai-sdlc/evaluations.md.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
