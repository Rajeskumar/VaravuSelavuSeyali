"""qa/scripts/issue_qa_reset_token.py writes a live reset token, so it may only reach the local QA database."""
import importlib.util
import unittest
from pathlib import Path

_PATH = Path(__file__).resolve().parents[3] / "qa" / "scripts" / "issue_qa_reset_token.py"
_spec = importlib.util.spec_from_file_location("issue_qa_reset_token", _PATH)
script = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(script)

BASE = "postgresql://trackspense_qa:pw@localhost:5434/trackspense_qa"


class LocalQaDatabaseOnly(unittest.TestCase):
    def test_accepts_the_local_qa_database(self):
        self.assertTrue(script.is_local_qa_database(BASE))
        self.assertTrue(script.is_local_qa_database(BASE.replace("localhost", "127.0.0.1")))

    def test_refuses_anything_else(self):
        for url in (
            "",
            BASE.replace("localhost", "db.example.com"),
            BASE + "?host=db.example.com",
            BASE + "?hostaddr=10.1.1.1",
            BASE + "?service=prod",
            BASE.replace("/trackspense_qa", "/postgres"),
            "postgresql://localhost@db.example.com/trackspense_qa",
            "sqlite:////tmp/trackspense_qa",
            # Two "@": urllib takes the host after the last one, SQLAlchemy ends the password at the first.
            "postgresql://u:p@db.example.com,@localhost/trackspense_qa",
            "postgresql://u:p@[::1]@localhost/trackspense_qa",
            "postgresql://u@localhost,db.example.com/trackspense_qa",
        ):
            with self.subTest(url=url):
                self.assertFalse(script.is_local_qa_database(url))


if __name__ == "__main__":
    unittest.main()
