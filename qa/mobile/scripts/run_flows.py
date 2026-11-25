#!/usr/bin/env python3
"""Runs Maestro flows one at a time with isolation, login pacing and persisted-data checks (TS-QA-103).

    run_flows.py --platform ios|android --device ID --state FILE --suite smoke|regression|all
                 [--flow NAME] [--shuffle SEED] [--retries N] [--out DIR]

Per flow: a FRESH verified user and a fresh data label (no flow depends on another's output or order);
`# LOGINS: n` in the flow header declares how many real sign-ins it performs so the runner stays under the
backend's real 5/minute login limit (budget 4); after Maestro passes, an optional `<flow>.verify.py` checks the
persisted data through the API. A retry starts from a *fresh* user and label (never re-runs a financial write
against partially mutated state); the first failed attempt stays in the report, and a pass-on-retry is
reported as FLAKY, not as a clean pass. Exit code 1 if any flow ultimately fails.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import seed  # noqa: E402

FLOWS = HERE.parent / "flows"
LOGIN_BUDGET = 4  # backend allows 5/min; keep one in reserve
WINDOW = 62.0
FLOW_TIMEOUT = int(os.environ.get("E2E_FLOW_TIMEOUT", "600"))  # a hung flow must not burn the whole job timeout


def discover(suite: str, only: str | None, platform: str | None = None) -> list[Path]:
    # "regression" is the full suite: it includes the smoke flows (a main/nightly run must still exercise them).
    dirs = ["smoke"] if suite == "smoke" else ["smoke", "regression"]
    flows = sorted(p for d in dirs for p in (FLOWS / d).glob("*.yaml"))
    if only:
        flows = [p for p in flows if p.stem == only]
    if platform:
        flows = [p for p in flows if platform in declared_platforms(p)]
    return flows


def declared_platforms(flow: Path) -> set[str]:
    """`# PLATFORMS: ios, android` in the flow header; default both. A flow without an Android variant yet says `ios`."""
    m = re.search(r"^#\s*PLATFORMS:\s*(.+)$", flow.read_text(), re.M)
    if not m:
        return {"ios", "android"}
    return {p.strip().lower() for p in m.group(1).split(",")} & {"ios", "android"}


def skipped_entry(flow: Path, platform: str) -> dict:
    """A flow that is not declared for this platform. Reported as SKIPPED, never as a pass: it is not coverage."""
    return {"flow": f"{flow.parent.name}/{flow.stem}", "status": "skipped", "reason": f"not declared for {platform}", "attempts": []}


class DeviceGone(RuntimeError):
    """The emulator did not come back: abort the run (waiting 90 s per remaining flow would only hide the cause)."""


def ensure_device_online(device: str, timeout: int = 90, run=None, sleep=None) -> None:
    """adb can report a freshly booted or busy emulator as `offline` for a moment. Reconnect and wait; fail clearly as an
    infrastructure problem (not as a flow failure) if it does not come back."""
    run = run or subprocess.run
    sleep = sleep or time.sleep
    waited, state = 0, ""
    while True:
        state = run(["adb", "-s", device, "get-state"], capture_output=True, text=True, timeout=15).stdout.strip()
        if state == "device":
            return
        if waited >= timeout:
            raise DeviceGone(f"device {device} is '{state or 'unreachable'}' after {timeout}s (emulator/adb problem, not a flow failure)")
        run(["adb", "reconnect", "offline"], capture_output=True, text=True, timeout=15)
        sleep(2)
        waited += 2


MAX_INFRA_RETRIES = 2
DEVICE_LOSS = re.compile(r"device offline|device '[^']*' not found|no devices/emulators found|device unauthorized")


def device_lost(result: dict) -> bool:
    """True when the attempt died because adb lost the emulator (not because a flow assertion failed)."""
    if not result.get("dir"):  # an attempt that raised before Maestro ran has no log directory
        return False
    try:
        return bool(DEVICE_LOSS.search((Path(result["dir"]) / "maestro.log").read_text(errors="replace")))
    except OSError:
        return False


def not_run_entry(flow: Path, reason: str) -> dict:
    """A flow the run never reached (the emulator died). Never a pass, and it makes the run fail."""
    return {"flow": f"{flow.parent.name}/{flow.stem}", "status": "not_run", "reason": reason, "attempts": []}


def run_failed(summary: list[dict]) -> bool:
    return any(s["status"] in ("failed", "not_run") for s in summary)


def run_flow_attempts(args, state, flow: Path, out: Path, budget, run=None) -> tuple[list[dict], int]:
    """Run a flow, retrying from a FRESH fixture. `--retries` covers real flakes; a lost emulator is an infrastructure fault
    that does not consume one, is capped (MAX_INFRA_RETRIES) and is recorded on the attempt so it is never hidden."""
    run = run or run_attempt
    attempts: list[dict] = []
    try:
        return _attempt_loop(args, state, flow, out, budget, run, attempts)
    except DeviceGone as exc:
        # The run aborts, but what already ran stays on the record (main() reads these).
        exc.attempts = attempts
        exc.infra_retries = sum(1 for a in attempts if a.get("infra") == "device-lost")
        raise


def _attempt_loop(args, state, flow: Path, out: Path, budget, run, attempts: list[dict]) -> tuple[list[dict], int]:
    flow_retries_used = infra_retries = 0
    while True:
        attempt = len(attempts) + 1
        logins = declared_logins(flow)
        budget.reserve(logins)
        print(f"==> {flow.parent.name}/{flow.stem} (attempt {attempt})", flush=True)
        try:
            res = run(args, state, flow, out, attempt)
        except DeviceGone:
            raise
        except Exception as exc:  # noqa: BLE001 - one broken flow must not lose the results of the others
            res = {"attempt": attempt, "maestro_rc": None, "verify_rc": None, "seconds": 0.0, "passed": False,
                   "error": f"{type(exc).__name__}: {exc}"}
        budget.finished(logins)
        attempts.append(res)
        print(f"    {'PASS' if res['passed'] else 'FAIL'} in {res['seconds']}s", flush=True)
        if res["passed"]:
            break
        if args.platform == "android" and device_lost(res) and infra_retries < MAX_INFRA_RETRIES:
            res["infra"] = "device-lost"
            infra_retries += 1
            print(f"    emulator connection lost (infra retry {infra_retries}/{MAX_INFRA_RETRIES}); re-running from a fresh fixture", flush=True)
            ensure_device_online(args.device)  # raises DeviceGone: the run aborts
            continue
        if flow_retries_used < args.retries:
            flow_retries_used += 1
            continue
        break
    return attempts, infra_retries


def reset_proxy(state: dict) -> None:
    """Clear the fault proxy's armed faults and request log so each attempt counts only its own requests."""
    url = state.get("E2E_PROXY_CONTROL_URL")
    if not url:
        return
    import urllib.request

    req = urllib.request.Request(url + "/reset", data=b"{}", method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10):
        pass


