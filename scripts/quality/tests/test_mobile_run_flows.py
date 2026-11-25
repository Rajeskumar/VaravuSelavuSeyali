"""Tests for qa/mobile/scripts/run_flows.py: flow discovery, declared logins and the login-rate pacing (TS-QA-103)."""
import importlib.util
import json
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[3] / "qa" / "mobile" / "scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("run_flows", SCRIPTS / "run_flows.py")
rf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rf)


class FakeClock:
    def __init__(self):
        self.now = 1000.0
        self.slept = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds


class LoginBudgetTests(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self._m, self._s = rf.time.monotonic, rf.time.sleep
        rf.time.monotonic, rf.time.sleep = self.clock.monotonic, self.clock.sleep

    def tearDown(self):
        rf.time.monotonic, rf.time.sleep = self._m, self._s

    def test_flows_within_the_budget_start_immediately(self):
        b = rf.LoginBudget()
        b.reserve(2)
        b.reserve(2)
        self.assertEqual(self.clock.slept, [])

    def test_the_fifth_login_in_a_minute_waits_for_the_window(self):
        b = rf.LoginBudget()
        b.reserve(2)
        b.reserve(2)
        b.reserve(1)  # would be login 5 of 5/min: the budget keeps one in reserve, so wait
        self.assertTrue(self.clock.slept)
        self.assertGreaterEqual(sum(self.clock.slept), rf.WINDOW - 1)

    def test_spacing_out_flows_never_waits(self):
        b = rf.LoginBudget()
        for _ in range(6):
            b.reserve(2)
            self.clock.now += 70
        self.assertEqual(self.clock.slept, [])

    def test_logins_of_a_long_flow_are_counted_at_its_end(self):
        b = rf.LoginBudget()
        b.reserve(2)               # flow starts at t=1000, takes 100 s, its real logins happened inside that window
        self.clock.now += 100
        b.finished(2)              # re-stamped at the end: they still count for the next minute
        b.reserve(2)               # 4 <= budget: fine
        b.reserve(1)               # would be the 5th within a minute of the first two: must wait
        self.assertTrue(self.clock.slept)

    def test_one_flow_cannot_exceed_the_budget(self):
        with self.assertRaises(SystemExit):
            rf.LoginBudget().reserve(rf.LOGIN_BUDGET + 1)


class DiscoveryTests(unittest.TestCase):
    def test_declared_logins_header_and_default(self):
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d) / "a.yaml", Path(d) / "b.yaml"
            a.write_text("# SCENARIO x\n# LOGINS: 3\nappId: x\n---\n")
            b.write_text("appId: x\n---\n")
            self.assertEqual(rf.declared_logins(a), 3)
            self.assertEqual(rf.declared_logins(b), 1)

    def test_every_shipped_flow_declares_a_login_count_within_budget(self):
        flows = rf.discover("all", None)
        self.assertTrue(flows)
        for flow in flows:
            with self.subTest(flow=flow.name):
                self.assertRegex(flow.read_text(), r"(?m)^#\s*LOGINS:\s*\d+")
                self.assertLessEqual(rf.declared_logins(flow), rf.LOGIN_BUDGET)

    def test_regression_suite_includes_the_smoke_flows(self):
        smoke = {p.stem for p in rf.discover("smoke", None)}
        self.assertTrue(smoke <= {p.stem for p in rf.discover("regression", None)})
        self.assertEqual({p.stem for p in rf.discover("all", None)}, {p.stem for p in rf.discover("regression", None)})

    def test_flow_filter_and_smoke_set(self):
        names = {p.stem for p in rf.discover("smoke", None)}
        self.assertTrue({"login-relaunch", "expense-create", "draft-recovery", "tabs-render", "group-expense"} <= names)
        self.assertEqual([p.stem for p in rf.discover("smoke", "tabs-render")], ["tabs-render"])
        self.assertEqual(rf.discover("smoke", "does-not-exist"), [])

    def test_every_flow_documents_its_scenario_contract(self):
        for flow in rf.discover("all", None):
            text = flow.read_text()
            with self.subTest(flow=flow.name):
                for marker in ("Preconditions", "Assertions", "Platforms"):
                    self.assertIn(marker, text)


