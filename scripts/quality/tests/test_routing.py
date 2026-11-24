import importlib.util
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location(
    "routing", ROOT / "scripts/quality/routing.py"
)
routing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(routing)

SVC = "varavu_selavu_app/varavu_selavu_service/"


class RoutingTests(unittest.TestCase):
    def test_money_auth_and_migrations_are_high_with_security(self):
        for path in [
            SVC + "services/group_expense_service.py",
            SVC + "services/split_engine.py",
            SVC + "core/money.py",
            SVC + "oauth/server.py",
            SVC + "mcp/reads.py",
            SVC + "db/mcp_models.py",
            "varavu_selavu_app/alembic/versions/abc123_add.py",
            "varavu_selavu_app/Dockerfile",
            ".github/workflows/qa.yml",
            "scripts/quality/sdlc.py",
            ".claude/settings.json",
            "scripts/hooks/guard-bash.py",
            "varavu_selavu_mobile/src/core/auth/AuthContext.tsx",
            "varavu_selavu_ui/src/api/csrf.ts",
        ]:
            with self.subTest(path=path):
                r = routing.classify([path])
                self.assertEqual(r["risk"], "high")
                self.assertIn("security-review", r["reviewers"])
                self.assertIn("implementation-review", r["reviewers"])

    def test_ordinary_product_ui_is_standard_without_security(self):
        # Audit finding: these used to route as high risk with 6-7 reviewers.
        for path in [
            "varavu_selavu_ui/src/components/ExpenseFeed.tsx",
            "varavu_selavu_mobile/src/core/ui/Button.tsx",
        ]:
            with self.subTest(path=path):
                r = routing.classify([path])
                self.assertEqual(r["risk"], "standard")  # was high with 6-7 reviewers
                self.assertEqual(r["reviewers"], ["implementation-review", "ui-review"])

    def test_tests_only_change_gets_one_reviewer(self):
        r = routing.classify(["varavu_selavu_app/tests/test_expenses.py"])
        self.assertEqual(r["reviewers"], ["implementation-review"])
        self.assertEqual(r["risk"], "standard")

    def test_endpoints_get_security_review_at_standard_risk(self):
        r = routing.classify([SVC + "api/routes.py"])
        self.assertIn("security-review", r["reviewers"])
        self.assertEqual(r["risk"], "standard")

    def test_framework_docs_are_standard_not_high(self):
        r = routing.classify([".ai-sdlc/standards/ux.md"])
        self.assertEqual(r["risk"], "standard")
        self.assertEqual(r["reviewers"], ["implementation-review"])
        self.assertIn("framework", r["checks"])

    def test_api_clients_and_unknown_code_get_baseline(self):
        for path in ["varavu_selavu_ui/src/api/expenses.ts", "tool/custom.rs"]:
            self.assertIn(
                "implementation-review", routing.classify([path])["reviewers"]
            )

    def test_product_review_only_on_request(self):
        path = "varavu_selavu_ui/src/pages/ExpensesPage.tsx"
        self.assertNotIn("product-review", routing.classify([path])["reviewers"])
        self.assertIn(
            "product-review", routing.classify([path], product=True)["reviewers"]
        )

    def test_mobile_does_not_run_web_a11y(self):
        r = routing.classify(
            ["varavu_selavu_mobile/src/features/account/screens/ProfileScreen.tsx"]
        )
        self.assertNotIn("web-accessibility", r["checks"])
        self.assertIn("native-device", r["manual"])

    def test_docs_are_trivial(self):
        for path in ["docs/features/example.md", "CHANGELOG.md", "README.md"]:
            r = routing.classify([path])
            self.assertEqual(r["reviewers"], [])
            self.assertEqual(r["risk"], "trivial")

    def test_empty_and_style(self):
        self.assertEqual(routing.classify([])["reviewers"], [])
        self.assertIn(
            "ui-review", routing.classify(["varavu_selavu_ui/src/theme.ts"])["reviewers"]
        )

    def test_performance_is_a_focus_not_a_reviewer(self):
        r = routing.classify([SVC + "services/analytics_service.py"])
        self.assertEqual(r["focus"], ["performance"])
        self.assertIn("implementation-review", r["reviewers"])
        self.assertFalse(any("performance" in reviewer for reviewer in r["reviewers"]))

    def test_generated_and_scratch_paths_are_excluded(self):
        r = routing.classify(
            ["tmp-build/main.js", "varavu_selavu_ui/build/static/x.js", "README.md"]
        )
        self.assertEqual(r["reviewers"], [])
        self.assertEqual(len(r["excluded"]), 2)

    def test_dependencies_trigger_deterministic_audit(self):
        r = routing.classify(["varavu_selavu_ui/package.json"])
        self.assertIn("dependency-audit", r["checks"])
        self.assertNotIn("security-review", r["reviewers"])

    def test_risk_flag_escalates(self):
        r = routing.classify(["varavu_selavu_ui/src/pages/X.tsx"], risk="high")
        self.assertEqual(r["risk"], "high")
        self.assertIn("security-review", r["reviewers"])

    def test_unmapped_code_requires_check_mapping(self):
        self.assertIn(
            "unmapped-area-checks", routing.classify(["tool/custom.rs"])["manual"]
        )

    def test_scope_hash_changes_only_with_scoped_content(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            (root / "a.py").write_text("1")
            (root / "b.py").write_text("1")
            first = routing.scope_hash(["a.py"], root)
            (root / "b.py").write_text("2")
            self.assertEqual(first, routing.scope_hash(["a.py"], root))
            (root / "a.py").write_text("2")
            self.assertNotEqual(first, routing.scope_hash(["a.py"], root))
            self.assertNotEqual(
                routing.scope_hash(["gone.py"], root), routing.scope_hash([], root)
            )

    def test_ci_configuration_is_mapped_to_framework_checks(self):
        for path in [".github/workflows/unit.yml", ".github/rulesets/main.json", ".gitignore", "cloudbuild.backend.yaml"]:
            with self.subTest(path=path):
                r = routing.classify([path])
                self.assertNotIn("unmapped-area-checks", r["manual"])
                self.assertIn("framework", r["checks"])
        self.assertEqual(routing.classify([".github/rulesets/main.json"])["risk"], "high")  # branch protection
        self.assertEqual(routing.classify([".github/workflows/unit.yml"])["risk"], "high")

    def test_authorization_services_get_security_review(self):
        # Security review P1: these hold ownership/membership checks.
        for path in [
            SVC + "services/expense_service.py",
            SVC + "services/expense_comment_service.py",
            SVC + "services/group_service.py",
            SVC + "services/recurring_service.py",
            SVC + "services/budget_service.py",
            SVC + "services/split_suggestion_service.py",
            SVC + "repo/postgres_repo.py",
            SVC + "services/ocr/engine.py",
            "varavu_selavu_app/scripts/ai_access.py",
            "scripts/quality/check-local-test-env.py",
            "scripts/quality/migration-rehearsal.sh",
            ".github/rulesets/main.json",
        ]:
            with self.subTest(path=path):
                r = routing.classify([path])
                self.assertEqual(r["risk"], "high")
                self.assertIn("security-review", r["reviewers"])
        for path in [
            SVC + "models/api_models.py",
            "varavu_selavu_ui/src/utils/aiConsent.ts",
            "varavu_selavu_mobile/src/features/ask/utils/aiConsent.ts",
            "varavu_selavu_mobile/audit-allowlist.json",
            ".claude/agents/security-reviewer.md",
            "Makefile",
        ]:
            with self.subTest(path=path):
                self.assertIn("security-review", routing.classify([path])["reviewers"])

    def test_ledgers_are_checked_but_not_in_reviewer_scopes(self):
        r = routing.classify(["docs/sdlc/work-items/TS-1/evidence.json", "scripts/quality/routing.py"])
        self.assertIn("framework", r["checks"])
        self.assertNotIn("docs/sdlc/work-items/TS-1/evidence.json", r["scopes"]["implementation-review"])

    def test_hooks_release_scripts_and_nested_agents_run_framework_checks(self):
        for path in ["scripts/hooks/guard-bash.py", "scripts/release.sh", "scripts/pre-commit.sh",
                     "varavu_selavu_app/AGENTS.md", "qa/CLAUDE.md"]:
            with self.subTest(path=path):
                self.assertIn("framework", routing.classify([path])["checks"])
        self.assertEqual(routing.classify(["varavu_selavu_app/AGENTS.md"])["reviewers"], ["implementation-review"])

    def test_other_root_scripts_stay_unmapped(self):
        self.assertIn("unmapped-area-checks", routing.classify(["scripts/backfill_insights.py"])["manual"])

    def test_every_service_gets_security_review(self):
        for name in ["card_service.py", "tag_bulk_service.py", "tag_service.py", "activity_service.py",
                     "analysis_service.py", "insight_analytics_service.py"]:
            with self.subTest(service=name):
                self.assertIn("security-review", routing.classify([SVC + "services/" + name])["reviewers"])
        self.assertIn("security-review", routing.classify([".codex/agents/security-reviewer.toml"])["reviewers"])

    def test_escalation_never_adds_ledgers_to_scopes(self):
        files = ["docs/sdlc/work-items/TS-1/evidence.json", "scripts/quality/routing.py"]
        for kwargs in ({"product": True}, {"risk": "high"}):
            with self.subTest(**kwargs):
                r = routing.classify(files, **kwargs)
                for scope in r["scopes"].values():
                    self.assertNotIn(files[0], scope)
