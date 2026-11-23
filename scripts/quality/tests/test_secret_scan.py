from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from secret_scan import scan


class SecretScanTests(unittest.TestCase):
    def test_untracked_secret_reported_without_value(self):
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run(["git", "init", "-q", directory], check=True)
            token = "ghp_" + "x" * 36
            (Path(directory) / "untracked.txt").write_text("token=" + token)
            output = "\n".join(scan(directory))
            self.assertIn("untracked.txt:1", output)
            self.assertNotIn(token, output)

    def test_ordinary_text_and_binary(self):
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run(["git", "init", "-q", directory], check=True)
            (Path(directory) / "readme.md").write_text("ordinary documentation")
            (Path(directory) / "image.bin").write_bytes(b"\0binary")
            self.assertEqual(scan(directory), [])
