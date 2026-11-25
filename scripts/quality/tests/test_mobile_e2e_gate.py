"""Tests for scripts/quality/mobile_e2e_gate.py (TS-QA-103, AC-006): change classification + the final gate verdict."""
import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / "mobile_e2e_gate.py"
spec = importlib.util.spec_from_file_location("mobile_e2e_gate", SCRIPT)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


MOBILE_PATHS = ("varavu_selavu_mobile/src/App.tsx", "varavu_selavu_mobile/package-lock.json", "varavu_selavu_mobile/AGENTS.md",
                "qa/mobile/flows/smoke/x.yaml", "qa/mobile/scripts/run.sh", "qa/mobile/README.md",
                ".github/workflows/mobile-e2e.yml", "scripts/quality/mobile_e2e_gate.py",
                "qa/scripts/bootstrap_schema.py", "qa/scripts/provision_qa_session_user.py")
NOT_MOBILE_PATHS = ("README.md", "docs/qa/06-automation-strategy.md", "CHANGELOG.md", "varavu_selavu_ui/src/App.tsx",
                    "varavu_selavu_app/varavu_selavu_service/main.py", "varavu_selavu_app/poetry.lock", "Makefile",
                    "scripts/quality/release-gate.py", ".github/workflows/unit.yml", ".github/workflows/qa.yml",
                    ".ai-sdlc/lifecycle.md", "qa/tests/smoke/login.spec.ts", "qa/scripts/seed_data.py")


class Classify(unittest.TestCase):
    """The device jobs run only for a change that can affect the native app or the suite itself (owner decision 2026-11-24)."""

    def test_a_change_that_cannot_affect_the_native_app_is_not_applicable(self):
        for f in NOT_MOBILE_PATHS:
            with self.subTest(file=f):
                self.assertFalse(gate.is_relevant([f]))
        self.assertFalse(gate.is_relevant(list(NOT_MOBILE_PATHS)))

    def test_anything_that_can_change_the_native_app_or_the_suite_is_relevant(self):
        for f in MOBILE_PATHS:
            with self.subTest(file=f):
                self.assertTrue(gate.is_relevant([f]))
                self.assertTrue(gate.is_relevant(["README.md", "varavu_selavu_ui/src/App.tsx", f]))  # one mobile file is enough

    def test_a_markdown_file_inside_the_suite_or_app_still_counts(self):
        self.assertTrue(gate.is_relevant(["varavu_selavu_mobile/AGENTS.md"]))
        self.assertTrue(gate.is_relevant(["qa/mobile/AGENTS.md"]))

    def test_an_empty_change_set_is_relevant_fail_safe(self):
        # No file list means the diff could not be determined: never skip silently.
        self.assertTrue(gate.is_relevant([]))

    def test_paths_that_merely_look_similar_do_not_match(self):
        for f in ("varavu_selavu_mobile_old/x.ts", "qa/mobilex/a.yaml", "docs/qa/mobile/notes.md", "varavu_selavu_ui/mobile/App.tsx"):
            with self.subTest(file=f):
                self.assertFalse(gate.is_relevant([f]))


class Suite(unittest.TestCase):
    def test_suite_per_event(self):
        self.assertEqual(gate.suite_for("pull_request", None), "smoke")
        self.assertEqual(gate.suite_for("push", None), "regression")
        self.assertEqual(gate.suite_for("schedule", None), "regression")
        self.assertEqual(gate.suite_for("workflow_dispatch", "smoke"), "smoke")
        self.assertEqual(gate.suite_for("workflow_dispatch", "regression"), "regression")
        self.assertEqual(gate.suite_for("workflow_dispatch", "bogus"), "smoke")


