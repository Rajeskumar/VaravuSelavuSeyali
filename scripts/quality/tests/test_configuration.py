from pathlib import Path
import subprocess
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[3]


class ConfigurationTests(unittest.TestCase):
    def test_cloud_gate_precedes_all_mutations(self):
        for component in ("backend", "frontend"):
            config = yaml.safe_load((ROOT / f"cloudbuild.{component}.yaml").read_text())
            step = config["steps"][0]
            self.assertEqual(step["id"], "required-ci")
            self.assertIn("${COMMIT_SHA}", step["args"])
            self.assertIn("scripts/quality/release-gate.py", step["args"])
            self.assertEqual(step["secretEnv"], ["GH_TOKEN"])
            self.assertEqual(
                config["availableSecrets"]["secretManager"][0]["env"], "GH_TOKEN"
            )

    def test_candidate_workflows_no_longer_skip_paths(self):
        for workflow in ("unit", "qa", "framework"):
            # BaseLoader avoids YAML 1.1 treating the GitHub key 'on' as a boolean.
            config = yaml.load(
                (ROOT / f".github/workflows/{workflow}.yml").read_text(),
                Loader=yaml.BaseLoader,
            )
            self.assertNotIn("paths-ignore", config["on"]["push"])
            self.assertEqual(config["on"]["push"]["branches"], ["main"])

    def test_shell_syntax(self):
        for path in [
            "scripts/release.sh",
            "scripts/pre-push.sh",
            "scripts/quality/verify.sh",
            "scripts/quality/route-review.sh",
        ]:
            subprocess.run(["bash", "-n", str(ROOT / path)], check=True)

    def test_cli_rejects_invalid_phase_and_unknown_flags(self):
        import sys

        for command in [
            ["scripts/quality/sdlc.py", "gate", "ignored", "--phase", "ship"],
            ["scripts/quality/verification.py", "--unknown"],
        ]:
            result = subprocess.run(
                [sys.executable, *command], cwd=ROOT, capture_output=True
            )
            self.assertNotEqual(result.returncode, 0)

    def test_release_rejects_missing_record_before_git_changes(self):
        result = subprocess.run(
            ["bash", "scripts/release.sh", "1.2.3"],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("release.json", result.stderr)
