"""Tests for qa/mobile/scripts/artifact_evidence.py (TS-QA-103, AC-001: artifact checksum / variant / endpoint)."""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[3] / "qa" / "mobile" / "scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("artifact_evidence", SCRIPTS / "artifact_evidence.py")
ae = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ae)
guard = ae.e2e_guard
URL = "http://localhost:18080"


class Evidence(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.app = self.dir / "TrackSpense.app"
        (self.app / "Frameworks").mkdir(parents=True)
        (self.app / "main.jsbundle").write_bytes(b"bundle-v1")
        (self.app / "Frameworks" / "a.dylib").write_bytes(b"lib")
        os.symlink("a.dylib", self.app / "Frameworks" / "link.dylib")
        self.ev = self.dir / "evidence.json"

    def tearDown(self):
        self.tmp.cleanup()

    def test_verify_accepts_the_artifact_that_was_written(self):
        ae.write(self.app, "ios", URL, self.ev)
        self.assertEqual(ae.verify(self.app, self.ev, "ios")["api_url"], URL)

    def test_digest_is_deterministic_and_content_sensitive(self):
        first = ae.digest(self.app)
        self.assertEqual(first, ae.digest(self.app))
        (self.app / "main.jsbundle").write_bytes(b"bundle-v2")
        self.assertNotEqual(first, ae.digest(self.app))

    def test_modified_artifact_is_refused(self):
        ae.write(self.app, "ios", URL, self.ev)
        (self.app / "main.jsbundle").write_bytes(b"tampered")
        with self.assertRaisesRegex(guard.GuardError, "differs"):
            ae.verify(self.app, self.ev, "ios")

    def test_added_file_and_retargeted_symlink_are_refused(self):
        ae.write(self.app, "ios", URL, self.ev)
        (self.app / "extra").write_bytes(b"x")
        with self.assertRaises(guard.GuardError):
            ae.verify(self.app, self.ev)
        (self.app / "extra").unlink()
        ae.verify(self.app, self.ev)
        (self.app / "Frameworks" / "link.dylib").unlink()
        os.symlink("elsewhere", self.app / "Frameworks" / "link.dylib")
        with self.assertRaises(guard.GuardError):
            ae.verify(self.app, self.ev)

    def test_wrong_platform_is_refused(self):
        ae.write(self.app, "ios", URL, self.ev)
        with self.assertRaisesRegex(guard.GuardError, "not 'android'"):
            ae.verify(self.app, self.ev, "android")

    def test_write_refuses_a_non_local_endpoint(self):
        for url in ("https://varavu-selavu-backend-952416556244.us-central1.run.app", "", "http://192.168.1.2:8080"):
            with self.subTest(url=url):
                with self.assertRaises(guard.GuardError):
                    ae.write(self.app, "ios", url, self.ev)

    def test_verify_refuses_edited_evidence(self):
        ae.write(self.app, "ios", URL, self.ev)
        data = json.loads(self.ev.read_text())
        for key, value in (("variant", "production"), ("api_url", "https://api.example.test")):
            bad = dict(data, **{key: value})
            self.ev.write_text(json.dumps(bad))
            with self.subTest(key=key):
                with self.assertRaises(guard.GuardError):
                    ae.verify(self.app, self.ev)

    def test_verify_refuses_missing_evidence_and_artifact(self):
        with self.assertRaises(guard.GuardError):
            ae.verify(self.app, self.dir / "nope.json")
        ae.write(self.app, "ios", URL, self.ev)
        with self.assertRaises(guard.GuardError):
            ae.verify(self.dir / "missing.app", self.ev)

    def test_apk_style_single_file_artifacts_work(self):
        apk = self.dir / "app.apk"
        apk.write_bytes(b"apk-bytes")
        ae.write(apk, "android", "http://10.0.2.2:18080", self.ev)
        ae.verify(apk, self.ev, "android")
        apk.write_bytes(b"other")
        with self.assertRaises(guard.GuardError):
            ae.verify(apk, self.ev, "android")


if __name__ == "__main__":
    unittest.main()