def declared_logins(flow: Path) -> int:
    m = re.search(r"^#\s*LOGINS:\s*(\d+)", flow.read_text(), re.M)
    return int(m.group(1)) if m else 1


class LoginBudget:
    def __init__(self) -> None:
        self.stamps: list[float] = []

    def reserve(self, n: int) -> None:
        if n > LOGIN_BUDGET:
            raise SystemExit(f"a single flow declares {n} logins; the budget is {LOGIN_BUDGET}/minute")
        while True:
            now = time.monotonic()
            self.stamps = [t for t in self.stamps if now - t < WINDOW]
            if len(self.stamps) + n <= LOGIN_BUDGET:
                self.stamps += [now] * n  # at flow start, so the next flow waits for room
                return
            time.sleep(max(1.0, WINDOW - (now - min(self.stamps)) + 1.0))

    def finished(self, n: int) -> None:
        """The flow's real logins happened somewhere between its start and now; counting them at `now` is the
        conservative choice for everything that runs after it."""
        if n:
            del self.stamps[-n:]
            self.stamps += [time.monotonic()] * n


def run_attempt(args, state, flow: Path, out: Path, attempt: int) -> dict:
    slug = flow.stem
    reset_proxy(state)  # before the seeder and Maestro: an earlier flow or attempt must not leak into this one's counts
    user = seed.provision(state, slug)
    label = f"QA_E2E_{state['E2E_RUN_ID']}_{slug}_a{attempt}"
    env_vars = {"USER_EMAIL": user["email"], "USER_PASSWORD": user["password"], "RUN_LABEL": label,
                "E2E_STATE": args.state}
    if state.get("E2E_PROXY_CONTROL_URL"):
        env_vars["PROXY_CONTROL_URL"] = state["E2E_PROXY_CONTROL_URL"]  # flows arm faults through it (runScript)
    adir = out / f"{slug}-attempt{attempt}"
    adir.mkdir(parents=True, exist_ok=True)
    # Optional per-flow fixtures: <flow>.seed.py prints one JSON object of extra variables (e.g. GROUP_NAME).
    seeder = flow.with_suffix(".seed.py")
    if seeder.exists():
        done = subprocess.run([sys.executable, str(seeder)], env={**os.environ, **env_vars}, capture_output=True, text=True)
        (adir / "seed.log").write_text(done.stdout + done.stderr)
        if done.returncode != 0:
            return {"attempt": attempt, "maestro_rc": None, "verify_rc": None, "seconds": 0.0, "dir": str(adir),
                    "passed": False, "error": "seed failed"}
        lines = done.stdout.strip().splitlines()
        if not lines:
            return {"attempt": attempt, "maestro_rc": None, "verify_rc": None, "seconds": 0.0, "dir": str(adir),
                    "passed": False, "error": "seed printed nothing"}
        extra = json.loads(lines[-1])
        env_vars.update({k: str(v) for k, v in extra.items()})
    cmd = [shutil.which("maestro") or "maestro", "test", "--udid", args.device, "--format", "junit",
           "--output", str(adir / "junit.xml"), "--test-output-dir", str(adir), "--debug-output", str(adir / "debug")]
    for k, v in env_vars.items():
        if k != "E2E_STATE":  # the state file path is for the harness only
            cmd += ["-e", f"{k}={v}"]
    cmd.append(str(flow))
    if args.platform == "android":
        ensure_device_online(args.device)  # right before Maestro, after the (slow) seeding: the link can flap in between
    started = time.time()
    with (adir / "maestro.log").open("w") as log:
        # Own process group: on a timeout the whole tree (the maestro wrapper AND its JVM) is killed, so an orphan cannot
        # keep driving the device during the next flow.
        proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            try:
                rc = proc.wait(timeout=FLOW_TIMEOUT)
            except subprocess.TimeoutExpired:
                log.write(f"\n[run_flows] flow exceeded {FLOW_TIMEOUT}s and was stopped\n")
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    proc.kill()
                proc.wait()
                rc = 124
        except BaseException:
            # Ctrl-C / SIGTERM to the runner: Maestro runs in its own session, so it would otherwise keep driving the device.
            if proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    proc.kill()
            raise
    result = {"attempt": attempt, "maestro_rc": rc, "verify_rc": None, "seconds": round(time.time() - started, 1),
              "dir": str(adir)}
    verify = flow.with_suffix(".verify.py")
    if rc == 0 and verify.exists():
        v = subprocess.run([sys.executable, str(verify)], env={**os.environ, **env_vars}, capture_output=True, text=True)
        result["verify_rc"] = v.returncode
        (adir / "verify.log").write_text(v.stdout + v.stderr)
    result["passed"] = rc == 0 and result["verify_rc"] in (None, 0)
    return result


