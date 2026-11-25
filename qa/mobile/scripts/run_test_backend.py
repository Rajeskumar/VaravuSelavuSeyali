#!/usr/bin/env python3
"""Runs backend commands for the native-E2E suite inside the isolation contract (TS-QA-103, AC-002).

    run_test_backend.py bootstrap                          (database: env E2E_DATABASE_URL)
    run_test_backend.py serve     --port N
    run_test_backend.py provision --email E --name N       (password: env E2E_USER_PASSWORD)

The database URL (it carries the throwaway cluster's password) is passed in the environment, never on argv.

Every command re-validates the database, builds the whole process environment from e2e_guard's allowlist
(nothing inherited: a shell GEMINI_API_KEY or a production DATABASE_URL cannot leak in), starts in an empty
working directory with an empty HOME, and runs the target through a prelude that turns python-dotenv into a
no-op and switches off pydantic's `env_file` BEFORE the app is imported. So no `.env` can contribute, whichever
directory the app (or alembic, which chdirs to varavu_selavu_app) later runs in.
Runs under any python3; the backend itself runs under the Poetry virtualenv's interpreter.
"""
from __future__ import annotations

import argparse
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e2e_guard  # noqa: E402

REPO = Path(__file__).resolve().parents[3]
APP_DIR = REPO / "varavu_selavu_app"

PRELUDE = (
    "import dotenv, dotenv.main, runpy, sys\n"
    "dotenv.load_dotenv = dotenv.main.load_dotenv = lambda *a, **k: False\n"
    "from varavu_selavu_service.core import config as _config\n"
    "_config.Settings.__config__.env_file = None\n"
)
SERVE_CODE = PRELUDE + (
    "import uvicorn\n"
    "uvicorn.run('varavu_selavu_service.main:app', host='127.0.0.1', port={port}, timeout_keep_alive=75)\n"
)
SCRIPT_CODE = PRELUDE + (
    "sys.argv = {argv!r}\n"
    "runpy.run_path({script!r}, run_name='__main__')\n"
)


def venv_python() -> str:
    explicit = os.environ.get("E2E_BACKEND_PYTHON")
    if explicit:
        return explicit
    out = subprocess.run(["poetry", "-C", str(APP_DIR), "env", "info", "-p"], check=True, capture_output=True, text=True)
    return str(Path(out.stdout.strip()) / "bin" / "python")


def scrubbed_env(database_url: str, home: str, extra: dict[str, str] | None = None) -> dict[str, str]:
    env = e2e_guard.build_backend_env(
        database_url,
        jwt_secret=os.environ.get("E2E_JWT_SECRET") or secrets.token_hex(16),
        base_path="/usr/bin:/bin:/usr/sbin:/sbin",
        home=home,
    )
    env["PYTHONPATH"] = str(APP_DIR)
    env["PYTHONSAFEPATH"] = "1"  # `python -c` must not put the working directory on sys.path
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env.update(extra or {})
    return env


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["bootstrap", "serve", "provision"])
    ap.add_argument("--port", type=int)
    ap.add_argument("--email")
    ap.add_argument("--name")
    ap.add_argument("--cwd", help="empty directory to run in (default: a fresh temporary one)")
    args = ap.parse_args()
    try:
        database_url = os.environ.get("E2E_DATABASE_URL", "")
        # An empty working directory and HOME: pydantic's `./.env`, ~/.pgpass and user-site must all find nothing.
        empty = args.cwd or tempfile.mkdtemp(prefix="ts-e2e-cwd-")
        env = scrubbed_env(database_url, home=empty)
        py = venv_python()
        if args.command == "bootstrap":
            script = REPO / "qa" / "scripts" / "bootstrap_schema.py"
            cmd = [py, "-c", SCRIPT_CODE.format(argv=[str(script)], script=str(script))]
        elif args.command == "provision":
            password = os.environ.get("E2E_USER_PASSWORD", "")
            if len(password) < 12 or not args.email or not args.name:
                raise e2e_guard.GuardError("provision needs --email, --name and E2E_USER_PASSWORD (>= 12 chars)")
            env["QA_SESSION_PASSWORD"] = password
            env["QA_DATABASE_URL"] = database_url
            script = REPO / "qa" / "scripts" / "provision_qa_session_user.py"
            cmd = [py, "-c", SCRIPT_CODE.format(argv=[str(script), args.email, args.name], script=str(script))]
        else:
            if not args.port:
                raise e2e_guard.GuardError("serve needs --port")
            e2e_guard.api_url_for("ios", args.port)  # port range check
            cmd = [py, "-c", SERVE_CODE.format(port=args.port)]
        os.chdir(empty)
        if args.command == "serve":
            # Replace this process so the caller's pid/signals refer to the backend itself.
            os.execve(cmd[0], cmd, env)
        try:
            return subprocess.run(cmd, env=env).returncode
        finally:
            if not args.cwd:
                os.chdir(tempfile.gettempdir())
                shutil.rmtree(empty, ignore_errors=True)
    except e2e_guard.GuardError as exc:
        print(f"REFUSED: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
