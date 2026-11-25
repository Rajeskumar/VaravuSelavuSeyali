"""PostgreSQL discovery for the native E2E backend launcher (TS-QA-103).

First CI run on `ubuntu-latest` (now ubuntu-26.04, PostgreSQL 18) failed with "PostgreSQL server binaries not found": the lookup
only knew majors 14-16. Debian/Ubuntu keep the binaries in /usr/lib/postgresql/<major>/bin, which is not on PATH, and the major
changes with the runner image, so the lookup must scan versioned directories, not list majors.
"""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[3] / "qa" / "mobile" / "scripts"


def make_bin(root: Path, name: str, tools=("initdb", "pg_ctl")) -> Path:
    d = root / name / "bin"
    d.mkdir(parents=True)
    for tool in tools:
        f = d / tool
        f.write_text("#!/bin/sh\n")
        f.chmod(0o755)
    return d


def find(env_extra: dict, root: Path | None = None):
    env = {"PATH": "/usr/bin:/bin", "E2E_PG_EXTRA_DIRS": "", "HOME": "/nonexistent"}  # hermetic: no Homebrew, no real pg on PATH
    if root is not None:
        env["E2E_PG_LIB_ROOT"] = str(root)
    env.update(env_extra)
    return subprocess.run(["bash", "-c", f'source "{SCRIPTS / "pg_bin.sh"}"; find_pg_bin'], env=env, capture_output=True, text=True)


class FindPgBin(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "postgresql"
        self.root.mkdir()

    def test_picks_the_newest_installed_major_whatever_it_is(self):
        for major in ("14", "16", "18"):
            make_bin(self.root, major)
        r = find({}, self.root)
        self.assertEqual((r.returncode, r.stdout.strip()), (0, str(self.root / "18" / "bin")))

    def test_orders_majors_numerically_not_alphabetically(self):
        for major in ("9.6", "18", "10"):
            make_bin(self.root, major)
        self.assertEqual(find({}, self.root).stdout.strip(), str(self.root / "18" / "bin"))

    def test_skips_a_versioned_directory_that_has_no_server_binaries(self):
        make_bin(self.root, "16")
        make_bin(self.root, "18", tools=("psql",))  # client-only install
        self.assertEqual(find({}, self.root).stdout.strip(), str(self.root / "16" / "bin"))

    def test_a_pg_ctl_on_path_wins(self):
        make_bin(self.root, "18")
        on_path = make_bin(Path(self.tmp.name), "custom")
        r = find({"PATH": f"{on_path}:/usr/bin:/bin"}, self.root)
        self.assertEqual(r.stdout.strip(), str(on_path))

    def test_the_explicit_override_wins_over_everything(self):
        make_bin(self.root, "18")
        r = find({"E2E_PG_BIN": "/somewhere/else/bin"}, self.root)
        self.assertEqual(r.stdout.strip(), "/somewhere/else/bin")

    def test_extra_directories_such_as_homebrew_are_searched_last(self):
        brew = make_bin(Path(self.tmp.name), "brew")
        make_bin(self.root, "17")
        self.assertEqual(find({"E2E_PG_EXTRA_DIRS": str(brew)}, self.root).stdout.strip(), str(self.root / "17" / "bin"))
        empty = Path(self.tmp.name) / "empty"
        empty.mkdir()
        self.assertEqual(find({"E2E_PG_EXTRA_DIRS": str(brew)}, empty).stdout.strip(), str(brew))

    def test_nothing_found_fails_and_says_where_it_looked(self):
        r = find({}, self.root)
        self.assertEqual(r.returncode, 1)
        self.assertEqual(r.stdout, "")
        self.assertIn("E2E_PG_BIN", r.stderr)
        self.assertIn(str(self.root), r.stderr)


class LauncherUsesIt(unittest.TestCase):
    def test_the_launcher_sources_the_shared_lookup_and_lists_no_majors_itself(self):
        text = (SCRIPTS / "start-test-backend.sh").read_text()
        self.assertIn("pg_bin.sh", text)
        self.assertNotIn("/usr/lib/postgresql/16/bin", text)
        self.assertNotIn("find_pg_bin() {", text)


if __name__ == "__main__":
    unittest.main()