class Verdict(unittest.TestCase):
    def ok(self, **kw):
        base = dict(changes="success", relevant="true", android="success", ios="success")
        base.update(kw)
        return gate.decide(**base)

    def test_both_platforms_pass(self):
        self.assertTrue(self.ok()[0])

    def test_the_not_applicable_verdict_says_why(self):
        ok, message = gate.decide(changes="success", relevant="false", android="skipped", ios="skipped")
        self.assertTrue(ok)
        self.assertIn("no mobile-affecting change", message)

    def test_not_applicable_passes_even_though_platform_jobs_were_skipped(self):
        ok, msg = self.ok(relevant="false", android="skipped", ios="skipped")
        self.assertTrue(ok)
        self.assertIn("not applicable", msg)

    def test_relevant_change_with_any_platform_not_successful_fails(self):
        for android, ios in (("failure", "success"), ("success", "failure"), ("cancelled", "success"),
                             ("success", "cancelled"), ("skipped", "success"), ("success", "skipped"),
                             ("failure", "failure"), ("", "success")):
            with self.subTest(android=android, ios=ios):
                self.assertFalse(self.ok(android=android, ios=ios)[0])

    def test_classification_failure_fails(self):
        for changes in ("failure", "cancelled", "skipped", ""):
            with self.subTest(changes=changes):
                self.assertFalse(self.ok(changes=changes, relevant="false", android="skipped", ios="skipped")[0])

    def test_unknown_relevance_fails_safe(self):
        self.assertFalse(self.ok(relevant="", android="skipped", ios="skipped")[0])
        self.assertFalse(self.ok(relevant="maybe", android="skipped", ios="skipped")[0])

    def test_not_applicable_but_a_platform_ran_and_failed_still_fails(self):
        self.assertFalse(self.ok(relevant="false", android="failure", ios="skipped")[0])


