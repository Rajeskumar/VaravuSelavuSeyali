import importlib.util
from pathlib import Path
import unittest

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
