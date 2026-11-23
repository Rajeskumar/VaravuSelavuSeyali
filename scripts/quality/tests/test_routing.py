import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location(
    "routing", ROOT / "scripts/quality/routing.py"
)
routing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(routing)


class RoutingTests(unittest.TestCase):
    def test_money_always_reviewed(self):
        r = routing.classify(
            [
                "varavu_selavu_app/varavu_selavu_service/services/group_expense_service.py"
            ]
        )
        self.assertTrue(
            {"implementation-review", "test-review", "security-review"}
            <= set(r["reviewers"])
        )
        self.assertEqual(r["risk"], "high")

    def test_sensitive_paths(self):
        for path in [
            "varavu_selavu_app/varavu_selavu_service/oauth/server.py",
            "varavu_selavu_app/varavu_selavu_service/mcp/reads.py",
            "varavu_selavu_app/varavu_selavu_service/db/mcp_models.py",
            "varavu_selavu_app/Dockerfile",
            ".agents/skills/security-review/SKILL.md",
        ]:
            with self.subTest(path=path):
                self.assertIn("security-review", routing.classify([path])["reviewers"])

    def test_api_clients_and_unknown_code_get_baseline(self):
        for path in ["varavu_selavu_ui/src/api/expenses.ts", "tool/custom.rs"]:
            self.assertIn(
                "implementation-review", routing.classify([path])["reviewers"]
            )
            self.assertIn("test-review", routing.classify([path])["reviewers"])

    def test_product_changes_include_existing_and_mobile_screens(self):
        for path in [
            "varavu_selavu_ui/src/pages/ExpensesPage.tsx",
            "varavu_selavu_mobile/src/features/expenses/screens/NewExpenseScreen.tsx",
        ]:
            self.assertIn("product-review", routing.classify([path])["reviewers"])

    def test_mobile_does_not_run_web_a11y(self):
        r = routing.classify(
            ["varavu_selavu_mobile/src/features/account/screens/ProfileScreen.tsx"]
        )
        self.assertNotIn("web-accessibility", r["checks"])
        self.assertIn("native-device", r["manual"])

    def test_docs_are_light_but_framework_docs_are_not(self):
        self.assertEqual(
            routing.classify(["docs/features/example.md"])["reviewers"], []
        )
        self.assertIn(
            "framework", routing.classify([".ai-sdlc/lifecycle.md"])["checks"]
        )

    def test_empty_and_style(self):
        self.assertEqual(routing.classify([])["reviewers"], [])
        self.assertIn(
            "accessibility-review",
            routing.classify(["varavu_selavu_ui/src/theme.ts"])["reviewers"],
        )

    def test_unmapped_code_requires_check_mapping(self):
        self.assertIn(
            "unmapped-area-checks", routing.classify(["tool/custom.rs"])["manual"]
        )
