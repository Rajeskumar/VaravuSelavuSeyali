import importlib.util
import io
from contextlib import redirect_stdout
from pathlib import Path
import sys
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location(
    "release_gate", Path(__file__).resolve().parents[1] / "release-gate.py"
)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class ReleaseGateTests(unittest.TestCase):
    def run_record(self, **changes):
        value = {
            "head_sha": "a" * 40,
            "head_branch": "main",
            "event": "push",
            "run_number": 1,
            "run_attempt": 1,
            "id": 1,
            "status": "completed",
            "conclusion": "success",
            "html_url": "https://github.com/run/1",
        }
        value.update(changes)
        return value

    def test_exact_candidate_main_evidence(self):
        for runs in [
            [],
            [self.run_record(head_sha="b" * 40)],
            [self.run_record(event="pull_request")],
            [self.run_record(head_branch="feature")],
            [self.run_record(conclusion="skipped")],
        ]:
            self.assertFalse(gate.evaluate_runs(runs, "a" * 40)[0])
        self.assertTrue(gate.evaluate_runs([self.run_record()], "a" * 40)[0])

    def test_latest_pending_failure_or_rerun_overrides_old_pass(self):
        for changes in [
            {"run_number": 2, "status": "in_progress", "conclusion": None},
            {"run_number": 2, "conclusion": "failure"},
            {"run_attempt": 2, "conclusion": "failure"},
        ]:
            self.assertFalse(
                gate.evaluate_runs(
                    [self.run_record(), self.run_record(**changes)], "a" * 40
                )[0]
            )

    def test_all_required_workflows(self):
        self.assertEqual(set(gate.WORKFLOWS), {"unit.yml", "qa.yml", "framework.yml"})


class NativeMobileJobEvidenceTests(unittest.TestCase):
    """TS-QA-103 AC-007: a green mobile-e2e run is only release evidence if BOTH platforms passed the REGRESSION suite."""

    def job(self, name, conclusion="success", status="completed"):
        return {"name": name, "status": status, "conclusion": conclusion}

    def both(self, **over):
        jobs = {"ios (regression)": "success", "android (regression)": "success"}
        jobs.update(over)
        return [self.job(n, c) for n, c in jobs.items() if c is not None]

    def check(self, jobs):
        return gate.evaluate_jobs(jobs, gate.MOBILE_E2E_REQUIRED_JOBS)

    def test_both_platforms_regression_passed(self):
        self.assertTrue(self.check(self.both())[0])

    def test_smoke_only_run_is_rejected(self):
        jobs = [self.job("ios (smoke)"), self.job("android (smoke)")]
        ok, detail = self.check(jobs)
        self.assertFalse(ok)
        self.assertIn("ios (regression)", detail)

    def test_one_platform_missing_or_not_successful_is_rejected(self):
        for over in ({"ios (regression)": None}, {"android (regression)": None},
                     {"ios (regression)": "failure"}, {"android (regression)": "cancelled"},
                     {"ios (regression)": "skipped"}, {"android (regression)": "timed_out"}):
            with self.subTest(over=over):
                self.assertFalse(self.check(self.both(**over))[0])

    def test_pending_job_is_rejected(self):
        jobs = [self.job("ios (regression)"), self.job("android (regression)", conclusion=None, status="in_progress")]
        self.assertFalse(self.check(jobs)[0])

    def test_empty_job_list_is_rejected(self):
        self.assertFalse(self.check([])[0])

    def test_a_failed_duplicate_of_a_required_job_is_rejected(self):
        jobs = self.both() + [self.job("ios (regression)", "failure")]
        self.assertFalse(self.check(jobs)[0])

    def test_required_jobs_are_exactly_ios_and_android_regression(self):
        self.assertEqual(set(gate.MOBILE_E2E_REQUIRED_JOBS), {"ios (regression)", "android (regression)"})

    def test_schedule_only_evidence_is_not_eligible(self):
        run = {"head_sha": "a" * 40, "head_branch": "main", "event": "schedule", "run_number": 1, "run_attempt": 1,
               "id": 1, "status": "completed", "conclusion": "success", "html_url": "u"}
        self.assertIsNone(gate.select_run([run], "a" * 40))

    def test_select_run_returns_the_latest_eligible_run(self):
        base = {"head_sha": "a" * 40, "head_branch": "main", "event": "push", "run_attempt": 1, "status": "completed",
                "conclusion": "success", "html_url": "u"}
        old, new = dict(base, id=1, run_number=1), dict(base, id=2, run_number=2, conclusion="failure")
        self.assertEqual(gate.select_run([old, new], "a" * 40)["id"], 2)

    def test_mobile_workflow_is_not_yet_required_until_promotion(self):
        # Flip ENFORCE_MOBILE_E2E (and update this test) in the promotion change, after the criteria in TS-QA-103 are met.
        self.assertFalse(gate.ENFORCE_MOBILE_E2E)
        self.assertEqual(set(gate.WORKFLOWS), {"unit.yml", "qa.yml", "framework.yml"})


