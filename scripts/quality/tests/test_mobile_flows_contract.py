"""Contracts between the Maestro flows/scripts and the Android system images they run on (TS-QA-103)."""
import re
import unittest
from pathlib import Path

import yaml  # scripts/quality/requirements.txt

MOBILE = Path(__file__).resolve().parents[3] / "qa" / "mobile"


class PhotoPicker(unittest.TestCase):
    def android_ids(self):
        docs = list(yaml.safe_load_all((MOBILE / "subflows" / "pick-library-photo.yaml").read_text()))
        branch = next(c["runFlow"] for c in docs[1] if "runFlow" in c and c["runFlow"].get("when", {}).get("platform") == "Android")
        ids = []
        for cmd in branch["commands"]:
            for value in cmd.values():
                target = value.get("visible", value) if isinstance(value, dict) else None
                if isinstance(target, dict) and "id" in target:
                    ids.append(target["id"])
        return ids

    def test_the_android_picker_selector_matches_both_the_google_and_the_plain_android_image(self):
        # Local emulators use the Google APIs image (com.google.android.providers.media.module); the CI emulator used the plain
        # image (com.android.providers.media.module) and the flow tapped an id that did not exist there.
        ids = self.android_ids()
        self.assertTrue(ids)
        for selector in ids:
            for package in ("com.google.android.providers.media.module", "com.android.providers.media.module"):
                with self.subTest(selector=selector, package=package):
                    self.assertTrue(re.fullmatch(selector, f"{package}:id/icon_thumbnail"))


class AnrDialogs(unittest.TestCase):
    def test_both_emulator_paths_hide_system_error_dialogs(self):
        # A system "isn't responding" dialog stays on top until dismissed and fails every later flow.
        for script in ("android-emu.sh", "run.sh"):
            with self.subTest(script=script):
                self.assertIn("settings put global hide_error_dialogs 1", (MOBILE / "scripts" / script).read_text())

    def test_an_emulator_we_did_not_start_gets_its_dialog_setting_back(self):
        # E2E_REUSE_EMULATOR=1 attaches to a developer's own emulator: hiding crash/ANR dialogs there must not outlive the run.
        text = (MOBILE / "scripts" / "run.sh").read_text()
        self.assertIn("settings get global hide_error_dialogs", text)
        cleanup = text[text.index("cleanup() {"):text.index("trap cleanup EXIT")]
        self.assertIn("hide_error_dialogs", cleanup)


if __name__ == "__main__":
    unittest.main()