class PlatformGating(unittest.TestCase):
    def write(self, d, name, header):
        p = Path(d) / name
        p.write_text(header + "appId: x\n---\n")
        return p

    def test_declared_platforms_default_to_both(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(rf.declared_platforms(self.write(d, "a.yaml", "# LOGINS: 1\n")), {"ios", "android"})
            self.assertEqual(rf.declared_platforms(self.write(d, "b.yaml", "# PLATFORMS: ios\n")), {"ios"})
            self.assertEqual(rf.declared_platforms(self.write(d, "c.yaml", "# Platforms: iOS, Android\n# PLATFORMS: ios, android\n")), {"ios", "android"})

    def test_discover_filters_by_platform_and_reports_what_was_skipped(self):
        every = rf.discover("all", None)
        ios = {p.stem for p in rf.discover("all", None, "ios")}
        android = {p.stem for p in rf.discover("all", None, "android")}
        for flow in every:  # the filter is exactly the declared header, for every shipped flow
            self.assertEqual(flow.stem in ios, "ios" in rf.declared_platforms(flow), flow.stem)
            self.assertEqual(flow.stem in android, "android" in rf.declared_platforms(flow), flow.stem)
        # The platform-specific flows: iOS asserts the parsed items (Apple Vision); on Android ML Kit's reading of the synthetic
        # receipt falls below the server's bar (F-015), so Android has its own flow for what it does prove.
        self.assertIn("receipt-import", ios)
        self.assertNotIn("receipt-import", android)
        self.assertIn("receipt-ocr-native-android", android)
        self.assertNotIn("receipt-ocr-native-android", ios)
        # Everything else (smoke + the other regression flows) runs on both platforms.
        self.assertTrue({"login-relaunch", "expense-create", "lost-save-response", "date-picker"} <= (ios & android))

    def test_a_platform_skip_is_never_reported_as_a_pass(self):
        entry = rf.skipped_entry(Path("flows/regression/date-picker.yaml"), "android")
        self.assertEqual(entry["status"], "skipped")
        self.assertEqual(entry["attempts"], [])


class ProxyHandling(unittest.TestCase):
    def test_the_proxy_is_reset_before_the_seeder_and_maestro_run_and_the_control_url_reaches_maestro(self):
        calls, args = [], mock.Mock(device="D", state="S", platform="ios")
        state = {"E2E_RUN_ID": "1", "E2E_PROXY_CONTROL_URL": "http://127.0.0.1:18082"}
        with tempfile.TemporaryDirectory() as d:
            flow = Path(d) / "f.yaml"
            flow.write_text("appId: x\n---\n")
            with mock.patch.object(rf, "reset_proxy", lambda s: calls.append("reset")), \
                    mock.patch.object(rf.seed, "provision", lambda s, n: {"email": "e@x", "password": "p"}), \
                    mock.patch.object(rf.subprocess, "Popen") as popen:
                popen.return_value.wait.side_effect = lambda *a, **k: calls.append("maestro") or 0
                popen.return_value.returncode = 0
                rf.run_attempt(args, state, flow, Path(d) / "out", 1)
            cmd = popen.call_args.args[0]
        self.assertEqual(calls[0], "reset")
        self.assertIn("PROXY_CONTROL_URL=http://127.0.0.1:18082", cmd)
        self.assertNotIn("E2E_STATE=S", " ".join(cmd))

    def test_reset_proxy_posts_json_to_the_control_api(self):
        seen = {}

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                seen["path"], seen["ct"] = self.path, self.headers.get("Content-Type")
                self.send_response(200)
                self.send_header("Content-Length", "2")
                self.end_headers()
                self.wfile.write(b"{}")

        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            rf.reset_proxy({"E2E_PROXY_CONTROL_URL": f"http://127.0.0.1:{srv.server_port}"})
        finally:
            srv.shutdown()
            srv.server_close()
        self.assertEqual(seen, {"path": "/reset", "ct": "application/json"})

    def test_reset_proxy_is_a_no_op_without_a_proxy(self):
        rf.reset_proxy({})  # states from older launchers have no control URL


class DeviceReadiness(unittest.TestCase):
    """A fresh emulator can drop adb to `offline` for a moment (seen on the first Android run: `device offline` at launchApp)."""

    def runner(self, states):
        calls = []

        def run(cmd, **kw):
            calls.append(cmd)
            out = ""
            if "get-state" in cmd:
                out = states.pop(0) if len(states) > 1 else states[0]
            return mock.Mock(returncode=0, stdout=out + "\n", stderr="")

        return run, calls

    def test_an_online_device_needs_no_reconnect(self):
        run, calls = self.runner(["device"])
        rf.ensure_device_online("emulator-5580", run=run, sleep=lambda s: None)
        self.assertFalse(any("reconnect" in c for c in calls))

    def test_an_offline_device_is_reconnected_and_waited_for(self):
        run, calls = self.runner(["offline", "offline", "device"])
        rf.ensure_device_online("emulator-5580", run=run, sleep=lambda s: None)
        self.assertTrue(any("reconnect" in c for c in calls))

    def test_a_device_that_never_returns_fails_clearly_as_infrastructure(self):
        run, _ = self.runner(["offline"])
        with self.assertRaises(RuntimeError) as cm:
            rf.ensure_device_online("emulator-5580", timeout=4, run=run, sleep=lambda s: None)
        self.assertIn("emulator-5580", str(cm.exception))

    def test_only_android_attempts_check_the_device(self):
        with mock.patch.object(rf, "ensure_device_online") as ensure, mock.patch.object(rf, "reset_proxy"), \
                mock.patch.object(rf.seed, "provision", lambda s, n: {"email": "e@x", "password": "p"}), \
                mock.patch.object(rf.subprocess, "Popen") as popen, tempfile.TemporaryDirectory() as d:
            popen.return_value.wait.return_value = 0
            popen.return_value.returncode = 0
            flow = Path(d) / "f.yaml"
            flow.write_text("appId: x\n---\n")
            state = {"E2E_RUN_ID": "1"}
            rf.run_attempt(mock.Mock(device="D", state="S", platform="ios"), state, flow, Path(d) / "o1", 1)
            ensure.assert_not_called()
            rf.run_attempt(mock.Mock(device="D", state="S", platform="android"), state, flow, Path(d) / "o2", 1)
            ensure.assert_called_once_with("D")


class InfraRetries(unittest.TestCase):
    """An emulator that drops off adb is an infrastructure fault: re-run from a fresh fixture, say so, never call it a pass."""

    def make(self, logs):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        flow = Path(d.name) / "f.yaml"
        flow.write_text("# LOGINS: 0\nappId: x\n---\n")
        out = Path(d.name)
        results = iter(logs)

        def run_attempt(args, state, flow_, out_, attempt):
            passed, text = next(results)
            adir = out / f"f-attempt{attempt}"
            adir.mkdir(parents=True, exist_ok=True)
            (adir / "maestro.log").write_text(text)
            return {"attempt": attempt, "passed": passed, "seconds": 1.0, "dir": str(adir)}

        budget = mock.Mock()
        return flow, out, run_attempt, budget

    def test_device_loss_is_recognised_only_for_adb_connectivity_errors(self):
        with tempfile.TemporaryDirectory() as d:
            for text, expected in [
                ("Command failed (host:transport:emulator-5580): device offline", True),
                ("IOException: Command failed (host:transport:emulator-5580): device 'emulator-5580' not found", True),
                ("Element not found: Id matching regex: login.submit", False),
                ("Assertion is false: id: login.email is visible", False),
            ]:
                p = Path(d) / "log"
                p.parent.mkdir(exist_ok=True)
                (Path(d) / "maestro.log").write_text(text)
                self.assertEqual(rf.device_lost({"dir": d}), expected, text)

    def test_a_lost_device_is_retried_without_using_a_flow_retry_and_is_reported(self):
        flow, out, run_attempt, budget = self.make([(False, "device offline"), (True, "")])
        args = mock.Mock(platform="android", device="D", retries=0)
        with mock.patch.object(rf, "ensure_device_online"):
            attempts, infra = rf.run_flow_attempts(args, {}, flow, out, budget, run_attempt)
        self.assertEqual([a["passed"] for a in attempts], [False, True])
        self.assertEqual(infra, 1)
        self.assertEqual(attempts[0]["infra"], "device-lost")

    def test_a_real_failure_is_not_retried_when_no_retries_are_configured(self):
        flow, out, run_attempt, budget = self.make([(False, "Element not found: Id matching regex: x"), (True, "")])
        args = mock.Mock(platform="android", device="D", retries=0)
        attempts, infra = rf.run_flow_attempts(args, {}, flow, out, budget, run_attempt)
        self.assertEqual(len(attempts), 1)
        self.assertEqual(infra, 0)

    def test_infra_retries_are_capped(self):
        flow, out, run_attempt, budget = self.make([(False, "device offline")] * 5)
        args = mock.Mock(platform="android", device="D", retries=0)
        with mock.patch.object(rf, "ensure_device_online"):
            attempts, infra = rf.run_flow_attempts(args, {}, flow, out, budget, run_attempt)
        self.assertEqual(len(attempts), rf.MAX_INFRA_RETRIES + 1)
        self.assertFalse(attempts[-1]["passed"])

    def test_ios_never_gets_infra_retries(self):
        flow, out, run_attempt, budget = self.make([(False, "device offline"), (True, "")])
        args = mock.Mock(platform="ios", device="D", retries=0)
        attempts, infra = rf.run_flow_attempts(args, {}, flow, out, budget, run_attempt)
        self.assertEqual((len(attempts), infra), (1, 0))


class RunnerRobustness(unittest.TestCase):
    def flow(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        flow = Path(d.name) / "f.yaml"
        flow.write_text("# LOGINS: 0\nappId: x\n---\n")
        return flow, Path(d.name)

    def test_an_attempt_that_raises_is_recorded_as_a_failed_attempt_not_a_crash(self):
        # Seen in review: the exception result had no "dir", and device_lost(res) raised KeyError, killing the whole run.
        flow, out = self.flow()

        def boom(*a, **k):
            raise RuntimeError("seed.provision failed")

        args = mock.Mock(platform="android", device="D", retries=0)
        attempts, infra = rf.run_flow_attempts(args, {}, flow, out, mock.Mock(), boom)
        self.assertEqual(len(attempts), 1)
        self.assertFalse(attempts[0]["passed"])
        self.assertIn("seed.provision failed", attempts[0]["error"])
        self.assertEqual(infra, 0)
        self.assertFalse(rf.device_lost({"attempt": 1, "passed": False}))

    def test_a_device_that_cannot_come_back_aborts_the_run_instead_of_waiting_90s_per_flow(self):
        flow, out = self.flow()

        def gone(*a, **k):
            raise rf.DeviceGone("device D is 'offline' after 90s")

        args = mock.Mock(platform="android", device="D", retries=0)
        with self.assertRaises(rf.DeviceGone):
            rf.run_flow_attempts(args, {}, flow, out, mock.Mock(), gone)

    def test_flows_that_never_ran_are_reported_not_run_and_never_as_passes(self):
        entry = rf.not_run_entry(Path("flows/smoke/tabs-render.yaml"), "device lost")
        self.assertEqual((entry["status"], entry["attempts"]), ("not_run", []))
        self.assertIn("device lost", entry["reason"])
        self.assertTrue(rf.run_failed([entry]))                       # a run with un-run flows is not green
        self.assertFalse(rf.run_failed([{"status": "passed"}, {"status": "skipped"}, {"status": "flaky"}]))
        self.assertTrue(rf.run_failed([{"status": "failed"}]))

    def test_interrupting_the_runner_kills_the_maestro_process_group(self):
        flow, out = self.flow()
        with mock.patch.object(rf, "reset_proxy"), mock.patch.object(rf, "ensure_device_online"), \
                mock.patch.object(rf.seed, "provision", lambda s, n: {"email": "e@x", "password": "p"}), \
                mock.patch.object(rf.subprocess, "Popen") as popen, mock.patch.object(rf.os, "killpg") as killpg:
            popen.return_value.pid = 4242
            popen.return_value.poll.return_value = None  # still running when the interrupt arrives
            popen.return_value.wait.side_effect = KeyboardInterrupt
            with self.assertRaises(KeyboardInterrupt):
                rf.run_attempt(mock.Mock(device="D", state="S", platform="ios"), {"E2E_RUN_ID": "1"}, flow, out / "o", 1)
        killpg.assert_called_once()
        self.assertEqual(killpg.call_args.args[0], 4242)


class DeviceGoneHandling(unittest.TestCase):
    def test_the_aborted_flow_keeps_the_attempts_that_really_ran(self):
        with tempfile.TemporaryDirectory() as d:
            flow = Path(d) / "f.yaml"
            flow.write_text("# LOGINS: 0\nappId: x\n---\n")
            (Path(d) / "f-attempt1").mkdir()
            (Path(d) / "f-attempt1" / "maestro.log").write_text("device offline")

            def run(args, state, flow_, out, attempt):
                return {"attempt": attempt, "passed": False, "seconds": 1.0, "dir": str(Path(d) / "f-attempt1")}

            args = mock.Mock(platform="android", device="D", retries=0)
            with mock.patch.object(rf, "ensure_device_online", side_effect=rf.DeviceGone("D is offline after 90s")):
                with self.assertRaises(rf.DeviceGone) as cm:
                    rf.run_flow_attempts(args, {}, flow, Path(d), mock.Mock(), run)
        self.assertEqual(len(cm.exception.attempts), 1)
        self.assertEqual(cm.exception.attempts[0]["infra"], "device-lost")
        self.assertEqual(cm.exception.infra_retries, 1)

    def test_main_aborts_the_run_records_the_rest_as_not_run_and_exits_non_zero(self):
        import signal

        flows = [Path("flows/smoke/a.yaml"), Path("flows/smoke/b.yaml"), Path("flows/smoke/c.yaml")]
        gone = rf.DeviceGone("device D is 'offline' after 90s")
        gone.attempts, gone.infra_retries = [{"attempt": 1, "passed": False, "seconds": 2.0, "infra": "device-lost"}], 1
        outcomes = iter([([{"attempt": 1, "passed": True, "seconds": 1.0}], 0), gone])

        def fake_attempts(*a, **k):
            outcome = next(outcomes)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        old_handler = signal.getsignal(signal.SIGTERM)
        with tempfile.TemporaryDirectory() as d, \
                mock.patch.object(rf.seed, "load_state", return_value={"E2E_RUN_ID": "1"}), \
                mock.patch.object(rf, "discover", return_value=flows), \
                mock.patch.object(rf, "run_flow_attempts", side_effect=fake_attempts), \
                mock.patch.object(sys, "argv", ["run_flows", "--platform", "android", "--device", "D", "--state", "S", "--out", d]):
            try:
                rc = rf.main()
                installed = signal.getsignal(signal.SIGTERM)
            finally:
                signal.signal(signal.SIGTERM, old_handler)
            summary = json.load(open(Path(d) / "summary.json"))["flows"]
        self.assertEqual(rc, 1)
        self.assertEqual([f["status"] for f in summary], ["passed", "failed", "not_run"])
        aborted = summary[1]
        self.assertEqual(aborted["infra_retries"], 1)
        self.assertEqual(aborted["attempts"][0]["infra"], "device-lost")   # the real attempt is kept
        self.assertEqual(aborted["attempts"][-1]["infra"], "device-gone")  # plus why the run stopped
        self.assertNotEqual(installed, old_handler)                         # SIGTERM is handled so Maestro is never orphaned


class ExpectProxyAllowAi(unittest.TestCase):
    LOG = [
        {"method": "POST", "path": "/api/v1/ingest/receipt/parse_ocr", "status": 200, "fault": None, "allow_ai": None},
        {"method": "POST", "path": "/api/v1/ingest/receipt/parse", "status": 200, "fault": None, "allow_ai": "false"},
    ]

    def check(self, **kw):
        with mock.patch.object(rf.seed, "proxy_log", lambda s: self.LOG):
            rf.seed.expect_proxy({}, "POST", kw.pop("path", "/api/v1/ingest/receipt/parse"), kw.pop("equals", None), None, **kw)

    def test_every_matching_request_must_carry_the_expected_allow_ai(self):
        self.check(at_most=1, allow_ai="false")
        with self.assertRaises(RuntimeError):
            self.check(at_most=1, allow_ai="true")

    def test_at_most_bounds_the_count_and_zero_matches_is_fine(self):
        self.check(path="/api/v1/ingest/receipt/other", at_most=0)
        with self.assertRaises(RuntimeError):
            self.check(at_most=0)

    def test_exactly_one_of_equals_or_at_most_is_required(self):
        with self.assertRaises(RuntimeError):
            self.check()
        with self.assertRaises(RuntimeError):
            self.check(equals=1, at_most=1)


class ExpectProxy(unittest.TestCase):
    LOG = [
        {"method": "POST", "path": "/api/v1/expenses", "status": 201, "fault": "drop_response"},
        {"method": "POST", "path": "/api/v1/expenses/categorize", "status": 200, "fault": None},
        {"method": "GET", "path": "/api/v1/expenses", "status": 200, "fault": None},
    ]

    def check(self, **kw):
        with mock.patch.object(rf.seed, "proxy_log", lambda s: self.LOG):
            rf.seed.expect_proxy({}, kw.get("method", "POST"), kw.get("path", "/api/v1/expenses"), kw.get("equals", 1), kw.get("faults"))

    def test_counts_exact_method_and_path_only(self):
        self.check()                                   # the categorize POST and the GET are not counted
        self.check(path="/api/v1/ingest/receipt/parse", equals=0)
        for bad in ({"equals": 0}, {"equals": 2}, {"method": "DELETE", "equals": 1}):
            with self.subTest(bad=bad):
                with self.assertRaises(RuntimeError):
                    self.check(**bad)

    def test_fault_counts_are_checked(self):
        self.check(faults=1)
        with self.assertRaises(RuntimeError):
            self.check(faults=0)
        with self.assertRaises(RuntimeError):
            self.check(faults=2)


if __name__ == "__main__":
    unittest.main()
