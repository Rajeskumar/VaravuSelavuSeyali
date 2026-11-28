"""The QA account scripts write accounts with known passwords, so they may only reach a local test database."""
import os
import subprocess
import sys
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[3] / "qa" / "scripts"
sys.path.insert(0, str(SCRIPTS))

LOCAL = "postgresql://postgres:pw@127.0.0.1:5434/"
REMOTE = "postgresql://postgres:pw@db.example.com:5432/trackspense_qa"


class LocalTestDatabaseOnly(unittest.TestCase):
    def test_accepts_the_local_qa_and_mobile_e2e_databases(self):
        import qa_db_guard

        for name in ("trackspense_qa", "trackspense_e2e_ios_112713123"):
            self.assertTrue(qa_db_guard.is_local_test_database(LOCAL + name), name)

    def test_refuses_anything_else(self):
        import qa_db_guard

        for url in ("", REMOTE, LOCAL + "postgres", LOCAL + "trackspense", LOCAL + "trackspense_e2e_",
                    LOCAL + "trackspense_qa?host=db.example.com", LOCAL + "trackspense_qa_prod",
                    "postgresql://u:p@db.example.com,@localhost/trackspense_qa",
                    "postgresql://u@localhost,db.example.com/trackspense_qa", "sqlite:////tmp/trackspense_qa"):
            with self.subTest(url=url):
                self.assertFalse(qa_db_guard.is_local_test_database(url))

    def test_each_script_refuses_a_remote_database_before_connecting(self):
        # The host does not resolve: reaching the driver would fail differently, and slowly.
        env = {"PATH": os.environ.get("PATH", ""), "QA_DATABASE_URL": REMOTE, "QA_SESSION_PASSWORD": "not-a-real-password"}
        for script, args in (("provision_qa_session_user.py", ["a@trackspense.qa", "A"]),
                             ("verify_qa_users.py", ["a@trackspense.qa"]),
                             ("issue_qa_reset_token.py", ["a@trackspense.qa"])):
            with self.subTest(script=script):
                done = subprocess.run([sys.executable, str(SCRIPTS / script), *args], env=env, capture_output=True, text=True, timeout=30)
                self.assertNotEqual(done.returncode, 0)
                self.assertIn("refusing", done.stderr)


if __name__ == "__main__":
    unittest.main()
