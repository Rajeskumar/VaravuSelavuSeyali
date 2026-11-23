import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verification import commands, local_test_environment


class VerificationTests(unittest.TestCase):
    def test_framework_changes_are_checked(self):
        self.assertIn(
            ["make", "framework-check"], commands("fast", [".ai-sdlc/lifecycle.md"])
        )

    def test_qa_changes_get_typecheck(self):
        self.assertIn(
            ["npm", "--prefix", "qa", "run", "typecheck"],
            commands("fast", ["qa/api/tests/foo.spec.ts"]),
        )

    def test_release_includes_integration_and_audits(self):
        cmds = commands("release", [])
        for cmd in [
            ["make", "test-postgres"],
            ["make", "qa-all"],
            ["make", "qa-account"],
            ["make", "audit-all"],
            ["make", "qa-regression-extra"],
        ]:
            self.assertIn(cmd, cmds)

    def test_production_is_only_readonly_suite(self):
        self.assertEqual(
            commands("production", ["varavu_selavu_app/main.py"]),
            [["make", "qa-prod-smoke"]],
        )

    def test_local_database_required_and_matrix_precedes_account(self):
        self.assertFalse(
            local_test_environment(
                {
                    "SDLC_TEST_ENV": "local",
                    "E2E_DATABASE_URL": "postgresql://user@remote.example/db",
                }
            )
        )
        self.assertFalse(
            local_test_environment(
                {"SDLC_TEST_ENV": "local", "E2E_DATABASE_URL": "https://localhost/db"}
            )
        )
        self.assertTrue(
            local_test_environment(
                {
                    "SDLC_TEST_ENV": "local",
                    "E2E_DATABASE_URL": "postgresql://user@localhost/test_db",
                }
            )
        )
        cmds = commands("release", [])
        self.assertNotIn(["make", "qa-regression-full"], cmds)
        self.assertLess(
            cmds.index(["make", "qa-regression-extra"]),
            cmds.index(["make", "qa-account"]),
        )
