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
            "scripts/quality/migration-rehearsal.sh",
            "scripts/pre-commit.sh",
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

    def workflow(self, name):
        return yaml.load((ROOT / f".github/workflows/{name}.yml").read_text(), Loader=yaml.BaseLoader)

    def test_ruleset_requires_every_candidate_job(self):
        import json

        ruleset = json.loads((ROOT / ".github/rulesets/main.json").read_text())
        rule = next(r for r in ruleset["rules"] if r["type"] == "required_status_checks")
        required = {c["context"] for c in rule["parameters"]["required_status_checks"]}
        jobs = {
            job.get("name", job_id)
            for wf in ("unit", "qa", "framework")
            for job_id, job in self.workflow(wf)["jobs"].items()
        }
        self.assertEqual(required, jobs)
        self.assertIn("pull_request", {r["type"] for r in ruleset["rules"]})

    def test_ci_enforces_test_integrity_security_and_migrations(self):
        unit = self.workflow("unit")["jobs"]
        self.assertIn("test_integrity.py", str(unit["test-integrity"]))
        self.assertIn("secret_scan.py", str(unit["security"]))
        self.assertIn("make audit-all", str(unit["security"]))
        migrations = self.workflow("migrations")
        self.assertIn("varavu_selavu_app/alembic/**", migrations["on"]["push"]["paths"])
        self.assertIn("migration-rehearsal.sh", str(migrations["jobs"]))

    def test_legacy_push_to_main_pipeline_is_gone(self):
        # Re-enabling the disabled legacy trigger must not deploy without the CI gate.
        self.assertFalse((ROOT / "cloudbuild.yaml").exists())
