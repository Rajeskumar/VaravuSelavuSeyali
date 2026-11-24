import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verification import commands, failure_excerpt, local_test_environment, run_summarized


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
            ["python3", "scripts/quality/test_integrity.py"],
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
        self.assertFalse(
            local_test_environment(
                {"SDLC_TEST_ENV": "local", "E2E_DATABASE_URL": "postgresql://localhost/db?host=prod.example.com"}
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

    def test_failure_excerpt_is_bounded_and_prefers_error_lines(self):
        log = "\n".join([f"noise {i}" for i in range(500)] + ["FAILED tests/test_x.py::test_y - AssertionError", "  detail"])
        excerpt = failure_excerpt(log)
        self.assertLessEqual(len(excerpt), 20)
        self.assertIn("FAILED tests/test_x.py::test_y - AssertionError", excerpt)
        self.assertEqual(failure_excerpt("a\nb"), ["a", "b"])  # no match: tail
        noisy = "\n".join(["console.error: warn"] * 50 + ["found 0 vulnerabilities"] + ["● Suite › fails"])
        self.assertEqual(failure_excerpt(noisy), ["● Suite › fails"])
        many = "\n".join(f"FAILED t{i}" for i in range(40))
        self.assertEqual(failure_excerpt(many)[-1], "FAILED t39")  # keeps the last failures

    def test_summarized_run_writes_logs_and_keeps_going(self):
        import io, contextlib, tempfile
        with tempfile.TemporaryDirectory() as tmp:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                results = run_summarized(
                    [["sh", "-c", "echo boom; echo 'Error: bad' ; exit 3"], ["sh", "-c", "echo ok"]],
                    None, Path(tmp) / "run", keep_going=True,
                )
            self.assertEqual([r["status"] for r in results], ["FAIL", "PASS"])
            self.assertTrue((Path(tmp) / "run" / "summary.json").exists())
            self.assertIn("Error: bad", out.getvalue())
            self.assertNotIn("echo ok", out.getvalue().split("log:")[0])

    def test_fast_profile_adds_audit_for_manifests_and_test_integrity(self):
        cmds = commands("fast", ["varavu_selavu_ui/package.json"])
        self.assertIn(["make", "audit-web"], cmds)
        self.assertIn(["python3", "scripts/quality/test_integrity.py"], cmds)
