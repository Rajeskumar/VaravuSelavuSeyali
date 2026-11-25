"""Tests for the state-file validation in qa/mobile/scripts/seed.py: a state file is data from disk and must not be able
to point the harness (which mints bearer tokens and writes data) at a real database, API or proxy (TS-QA-103, AC-002)."""
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[3] / "qa" / "mobile" / "scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("seed", SCRIPTS / "seed.py")
seed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed)

GOOD = {
    "E2E_DATABASE_URL": "postgresql://postgres:pw@127.0.0.1:5432/trackspense_e2e_ios_1",
    "E2E_BACKEND_PORT": "18081",
    "E2E_API_HOST_URL": "http://127.0.0.1:18081",
    "E2E_PROXY_CONTROL_URL": "http://127.0.0.1:18082",
    "E2E_JWT_SECRET": "s" * 32,
    "E2E_RUN_ID": "1",
}


def load(**over):
    values = dict(GOOD, **over)
    with tempfile.NamedTemporaryFile("w", suffix=".env", delete=False) as fh:
        fh.write("\n".join(f"{k}={v}" for k, v in values.items() if v is not None) + "\n")
    try:
        return seed.load_state(fh.name)
    finally:
        Path(fh.name).unlink()


class StateValidation(unittest.TestCase):
    def test_accepts_a_state_written_by_the_launcher(self):
        self.assertEqual(load()["E2E_BACKEND_PORT"], "18081")

    def test_refuses_a_state_that_points_anywhere_else(self):
        for over in (
            {"E2E_DATABASE_URL": "postgresql://u@db.example.com/trackspense_e2e_x"},
            {"E2E_DATABASE_URL": "postgresql://localhost/trackspense_e2e_x?dbname=prod"},
            {"E2E_API_HOST_URL": "https://api.example.test"},
            {"E2E_API_HOST_URL": "http://127.0.0.1:18080"},          # the proxy port, not the backend's
            {"E2E_BACKEND_PORT": "abc"},
            {"E2E_PROXY_CONTROL_URL": "http://10.0.0.5:18082"},
            {"E2E_PROXY_CONTROL_URL": "http://127.0.0.1:18082/x"},
            {"E2E_JWT_SECRET": "short"},
        ):
            with self.subTest(over=over):
                with self.assertRaises(seed.e2e_guard.GuardError):
                    load(**over)


if __name__ == "__main__":
    unittest.main()
