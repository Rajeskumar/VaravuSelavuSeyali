import copy
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("sdlc", ROOT / "scripts/quality/sdlc.py")
sdlc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sdlc)
SNAP = "a" * 64


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name) / "item"
        shutil.copytree(ROOT / ".ai-sdlc/templates/work-item", self.folder)
        self.work = sdlc.read(self.folder / "work-item.json")
        self.work.update(
            acceptance_criteria=[{"id": "AC-001", "outcome": "Expected behavior"}],
            required_evidence=["unit", "review"],
        )
        for name in ("requirements.md", "implementation.md", "test-plan.md"):
            (self.folder / name).write_text(
                "AC-001: explicit behavior and verification"
            )
        self.results = {
            "schema_version": 1,
            "results": [self.result("unit"), self.result("review")],
        }
        self.findings = {"schema_version": 1, "findings": []}
        self.save()

    def result(self, id):
        return {
            "id": id,
            "status": "passed",
            "snapshot": SNAP,
            "environment": "isolated local test",
            "command_or_method": "unittest",
            "source": "test report",
            "recorded_at": "2026-11-22T12:00:00Z",
            "acceptance_criteria": ["AC-001"],
        }

    def save(self):
        for name, data in [
            ("work-item", self.work),
            ("evidence", self.results),
            ("findings", self.findings),
        ]:
            (self.folder / f"{name}.json").write_text(json.dumps(data))

    def gate(self):
        self.save()
        return sdlc.work_gate(self.folder, "validate", SNAP)["verdict"]

    def test_pass_requires_evidence(self):
        self.assertEqual(self.gate(), "PASS")
        self.results["results"].pop()
        self.assertEqual(self.gate(), "INCOMPLETE_EVIDENCE")

    def test_stale_failed_and_skipped(self):
        r = self.results["results"][0]
        r["snapshot"] = "b" * 64
        self.assertEqual(self.gate(), "INCOMPLETE_EVIDENCE")
        r["snapshot"] = SNAP
        r["status"] = "failed"
        self.assertEqual(self.gate(), "BLOCKED")
        r["status"] = "skipped"
        self.assertEqual(self.gate(), "INCOMPLETE_EVIDENCE")

    def test_uncovered_criterion(self):
        self.work["acceptance_criteria"].append(
            {"id": "AC-002", "outcome": "Other behavior"}
        )
        self.assertEqual(self.gate(), "INCOMPLETE_EVIDENCE")

    def test_approval_invalidated_by_plan_change(self):
        self.work["risk"] = "high"
        self.save()
        self.work["implementation_approval"] = {
            "actor": "owner",
            "reference": "user approved this scope",
            "fingerprint": sdlc.plan_fingerprint(self.folder),
        }
        self.assertEqual(self.gate(), "PASS")
        (self.folder / "implementation.md").write_text("Materially different plan")
        self.assertEqual(self.gate(), "INCOMPLETE_EVIDENCE")

    def test_p0_cannot_be_waived_and_fixed_needs_evidence(self):
        f = {
            "id": "F-001",
            "severity": "P0",
            "certainty": "Confirmed",
            "summary": "Wrong total",
            "owner": "engineer",
            "source": "code:42",
            "status": "accepted",
            "verification_evidence": "",
            "waiver": {
                "owner": "owner",
                "reason": "accept",
                "expires": "2099-01-01",
                "reference": "approval",
            },
        }
        self.findings["findings"] = [f]
        self.assertEqual(self.gate(), "BLOCKED")
        f["severity"] = "P1"
        self.assertEqual(self.gate(), "PASS_WITH_APPROVED_WAIVERS")
        f["waiver"]["expires"] = "2000-01-01"
        self.assertEqual(self.gate(), "BLOCKED")
        f["status"] = "fixed"
        f["waiver"] = None
        self.assertEqual(self.gate(), "INCOMPLETE_EVIDENCE")
        f["verification_evidence"] = "unit"
        self.assertEqual(self.gate(), "PASS")

    def test_bad_schema_and_duplicate_evidence_rejected(self):
        self.results["results"][0]["status"] = "green"
        with self.assertRaises(ValueError):
            self.gate()
        self.results["results"][0]["status"] = "passed"
        self.results["results"].append(copy.deepcopy(self.results["results"][0]))
        with self.assertRaises(ValueError):
            self.gate()

    def test_work_item_never_authorizes_deployment(self):
        self.assertEqual(
            sdlc.work_gate(self.folder, "deploy", SNAP)["verdict"],
            "INCOMPLETE_EVIDENCE",
        )

    def test_snapshot_source_changes_and_evidence_does_not(self):
        root = Path(self.temp.name) / "repo"
        root.mkdir()
        subprocess.run(["git", "init", "-q", str(root)], check=True)
        (root / "code.py").write_text("version1")
        ledger = root / "docs/sdlc/work-items/TS-1"
        ledger.mkdir(parents=True)
        (ledger / "evidence.json").write_text("{}")
        first = sdlc.snapshot(root)
        (ledger / "evidence.json").write_text('{"results":[]}')
        self.assertEqual(first, sdlc.snapshot(root))
        (root / "code.py").write_text("version2")
        self.assertNotEqual(first, sdlc.snapshot(root))
        second = sdlc.snapshot(root)
        (ledger / "requirements.md").write_text("new requirement")
        self.assertNotEqual(second, sdlc.snapshot(root))

    def test_release_requires_authorization_both_components_and_smoke(self):
        candidate = "a" * 40
        release = sdlc.read(ROOT / ".ai-sdlc/templates/release/release.json")
        release.update(
            candidate=candidate,
            work_items=["TS-1"],
            authorization={
                "actor": "owner",
                "reference": "explicit deploy request",
                "candidate": candidate,
            },
            checks=[
                {
                    "id": id,
                    "candidate": candidate,
                    "status": "passed",
                    "source": "run URL",
                }
                for id in sdlc.RELEASE_CHECKS
            ],
            components=[
                {
                    "name": name,
                    "status": "pending",
                    "expected_image": "image:" + candidate,
                    "observed_image": "",
                    "revision": "",
                    "build_url": "",
                    "previous_image": "image:previous",
                }
                for name in ["backend", "frontend"]
            ],
        )
        self.assertEqual(sdlc.release_gate(release)["verdict"], "PASS")
        self.assertEqual(
            sdlc.release_gate(release, True)["verdict"], "INCOMPLETE_EVIDENCE"
        )
        for c in release["components"]:
            c.update(
                status="deployed",
                observed_image=c["expected_image"],
                revision="revision-1",
                build_url="build URL",
            )
        for id in ("production-smoke", "production-errors"):
            release["checks"].append(
                {
                    "id": id,
                    "candidate": candidate,
                    "status": "passed",
                    "source": "smoke report",
                }
            )
        self.assertEqual(sdlc.release_gate(release, True)["verdict"], "PASS")
        release["components"][1]["status"] = "failed"
        self.assertEqual(sdlc.release_gate(release, True)["verdict"], "BLOCKED")
        release["components"][1]["status"] = "deployed"
        release["checks"].append(
            {
                "id": "device-acceptance",
                "candidate": candidate,
                "status": "failed",
                "source": "device report",
            }
        )
        self.assertEqual(sdlc.release_gate(release)["verdict"], "BLOCKED")
        release["checks"][-1]["status"] = "skipped"
        self.assertEqual(sdlc.release_gate(release)["verdict"], "INCOMPLETE_EVIDENCE")
        release["checks"][-1]["status"] = "passed"
        release["checks"][-1]["candidate"] = "b" * 40
        self.assertEqual(sdlc.release_gate(release)["verdict"], "INCOMPLETE_EVIDENCE")
        release["checks"].pop()
        release["components"].append(
            {
                **release["components"][0],
                "name": "additional-service",
                "status": "failed",
            }
        )
        self.assertEqual(sdlc.release_gate(release, True)["verdict"], "BLOCKED")
        release["components"].pop()
        release["authorization"]["candidate"] = "b" * 40
        self.assertEqual(sdlc.release_gate(release)["verdict"], "INCOMPLETE_EVIDENCE")

    def test_snapshot_includes_criteria_but_excludes_progress(self):
        root = Path(self.temp.name) / "repo2"
        root.mkdir()
        subprocess.run(["git", "init", "-q", str(root)], check=True)
        ledger = root / "docs/sdlc/work-items/TS-1"
        ledger.mkdir(parents=True)
        path = ledger / "work-item.json"
        path.write_text(json.dumps(self.work))
        first = sdlc.snapshot(root)
        self.work["phase"] = "validate"
        path.write_text(json.dumps(self.work))
        self.assertEqual(first, sdlc.snapshot(root))
        self.work["acceptance_criteria"][0]["outcome"] = "Different behavior"
        path.write_text(json.dumps(self.work))
        self.assertNotEqual(first, sdlc.snapshot(root))

    def test_unrequired_current_failure_still_blocks(self):
        r = self.result("extra-check")
        r["status"] = "failed"
        self.results["results"].append(r)
        self.assertEqual(self.gate(), "BLOCKED")

    def test_light_record_allowed_for_standard_but_not_high(self):
        for name in ("requirements.md", "implementation.md", "test-plan.md"):
            (self.folder / name).unlink()
        (self.folder / "work-item.md").write_text("AC-001: plan, tests and evidence in one place")
        self.assertEqual(self.gate(), "PASS")
        self.work["risk"] = "high"
        self.save()
        result = sdlc.work_gate(self.folder, "validate", SNAP)
        self.assertTrue(any("requirements.md" in m for m in result["missing"]))

    def test_scoped_evidence_survives_unrelated_changes_but_not_its_own(self):
        scope = ["scripts/quality/routing.py"]
        r = self.result("unit")
        r.update(scope=scope, snapshot=sdlc.scoped_snapshot(scope, self.work))
        self.results["results"][0] = r
        self.save()
        # The full snapshot ("b"*64) no longer matches, but the scoped check is still current.
        self.assertEqual(sdlc.work_gate(self.folder, "validate", "b" * 64)["missing"], ["review: missing, stale or skipped"])
        r["snapshot"] = "c" * 64
        self.save()
        missing = sdlc.work_gate(self.folder, "validate", SNAP)["missing"]
        self.assertIn("unit: missing, stale or skipped", missing)

    def test_scoped_evidence_rejected_for_high_risk(self):
        self.work["risk"] = "high"
        self.results["results"][0]["scope"] = ["scripts/quality/routing.py"]
        self.save()
        with self.assertRaises(ValueError):
            sdlc.load_work(self.folder)

    def passing_release(self):
        candidate = "a" * 40
        release = sdlc.read(ROOT / ".ai-sdlc/templates/release/release.json")
        release.update(
            candidate=candidate,
            work_items=["TS-1"],
            authorization={"actor": "owner", "reference": "explicit request", "candidate": candidate},
            checks=[
                {"id": id, "candidate": candidate, "status": "passed", "source": "run URL"}
                for id in sdlc.RELEASE_CHECKS
            ],
            components=[
                {
                    "name": name,
                    "status": "pending",
                    "expected_image": "image:" + candidate,
                    "observed_image": "",
                    "revision": "",
                    "build_url": "",
                    "previous_image": "image:previous",
                }
                for name in ["backend", "frontend"]
            ],
        )
        return release

    def test_release_waivers_only_for_manual_checks(self):
        waiver = {"owner": "owner", "reason": "accepted risk", "expires": "2999-01-01", "reference": "chat"}
        release = self.passing_release()
        reviews = next(c for c in release["checks"] if c["id"] == "reviews")
        reviews.update(status="waived", waiver=waiver)
        self.assertEqual(sdlc.release_gate(release)["verdict"], "PASS_WITH_APPROVED_WAIVERS")
        reviews["waiver"] = dict(waiver, expires="2000-01-01")
        self.assertEqual(sdlc.release_gate(release)["verdict"], "BLOCKED")
        reviews.update(status="passed")
        reviews.pop("waiver")
        unit = next(c for c in release["checks"] if c["id"] == "unit-ci")
        unit.update(status="waived", waiver=waiver)
        self.assertEqual(sdlc.release_gate(release)["verdict"], "BLOCKED")

    def test_scoped_evidence_goes_stale_when_requirements_change(self):
        scope = ["scripts/quality/routing.py"]
        r = self.result("unit")
        r.update(scope=scope, snapshot=sdlc.scoped_snapshot(scope, self.work))
        self.results["results"][0] = r
        self.save()
        self.assertNotIn("unit: missing, stale or skipped", sdlc.work_gate(self.folder, "validate", SNAP)["missing"])
        self.work["acceptance_criteria"][0]["outcome"] = "Different behavior"
        self.save()
        self.assertIn("unit: missing, stale or skipped", sdlc.work_gate(self.folder, "validate", SNAP)["missing"])

    def test_scope_must_name_real_files(self):
        for bad in (["varavu_selavu_app/"], ["varavu_selavu_app"], ["scripts/*.py"], ["no/such/file.py"],
                    ["/etc/hosts"], ["../outside.py"]):
            with self.subTest(scope=bad):
                self.results["results"][0]["scope"] = bad
                self.save()
                with self.assertRaises(ValueError):
                    sdlc.load_work(self.folder)

    def test_existing_high_risk_approvals_keep_their_fingerprint(self):
        # Adding the optional work-item.md must not invalidate approvals recorded before it existed.
        folder = ROOT / "docs/sdlc/work-items/TS-SDLC-001"
        recorded = sdlc.read(folder / "work-item.json")["implementation_approval"]["fingerprint"]
        self.assertEqual(sdlc.plan_fingerprint(folder), recorded)

    def test_failed_migration_check_cannot_be_waived(self):
        release = self.passing_release()
        check = next(c for c in release["checks"] if c["id"] == "migration-compatibility")
        check.update(status="waived", waiver={"owner": "o", "reason": "r", "expires": "2999-01-01", "reference": "x"})
        self.assertEqual(sdlc.release_gate(release)["verdict"], "BLOCKED")
