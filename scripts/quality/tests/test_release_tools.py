import json
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import release_tools as rt

SHA = "a" * 40


class FakeGate:
    def __init__(self, ok):
        self.ok = ok

    def evaluate_runs(self, runs, sha):
        return self.ok, "completed/success https://run" if self.ok else "no main-branch run"


class ReleaseToolsTests(unittest.TestCase):
    def test_work_items_come_from_commit_subjects_and_flags(self):
        commits = [("abc1234", "fix: thing (TS-QA-101)"), ("def5678", "feat: other")]
        self.assertEqual(rt.linked_work_items(commits, ["TS-SDLC-002"]), ["TS-QA-101", "TS-SDLC-002"])

    def test_git_facts_use_previous_release_tag(self):
        def run(cmd):
            if cmd[:2] == ["git", "tag"]:
                return "release-v1.10.0\nrelease-v1.2.0\nrelease-v1.1.0\n"
            if cmd[:2] == ["git", "diff"]:
                self.assertIn("release-v1.2.0.." + SHA, cmd)
                return ("A\tvaravu_selavu_app/alembic/versions/abc_add.py\n"
                        "M\tvaravu_selavu_app/alembic/versions/old_rev.py\n")
            raise AssertionError(cmd)

        self.assertEqual(rt.previous_tag(None, run), "release-v1.10.0")  # numeric, not lexical
        tag = rt.previous_tag("1.3.0", run)
        self.assertEqual(tag, "release-v1.2.0")
        self.assertEqual(rt.previous_tag("1.2.0", run), "release-v1.1.0")  # never itself
        self.assertEqual(rt.migrations_since(tag, SHA, run), (["abc_add.py"], ["old_rev.py"]))
        self.assertEqual(rt.migrations_since(None, SHA, run), ([], []))

    def test_ci_checks_map_gate_results_and_security_follows_unit(self):
        ok = rt.ci_checks(SHA, gate=FakeGate(True), fetch=lambda wf: [], has_security=lambda s: True)
        self.assertEqual({c["status"] for c in ok.values()}, {"passed"})
        # A candidate whose unit.yml predates the security job cannot claim it ran.
        old = rt.ci_checks(SHA, gate=FakeGate(True), fetch=lambda wf: [], has_security=lambda s: False)
        self.assertEqual(old["security"]["status"], "skipped")
        red = rt.ci_checks(SHA, gate=FakeGate(False), fetch=lambda wf: [], has_security=lambda s: True)
        self.assertEqual(red["unit-ci"]["status"], "failed")
        self.assertEqual(red["security"]["status"], "failed")

        def broken(wf):
            raise OSError("offline")

        unknown = rt.ci_checks(SHA, gate=FakeGate(True), fetch=broken)
        self.assertEqual(unknown["qa-ci"]["status"], "skipped")

    def test_migration_check(self):
        tag = "release-v1.2.0"
        self.assertEqual(rt.migration_check(SHA, tag, [])["status"], "passed")
        self.assertEqual(rt.migration_check(SHA, None, [])["status"], "skipped")
        self.assertEqual(rt.migration_check(SHA, tag, [], ["old.py"])["status"], "failed")
        none = rt.migration_check(SHA, tag, ["x.py"], runs=[], find=lambda s, r: None)
        self.assertEqual(none["status"], "skipped")
        self.assertIn("gh workflow run migrations.yml", none["source"])
        green = rt.migration_check(SHA, tag, ["x.py"], runs=[1], find=lambda s, r: {"conclusion": "success"})
        self.assertEqual(green["status"], "passed")
        red = rt.migration_check(SHA, tag, ["x.py"], runs=[1], find=lambda s, r: {"conclusion": "failure"})
        self.assertEqual(red["status"], "failed")  # a red rehearsal blocks; it is not "missing"

    def test_record_leaves_unprovable_checks_open(self):
        ci = rt.ci_checks(SHA, gate=FakeGate(True), fetch=lambda wf: [], has_security=lambda s: True)
        migration = rt.migration_check(SHA, "release-v1.2.0", [])
        prev = [{"image": "img:old", "digest": "sha256:1", "revision": "r1", "percent": 100}]
        comps = [rt.component(n, SHA, prev) for n in rt.SERVICES]
        record = rt.build_record("1.3.0", SHA, ci, migration, comps, ["TS-1"], {"TS-1": "PASS"},
                                 [("abc1234", "feat: unreviewed")], "release-v1.2.0")
        status = {c["id"]: c["status"] for c in record["checks"]}
        self.assertEqual(status["acceptance"], "passed")
        self.assertEqual(status["reviews"], "skipped")  # an unlinked commit needs review or a waiver
        self.assertEqual(status["configuration"], "skipped")
        self.assertEqual(status["recovery"], "passed")
        self.assertIsNone(record["authorization"])
        self.assertEqual(record["components"][0]["expected_image"],
                         f"gcr.io/{rt.PROJECT}/varavu-selavu-backend:{SHA[:7]}")
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        import sdlc

        sdlc.validate_document(record, "release")
        self.assertEqual(sdlc.release_gate(record)["verdict"], "INCOMPLETE_EVIDENCE")

    def test_native_mobile_check_is_required_only_when_mobile_code_changed_since_the_last_release(self):
        # Owner decision 2026-11-25: native E2E runs locally, at release time, only when mobile code changed.
        need = rt.native_mobile_check(SHA, "release-v1.2.0", ["varavu_selavu_mobile/src/App.tsx", "qa/mobile/flows/smoke/x.yaml"])
        self.assertEqual((need["id"], need["status"]), ("native-mobile-e2e", "skipped"))  # skipped = still to do: the gate reports it missing
        self.assertIn("2 mobile-affecting file(s) changed since release-v1.2.0", need["source"])
        self.assertIn("make mobile-e2e-ios SUITE=regression", need["source"])
        self.assertIn("make mobile-e2e-android SUITE=regression", need["source"])
        none = rt.native_mobile_check(SHA, "release-v1.2.0", [])
        self.assertEqual(none["status"], "passed")
        self.assertIn("Not applicable", none["source"])
        first = rt.native_mobile_check(SHA, None, None)
        self.assertEqual(first["status"], "skipped")
        self.assertIn("No previous release tag", first["source"])

    def test_mobile_changes_are_read_from_the_diff_since_the_tag_with_the_ci_classifier_paths(self):
        calls = []

        def run(cmd):
            calls.append(cmd)
            return "varavu_selavu_mobile/src/caf\u00e9.ts\0varavu_selavu_ui/src/App.tsx\0qa/mobile/README.md\0docs/a.md\0"

        files = rt.mobile_changes_since("release-v1.2.0", SHA, run=run)
        self.assertEqual(files, ["varavu_selavu_mobile/src/caf\u00e9.ts", "qa/mobile/README.md"])
        self.assertIn("-z", calls[0])
        self.assertIn("--no-renames", calls[0])  # a file moved out of the mobile app must still count as a mobile change
        self.assertIn(f"release-v1.2.0..{SHA}", calls[0])
        self.assertIsNone(rt.mobile_changes_since(None, SHA, run=run))  # no previous release: unknown, so required

    def test_a_required_native_check_keeps_the_release_open_until_recorded(self):
        ci = rt.ci_checks(SHA, gate=FakeGate(True), fetch=lambda wf: [], has_security=lambda s: True)
        migration = rt.migration_check(SHA, "release-v1.2.0", [])
        prev = [{"image": "img:old", "digest": "sha256:1", "revision": "r1", "percent": 100}]
        comps = [rt.component(n, SHA, prev) for n in rt.SERVICES]
        native = rt.native_mobile_check(SHA, "release-v1.2.0", ["varavu_selavu_mobile/src/App.tsx"])
        record = rt.build_record("1.3.0", SHA, ci, migration, comps, ["TS-1"], {"TS-1": "PASS"}, [], "release-v1.2.0", native=native)
        self.assertIn("native-mobile-e2e", {c["id"] for c in record["checks"]})
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        import sdlc

        sdlc.validate_document(record, "release")
        self.assertIn("native-mobile-e2e: missing, stale or skipped", sdlc.release_gate(record)["missing"])

    def test_a_record_that_lost_its_native_check_is_still_incomplete(self):
        # Review finding: the gate only enforced the check if the record contained it, so deleting the entry from release.json
        # (or a hand-written record) let a release with untested mobile changes through.
        ci = rt.ci_checks(SHA, gate=FakeGate(True), fetch=lambda wf: [], has_security=lambda s: True)
        migration = rt.migration_check(SHA, "release-v1.2.0", [])
        prev = [{"image": "img:old", "digest": "sha256:1", "revision": "r1", "percent": 100}]
        comps = [rt.component(n, SHA, prev) for n in rt.SERVICES]
        record = rt.build_record("1.3.0", SHA, ci, migration, comps, ["TS-1"], {"TS-1": "PASS"}, [], "release-v1.2.0")  # no native check
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        import sdlc

        self.assertIn("native-mobile-e2e", sdlc.RELEASE_CHECKS)
        self.assertIn("native-mobile-e2e: missing, stale or skipped", sdlc.release_gate(record)["missing"])

    def test_component_evaluation(self):
        comp = rt.component("backend", SHA, [])
        expected = comp["expected_image"]
        build = {"status": "SUCCESS", "logUrl": "https://build"}
        done = rt.evaluate_component(comp, [{"image": expected, "revision": "r2", "percent": 100}], [build])
        self.assertEqual((done["status"], done["revision"], done["build_url"]), ("deployed", "r2", "https://build"))
        old = rt.evaluate_component(comp, [{"image": "img:old", "revision": "r1", "percent": 100}], [build])
        self.assertEqual(old["status"], "pending")  # build succeeded, old revision still serves
        failed = rt.evaluate_component(comp, [], [{"status": "FAILURE"}])
        self.assertEqual(failed["status"], "failed")

    def test_builds_filtered_by_release_trigger(self):
        builds = [
            {"id": 1, "substitutions": {"TRIGGER_NAME": "varavu-frontend-release"}},
            {"id": 2, "substitutions": {"TRIGGER_NAME": "varavu-backend-release"}},
        ]
        self.assertEqual([b["id"] for b in rt.builds_for_component(builds, "backend")], [2])

    def test_serving_reads_traffic_revisions_only(self):
        def run(cmd):
            if cmd[2] == "services":
                return json.dumps({"status": {"traffic": [
                    {"revisionName": "r2", "percent": 100}, {"revisionName": "r1", "percent": 0}]}})
            return json.dumps({"spec": {"containers": [{"image": "img:new"}]}, "status": {"imageDigest": "sha256:2"}})

        self.assertEqual(rt.serving("svc", run),
                         [{"revision": "r2", "percent": 100, "image": "img:new", "digest": "sha256:2"}])

    def test_security_job_detection_reads_candidate_workflow(self):
        self.assertTrue(rt.has_security_job(SHA, run=lambda c: "python3 scripts/quality/secret_scan.py\n make audit-all"))
        self.assertFalse(rt.has_security_job(SHA, run=lambda c: "jobs: {web: {}}"))

    def test_serving_digest_matches_expected_tag(self):
        comp = rt.component("backend", SHA, [])
        digest = "sha256:" + "b" * 64
        image = f"gcr.io/{rt.PROJECT}/varavu-selavu-backend@{digest}"
        done = rt.evaluate_component(comp, [{"image": image, "revision": "r3", "percent": 100}], [], digest)
        self.assertEqual(done["status"], "deployed")
        self.assertEqual(done["observed_image"], comp["expected_image"])
        other = rt.evaluate_component(comp, [{"image": image, "revision": "r3", "percent": 100}], [], "sha256:" + "c" * 64)
        self.assertEqual(other["status"], "pending")

    def test_resolve_digest(self):
        self.assertEqual(rt.resolve_digest("img:t", run=lambda c: "WARNING x\nsha256:abc\n"), "sha256:abc")

        def missing(cmd):
            raise RuntimeError("not found")

        self.assertIsNone(rt.resolve_digest("img:t", run=missing))

    def test_rehearsal_run_accepts_candidate_or_unchanged_ancestor(self):
        import subprocess
        head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=rt.ROOT, text=True).strip()
        runs = [
            {"run_number": 1, "status": "completed", "event": "push", "head_sha": head, "conclusion": "success"},
            {"run_number": 2, "status": "in_progress", "event": "push", "head_sha": head},
            {"run_number": 3, "status": "completed", "event": "push", "head_sha": "f" * 40, "conclusion": "success"},
        ]
        self.assertEqual(rt.rehearsal_run(head, runs)["run_number"], 1)
        self.assertIsNone(rt.rehearsal_run(head, runs[1:]))

    def test_rehearsal_on_unchanged_ancestor_counts_but_not_after_migration_changes(self):
        import subprocess
        log = subprocess.check_output(["git", "log", "--format=%H", "-n", "40", "HEAD"], cwd=rt.ROOT, text=True).split()
        changed_since = lambda old: subprocess.run(
            ["git", "diff", "--quiet", old, log[0], "--", *rt.MIGRATION_PATHS], cwd=rt.ROOT).returncode != 0
        clean = next((c for c in log[1:] if not changed_since(c)), None)
        dirty = next((c for c in log[1:] if changed_since(c)), None)
        if clean:
            run = {"run_number": 1, "status": "completed", "event": "push", "head_sha": clean, "conclusion": "success"}
            self.assertEqual(rt.rehearsal_run(log[0], [run]), run)
        if dirty:
            run = {"run_number": 1, "status": "completed", "event": "push", "head_sha": dirty, "conclusion": "success"}
            self.assertIsNone(rt.rehearsal_run(log[0], [run]))
        self.assertTrue(clean or dirty)

    def test_cancelled_rehearsal_is_skipped_for_an_older_success(self):
        import subprocess
        head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=rt.ROOT, text=True).strip()
        runs = [
            {"run_number": 2, "status": "completed", "event": "push", "head_sha": head, "conclusion": "cancelled"},
            {"run_number": 1, "status": "completed", "event": "push", "head_sha": head, "conclusion": "success"},
        ]
        self.assertEqual(rt.rehearsal_run(head, runs)["conclusion"], "success")
