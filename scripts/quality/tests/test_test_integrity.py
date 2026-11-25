import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_integrity import analyse


def diff(path, removed=(), added=()):
    lines = [f"diff --git a/{path} b/{path}", f"--- a/{path}", f"+++ b/{path}", "@@ -1 +1 @@"]
    lines += ["-" + r for r in removed] + ["+" + a for a in added]
    return "\n".join(lines) + "\n"


class TestIntegrityTests(unittest.TestCase):
    def test_clean_change_passes(self):
        d = diff("varavu_selavu_app/tests/test_x.py", ["    assert a == 1"], ["    assert a == 2"])
        self.assertEqual(analyse(["M\tvaravu_selavu_app/tests/test_x.py"], d), [])

    def test_deleted_test_file_is_flagged(self):
        f = analyse(["D\tvaravu_selavu_ui/src/api/api.test.ts"], "")
        self.assertTrue(any("deleted test file" in x for x in f))

    def test_rename_is_not_a_deletion(self):
        self.assertEqual(analyse(["R100\ttests/test_a.py\ttests/test_b.py"], ""), [])

    def test_skip_and_only_markers_are_flagged(self):
        for marker in [
            "@pytest.mark.skip(reason='flaky')",
            "it.only('works', () => {})",
            "test.skip('x', () => {})",
            "xit('x', () => {})",
            "@pytest.mark.xfail",
            "self.skipTest('later')",
            "@pytest.mark.skipif(sys.platform == 'darwin', reason='x')",
            "pytestmark = pytest.mark.skip(reason='later')",
            "xtest('x', () => {})",
            "it.concurrent.skip('x', async () => {})",
        ]:
            with self.subTest(marker=marker):
                f = analyse([], diff("qa/tests/a.spec.ts", added=[marker]))
                self.assertTrue(any("skip/only" in x for x in f), f)

    def test_deleted_maestro_flow_and_its_verify_script_are_flagged(self):
        # TS-QA-103: native E2E flows are tests; deleting one (or its server-side check) weakens the suite.
        for path in ("qa/mobile/flows/smoke/login-relaunch.yaml", "qa/mobile/flows/smoke/expense-create.verify.py"):
            with self.subTest(path=path):
                self.assertTrue(any("deleted test file" in x for x in analyse([f"D\t{path}"], "")))

    def test_removed_maestro_assertions_are_flagged(self):
        d = diff("qa/mobile/flows/smoke/tabs-render.yaml", removed=["- assertVisible:", "- extendedWaitUntil:"],
                 added=["- tapOn:"])
        self.assertTrue(any("assertion loss" in x for x in analyse([], d)))

    def test_maestro_assertion_swapped_for_assertion_passes_and_helpers_are_not_tests(self):
        d = diff("qa/mobile/flows/smoke/tabs-render.yaml", removed=["- assertVisible:"], added=["- assertVisible:"])
        self.assertEqual(analyse([], d), [])
        # subflows and scripts are helpers, not tests
        self.assertEqual(analyse(["D\tqa/mobile/subflows/login.yaml", "D\tqa/mobile/scripts/run.sh"], ""), [])

    def test_net_assertion_loss_is_flagged(self):
        d = diff(
            "varavu_selavu_mobile/src/x.test.ts",
            removed=["expect(a).toBe(1);", "expect(b).toBe(2);"],
            added=["expect(a).toBe(1);"],
        )
        self.assertTrue(any("assertion loss" in x for x in analyse([], d)))

    def test_assertions_added_elsewhere_do_not_hide_a_loss(self):
        d = diff("qa/tests/a.spec.ts", removed=["expect(a).toBe(1);"]) + diff(
            "qa/tests/b.spec.ts", added=["expect(b).toBe(1);", "expect(c).toBe(1);"])
        self.assertTrue(any("qa/tests/a.spec.ts" in x for x in analyse([], d)))

    def test_moving_a_test_out_of_test_paths_is_flagged(self):
        f = analyse(["R100\tvaravu_selavu_ui/src/a.test.ts\tvaravu_selavu_ui/src/a.test.ts.bak"], "")
        self.assertTrue(any("moved out" in x for x in f))

    def test_non_test_files_are_ignored(self):
        d = diff("varavu_selavu_app/varavu_selavu_service/x.py", removed=["assert x"], added=["pytest.skip()"])
        self.assertEqual(analyse([], d), [])

    def test_untracked_test_with_only_is_flagged(self):
        f = analyse([], "", ["qa/tests/new.spec.ts"], read=lambda p: "test.only('a', () => {})")
        self.assertTrue(any("skip/only" in x for x in f))

    def test_own_fixture_file_is_exempt(self):
        d = diff("scripts/quality/tests/test_test_integrity.py", added=["it.only('x')"])
        self.assertEqual(analyse([], d), [])


class GitIntegrationTests(unittest.TestCase):
    """Real git repos: user diff config and branches behind main must not change the verdict."""

    def setUp(self):
        import os, subprocess, tempfile
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = self.tmp.name
        self.env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@e", GIT_COMMITTER_NAME="t",
                        GIT_COMMITTER_EMAIL="t@e", GIT_CONFIG_GLOBAL="/dev/null")
        self.sh("git", "init", "-q", "-b", "main")
        Path(self.repo, "tests").mkdir()
        Path(self.repo, "tests/test_a.py").write_text("def test_a():\n    assert 1\n    assert 2\n")
        self.sh("git", "add", "-A"); self.sh("git", "commit", "-qm", "base")

    def sh(self, *cmd, extra_env=None):
        import subprocess
        return subprocess.run(cmd, cwd=self.repo, env=dict(self.env, **(extra_env or {})),
                              capture_output=True, text=True)

    def check(self, *args, extra_env=None):
        script = Path(__file__).resolve().parents[1] / "test_integrity.py"
        return self.sh(sys.executable, str(script), *args, extra_env=extra_env)

    def test_diff_prefix_config_cannot_disable_the_check(self):
        Path(self.repo, "tests/test_a.py").write_text("def test_a():\n    pass\n")
        self.sh("git", "add", "-A")
        for key in ("diff.noprefix", "diff.mnemonicPrefix"):
            with self.subTest(config=key):
                cfg = {"GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": key, "GIT_CONFIG_VALUE_0": "true"}
                self.assertEqual(self.check("--staged", extra_env=cfg).returncode, 1)

    def test_pr_behind_main_does_not_report_mains_new_tests_as_deleted(self):
        self.sh("git", "checkout", "-qb", "feature")
        Path(self.repo, "notes.txt").write_text("x"); self.sh("git", "add", "-A"); self.sh("git", "commit", "-qm", "f")
        self.sh("git", "checkout", "-q", "main")
        Path(self.repo, "tests/test_b.py").write_text("def test_b():\n    assert 1\n")
        self.sh("git", "add", "-A"); self.sh("git", "commit", "-qm", "main moves on")
        result = self.check("--range", "main", "feature")
        self.assertEqual(result.returncode, 0, result.stdout)