def write_summary(out: Path, args, state, summary: list) -> None:
    (out / "summary.json").write_text(json.dumps({"platform": args.platform, "run_id": state["E2E_RUN_ID"],
                                                  "flows": summary}, indent=2) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--platform", required=True, choices=["ios", "android"])
    ap.add_argument("--device", required=True)
    ap.add_argument("--state", required=True)
    ap.add_argument("--suite", default="smoke", choices=["smoke", "regression", "all"])
    ap.add_argument("--flow")
    ap.add_argument("--shuffle", type=int)
    ap.add_argument("--retries", type=int, default=0)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    # A plain SIGTERM (CI cancel, `kill`) must unwind like Ctrl-C so run_attempt can kill Maestro's process group.
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))

    state = seed.load_state(args.state)
    flows = discover(args.suite, args.flow, args.platform)
    skipped = [skipped_entry(p, args.platform) for p in discover(args.suite, args.flow) if p not in flows]
    if not flows:
        print("no flows matched", file=sys.stderr)
        return 1
    if args.shuffle is not None:
        random.Random(args.shuffle).shuffle(flows)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    budget = LoginBudget()
    summary = list(skipped)
    for s in skipped:
        print(f"==> {s['flow']}: SKIPPED ({s['reason']}); not counted as coverage", flush=True)
    for index, flow in enumerate(flows):
        try:
            attempts, infra_retries = run_flow_attempts(args, state, flow, out, budget)
        except DeviceGone as exc:
            print(f"==> {exc}; aborting the run", flush=True)
            real = list(getattr(exc, "attempts", []))
            real.append({"attempt": len(real) + 1, "passed": False, "error": str(exc), "seconds": 0.0, "infra": "device-gone"})
            summary.append({"flow": f"{flow.parent.name}/{flow.stem}", "status": "failed",
                            "infra_retries": getattr(exc, "infra_retries", 0), "attempts": real})
            summary += [not_run_entry(p, "emulator lost") for p in flows[index + 1:]]
            break
        status = "passed" if attempts[0]["passed"] else ("flaky" if attempts[-1]["passed"] else "failed")
        summary.append({"flow": f"{flow.parent.name}/{flow.stem}", "status": status, "infra_retries": infra_retries, "attempts": attempts})
        write_summary(out, args, state, summary)  # after every flow: a crash or job timeout keeps what already ran
    write_summary(out, args, state, summary)
    print("\nResults:")
    for s in summary:
        print(f"  {s['status'].upper():7} {s['flow']}")
    if any(s["status"] == "flaky" for s in summary):
        print("  (FLAKY = passed only on retry from a fresh fixture; the first-attempt failure is in the report)")
    return 1 if run_failed(summary) else 0


if __name__ == "__main__":
    sys.exit(main())
