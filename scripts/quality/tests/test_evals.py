import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "evals"))
import run_evals


class EvalScenarioTests(unittest.TestCase):
    def test_every_scenario_routes_as_expected(self):
        for scenario in run_evals.load():
            with self.subTest(scenario=scenario["id"]):
                self.assertEqual(run_evals.routing_failures(scenario), [])

    def test_scenarios_are_well_formed(self):
        ids = [s["id"] for s in run_evals.load()]
        self.assertEqual(len(ids), len(set(ids)))
        for s in run_evals.load():
            self.assertTrue(s["prompt"] and s["forbid"] is not None)

    def test_hints_detect_forbidden_actions(self):
        scenario = {"expect_any": ["readiness"], "forbid": ["git push"]}
        self.assertEqual(run_evals.hints(scenario, "Readiness: ok. Then git push.")["forbidden_seen"], ["git push"])
