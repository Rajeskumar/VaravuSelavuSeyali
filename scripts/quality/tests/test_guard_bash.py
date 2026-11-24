import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[3]
GUARD = ROOT / "scripts/hooks/guard-bash.py"
spec = importlib.util.spec_from_file_location("guard_bash", GUARD)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


def run(command, tool="claude"):
    out = subprocess.run(
        [sys.executable, str(GUARD), "--tool", tool],
        input=json.dumps({"tool_name": "Bash", "tool_input": {"command": command}}),
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out)["hookSpecificOutput"]["permissionDecision"] if out.strip() else None


class GuardBashTests(unittest.TestCase):
    def test_allows_ordinary_commands(self):
        for command in [
            "make test-backend",
            "git status && git diff --stat",
            "git commit -m 'never use --no-verify'",
            "gcloud builds triggers list --project=p",
            "gcloud run services describe svc --region=us-central1",
            "DATABASE_URL=postgresql://u@localhost:5432/test poetry run alembic upgrade head",
            "npm audit --omit=dev",
            "gh run list --branch main",
            "git push-notes",
            "cat > notes.md <<'EOF'\nNever run npm audit fix --force or git push -f origin main.\nEOF",
            "python3 - <<EOF\nprint('git push')\nEOF",
            "cd varavu_selavu_app && DATABASE_URL=postgresql://u@127.0.0.1:5432/t poetry run alembic downgrade -1",
            "gcloud builds list --project=p --filter=x --format=json",
            "gcloud logging read 'severity>=ERROR' --limit=5",
            "git -C /repo status",
            "git log --oneline -n 5",
            "git commit -m 'docs: explain why git push -f origin main is denied'",
            "DATABASE_URL=postgresql://localhost/x alembic current; DATABASE_URL=postgresql://localhost/x alembic upgrade head",
            "DATABASE_URL=postgresql://localhost/x poetry run alembic upgrade head 2>&1 | tail -5",
            "make check > out.log 2>&1 &",
            'echo "$(git status --short)"',
            "gcloud run revisions list --region us-central1 --format json",
        ]:
            with self.subTest(command=command):
                self.assertIsNone(guard.decide(command)[0])

    def test_denies_force_push_to_main_and_audit_force(self):
        for command in [
            "git push --force origin main",
            "git push -f origin HEAD:main",
            "git push origin +release-v1.2.0",
            "cd varavu_selavu_mobile && npm audit fix --force",
            "cat > x <<'EOF'\ndata\nEOF\ngit push --force origin main",
            "git -C /repo push --force origin main",
            'git push --force "origin" "main"',
            "git push -uf origin main",
            # Security re-review (cycle 2):
            "git -p push --force origin main",
            "git --no-optional-locks push --force origin main",
            "git push origin '+main'",
            'git -C "my dir" push --force "main"',
            # Security confirmation (R2): substitutions run even inside double quotes.
            'git commit -m "$(git push --force origin main)"',
            'git commit -m "x `git push --force origin main`"',
        ]:
            with self.subTest(command=command):
                self.assertEqual(guard.decide(command)[0], "deny")

    def test_asks_for_outward_or_destructive_actions(self):
        for command in [
            "git push origin chore/x",
            "git commit --no-verify -m x",
            "SKIP_HOOKS=1 git commit -m x",
            "git tag release-v1.3.0",
            "scripts/release.sh 1.3.0 docs/sdlc/releases/v1.3.0/release.json",
            "gcloud run deploy varavu-selavu-backend --image x",
            "gcloud secrets versions add GH_TOKEN --data-file=-",
            "cd varavu_selavu_app && poetry run alembic upgrade head",
            "git reset --hard origin/main",
            "gh pr merge 12 --squash",
            "gh api -X DELETE repos/o/r/rulesets/1",
            # Security review bypasses (TS-SDLC-002):
            "E2E_DATABASE_URL=postgresql://localhost/x poetry run alembic upgrade head",
            "echo DATABASE_URL=postgresql://localhost/x; poetry run alembic upgrade head",
            "DATABASE_URL=postgresql://u:p@db.prod.example.com/x?h=localhost/ poetry run alembic upgrade head",
            "DATABASE_URL=postgresql://localhost/x?host=prod.example.com poetry run alembic upgrade head",
            "git -C /repo push origin main",
            "git -c core.hooksPath=/dev/null commit -m x",
            "git commit -nm x",
            'git tag -a "release-v1.3.0" -m x',
            "gcloud sql backups restore 1 --restore-instance=i",
            "gcloud storage rm -r gs://bucket",
            "gcloud secrets versions access latest --secret=GH_TOKEN",
            "TEST_INTEGRITY_ACK='obsolete' git commit -m x",
            "git commit -m 'x' -m 'Test-Change-Approved: removed flaky test'",
            # Security re-review (cycle 2):
            "DATABASE_URL=postgresql://localhost/x alembic history; alembic upgrade head",
            "DATABASE_URL=postgresql://localhost/x poetry run alembic current && poetry run alembic upgrade head",
            "git --paginate push origin x",
            "git commit --no-veri -m x",
            "gcloud run services delete describe",
            "gcloud run deploy api --format list",
            # Security confirmation (R1, R3, R4):
            "DATABASE_URL=postgresql://localhost/x alembic history & alembic upgrade head",
            "DATABASE_URL=postgresql://localhost/x true & poetry run alembic upgrade head",
            "DATABASE_URL=postgresql://localhost/x alembic current `alembic upgrade head`",
            "DATABASE_URL=postgresql://localhost/x alembic current $(alembic upgrade head)",
            'echo "$(alembic upgrade head)"',
            "alembic 'upgrade' head",
            "gcloud builds triggers run deploy-backend --format list",
            "/opt/homebrew/bin/gcloud run deploy api",
        ]:
            with self.subTest(command=command):
                self.assertEqual(guard.decide(command)[0], "ask")

    def test_claude_gets_ask_codex_gets_deny_unless_approved(self):
        self.assertEqual(run("git push origin x", "claude"), "ask")
        self.assertEqual(run("git push origin x", "codex"), "deny")
        self.assertIsNone(run("SDLC_GUARD_APPROVED=1 git push origin x", "codex"))
        # The approval prefix never lifts a hard deny.
        self.assertEqual(run("SDLC_GUARD_APPROVED=1 git push -f origin main", "codex"), "deny")
        self.assertIsNone(run("make check"))

    def test_bad_input_fails_open_without_crashing(self):
        for raw in ["not json", "[1, 2]", '{"tool_input": null}', '{"tool_input": {"command": 5}}']:
            with self.subTest(raw=raw):
                result = subprocess.run(
                    [sys.executable, str(GUARD)], input=raw, capture_output=True, text=True
                )
                self.assertEqual(result.returncode, 0)
                self.assertEqual(result.stdout, "")
                self.assertIn("not enforcing", result.stderr)