class NativeMobileMainGlueTests(unittest.TestCase):
    """main(): mobile-e2e.yml is only consulted when enforced, and then needs BOTH regression jobs of the chosen run."""

    SHA = "a" * 40

    def run_record(self):
        return {"head_sha": self.SHA, "head_branch": "main", "event": "push", "run_number": 1, "run_attempt": 1,
                "id": 77, "status": "completed", "conclusion": "success", "html_url": "https://github.com/run/77"}

    def drive(self, argv, jobs):
        called = []

        def fake_runs(repo, workflow, sha, token):
            called.append(workflow)
            return [self.run_record()]

        out = io.StringIO()
        with mock.patch.object(gate, "fetch_runs", fake_runs), \
                mock.patch.object(gate, "fetch_jobs", lambda repo, run_id, token: jobs), \
                mock.patch.object(sys, "argv", ["release-gate", "--sha", self.SHA] + argv), \
                mock.patch.dict(gate.os.environ, {"GH_TOKEN": "x"}), redirect_stdout(out):
            rc = gate.main()
        return rc, called, out.getvalue()

    def jobs(self, **conclusions):
        base = {"ios (regression)": "success", "android (regression)": "success"}
        base.update(conclusions)
        return [{"name": n, "status": "completed", "conclusion": c} for n, c in base.items()]

    def test_not_consulted_by_default(self):
        rc, called, _ = self.drive([], self.jobs(**{"ios (regression)": "failure"}))
        self.assertEqual(rc, 0)
        self.assertNotIn("mobile-e2e.yml", called)

    def test_required_run_with_both_platform_jobs_passes(self):
        rc, called, out = self.drive(["--require-mobile-e2e"], self.jobs())
        self.assertEqual(rc, 0)
        self.assertIn("mobile-e2e.yml", called)
        self.assertIn("required jobs green", out)

    def test_a_commit_without_a_run_says_how_to_produce_one(self):
        # mobile-e2e.yml only runs for mobile-affecting changes, so a release candidate may legitimately have no run yet.
        out = io.StringIO()
        with mock.patch.object(gate, "fetch_runs", lambda repo, workflow, sha, token: []), \
                mock.patch.object(sys, "argv", ["release-gate", "--sha", self.SHA, "--require-mobile-e2e"]), \
                mock.patch.dict(gate.os.environ, {"GH_TOKEN": "x"}), redirect_stdout(out):
            rc = gate.main()
        self.assertEqual(rc, 1)
        self.assertIn("gh workflow run mobile-e2e.yml", out.getvalue())
        self.assertIn("-f suite=regression", out.getvalue())

    def test_a_run_whose_device_jobs_were_skipped_also_says_how_to_produce_one(self):
        # The usual case: the workflow starts on every push to main but skips the device jobs when nothing mobile changed.
        skipped = [{"name": "ios (regression)", "status": "completed", "conclusion": "skipped"},
                   {"name": "android (regression)", "status": "completed", "conclusion": "skipped"}]
        rc, _, out = self.drive(["--require-mobile-e2e"], skipped)
        self.assertEqual(rc, 1)
        self.assertIn("gh workflow run mobile-e2e.yml", out)

    def test_a_passing_run_does_not_print_the_hint(self):
        rc, _, out = self.drive(["--require-mobile-e2e"], self.jobs())
        self.assertEqual(rc, 0)
        self.assertNotIn("gh workflow run", out)

    def test_required_run_fails_for_smoke_only_or_failed_platform_jobs(self):
        smoke_only = [{"name": "ios (smoke)", "status": "completed", "conclusion": "success"},
                      {"name": "android (smoke)", "status": "completed", "conclusion": "success"}]
        for jobs in (smoke_only, self.jobs(**{"android (regression)": "failure"}), self.jobs(**{"ios (regression)": "skipped"})):
            rc, _, out = self.drive(["--require-mobile-e2e"], jobs)
            self.assertEqual(rc, 1)
            self.assertIn("BLOCKED", out)