class ChangedFilesAndScopeCli(unittest.TestCase):
    def test_changed_files_ignores_renames_and_reads_nul_separated_names(self):
        # A rename of a source file into docs/ would otherwise list only the new path and look docs-only; and without -z git
        # C-quotes unusual names, which would no longer match a path prefix.
        with mock.patch.object(gate.subprocess, "run") as run:
            run.return_value = mock.Mock(stdout="a\0b\0")
            self.assertEqual(gate._changed_files("base", "head"), ["a", "b"])
        self.assertIn("--no-renames", run.call_args.args[0])
        self.assertIn("-z", run.call_args.args[0])

    def test_a_mobile_file_with_an_unusual_name_is_still_seen_as_a_mobile_change(self):
        # Review finding: `git diff --name-only` prints "varavu_selavu_mobile/src/\303\251.ts" (quoted) for a non-ASCII name, which
        # failed the prefix match, so a PR whose only mobile change had such a name skipped the device jobs and the gate passed.
        import subprocess

        with tempfile.TemporaryDirectory() as d:
            def git(*args):
                subprocess.run(["git", "-c", "user.email=a@b", "-c", "user.name=t", *args], cwd=d, check=True, capture_output=True)

            git("init", "-q", ".")
            git("commit", "-q", "--allow-empty", "-m", "base")
            for name in ("varavu_selavu_mobile/src/\u00e9.ts", "varavu_selavu_mobile/src/tab\there.ts", 'qa/mobile/flows/q"uote.yaml'):
                target = Path(d) / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("x")
            git("add", "-A")
            git("commit", "-q", "-m", "change")
            files = gate._changed_files("HEAD~1", "HEAD", cwd=d)
        self.assertEqual(sorted(files), sorted(["varavu_selavu_mobile/src/\u00e9.ts", "varavu_selavu_mobile/src/tab\there.ts", 'qa/mobile/flows/q"uote.yaml']))
        self.assertTrue(gate.is_relevant(files))

    def scope(self, event, files=None, base="b", head="h", suite=None):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "out"
            out.write_text("")
            argv = ["gate", "scope", "--event", event, "--base", base, "--head", head] + (["--input-suite", suite] if suite else [])
            with mock.patch.dict(os.environ, {"GITHUB_OUTPUT": str(out)}), \
                    mock.patch.object(gate, "_changed_files", return_value=files if files is not None else []) as changed, \
                    mock.patch.object(sys, "argv", argv):
                self.assertEqual(gate.main(), 0)
            return out.read_text(), changed

    def test_scheduled_and_manual_runs_always_run_the_device_jobs(self):
        for event in ("schedule", "workflow_dispatch"):
            with self.subTest(event=event):
                text, changed = self.scope(event, base="", head="", suite="regression")
                self.assertIn("relevant=true", text)
                changed.assert_not_called()

    def test_a_pull_request_or_push_is_classified_from_its_changed_files(self):
        for event in ("pull_request", "push"):
            with self.subTest(event=event):
                self.assertIn("relevant=false", self.scope(event, ["docs/a.md", "varavu_selavu_ui/src/a.ts"])[0])
                self.assertIn("relevant=true", self.scope(event, ["docs/a.md", "varavu_selavu_mobile/src/a.ts"])[0])
        self.assertIn("suite=smoke", self.scope("pull_request", ["docs/a.md"])[0])
        self.assertIn("suite=regression", self.scope("push", ["docs/a.md"])[0])

    def test_a_diff_that_fails_runs_the_device_jobs(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "out"
            out.write_text("")
            with mock.patch.dict(os.environ, {"GITHUB_OUTPUT": str(out)}), \
                    mock.patch.object(gate, "_changed_files", side_effect=gate.subprocess.CalledProcessError(128, "git")), \
                    mock.patch.object(sys, "argv", ["gate", "scope", "--event", "push", "--base", "gone", "--head", "h"]):
                self.assertEqual(gate.main(), 0)
            self.assertIn("relevant=true", out.read_text())

    def test_a_push_without_a_usable_previous_commit_runs(self):
        # A new branch or a forced push has before=0000...: the diff cannot be known, so do not skip.
        for base in ("0" * 40, ""):
            with self.subTest(base=base):
                text, changed = self.scope("push", ["docs/a.md"], base=base)
                self.assertIn("relevant=true", text)
                changed.assert_not_called()


class WorkflowContract(unittest.TestCase):
    """The release gate and the ruleset depend on the workflow's job names; pin them together."""

    @classmethod
    def setUpClass(cls):
        import yaml  # scripts/quality/requirements.txt

        root = Path(__file__).resolve().parents[3]
        cls.wf = yaml.safe_load((root / ".github/workflows/mobile-e2e.yml").read_text())
        spec = importlib.util.spec_from_file_location("release_gate", root / "scripts/quality/release-gate.py")
        cls.release = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.release)

    def test_platform_job_names_resolve_to_the_names_the_release_gate_requires(self):
        names = {self.wf["jobs"][j]["name"].replace("${{ needs.changes.outputs.suite }}", "regression")
                 for j in ("ios", "android")}
        self.assertEqual(names, set(self.release.MOBILE_E2E_REQUIRED_JOBS))

    def test_gate_job_is_always_evaluated_and_depends_on_everything(self):
        job = self.wf["jobs"]["gate"]
        self.assertEqual(job["name"], "Native mobile gate")
        self.assertEqual(job["if"].strip(), "always()")
        self.assertEqual(set(job["needs"]), {"changes", "android", "ios"})

    def test_runs_on_every_pull_request_without_a_path_filter(self):
        triggers = self.wf.get("on") or self.wf.get(True)  # YAML 1.1 parses the key `on` as True
        self.assertIn("pull_request", triggers)
        self.assertNotIn("paths", triggers["pull_request"] or {})
        self.assertNotIn("paths-ignore", triggers["pull_request"] or {})

    def test_pushes_are_classified_against_the_previous_commit(self):
        env = self.wf["jobs"]["changes"]["steps"][-1]["env"]
        self.assertIn("github.event.before", env["BASE_SHA"])
        self.assertIn("github.event.pull_request.base.sha", env["BASE_SHA"])
        self.assertIn("github.sha", env["HEAD_SHA"])
        self.assertIn("github.event.pull_request.head.sha", env["HEAD_SHA"])

    def test_non_pr_runs_are_never_cancelled_by_a_newer_run(self):
        group = self.wf["concurrency"]["group"]
        self.assertIn("github.run_id", group)
        self.assertNotIn("github.ref", group)
        self.assertIn("pull_request", self.wf["concurrency"]["cancel-in-progress"])

    def test_untrusted_expression_values_are_not_interpolated_into_scripts(self):
        text = (Path(__file__).resolve().parents[3] / ".github/workflows/mobile-e2e.yml").read_text()
        self.assertNotIn("github.event.pull_request.title", text)
        self.assertNotIn("github.head_ref", text)


if __name__ == "__main__":
    unittest.main()
