#!/usr/bin/env python3
"""Per-scenario fixtures and persisted-data checks for the native-E2E suite (TS-QA-103).

    seed.py provision --state FILE --name NAME            # -> JSON {"email","password"} (verified user, DB-inserted)
    seed.py expense   --state FILE --email E --description D --cost 12.5 [--category Food] [--date MM/DD/YYYY]
    seed.py count     --state FILE --email E --contains TEXT   # -> number of expenses whose description contains TEXT
    seed.py group     --state FILE --email E --name N [--guest "QA Guest"]   # -> JSON {group_id,name,me,guest}
    seed.py group-expense --state FILE --email E --group-id G --me M --guest-id U --description D --cost 30   # equal split
    seed.py invite    --state FILE --email OWNER --group-id G --member-id SEAT   # -> invite token for a name-only seat
    seed.py expect-member --state FILE --email OWNER --group-id G --member-email WHO [--absent]
    seed.py expect-proxy --state FILE --method POST --path /api/v1/expenses (--equals 1 | --at-most 1) [--faults 1] [--allow-ai false]   # proxy request log check
    seed.py expect-group-expense --state FILE --email E --group-id G --me M --guest-id U --contains TEXT --cost 30 --my-share 15 --guest-owes 15
    seed.py expect-count --state FILE --email E --contains TEXT --equals N [--cost 12.50]   # exit 1 unless exactly N (each costing exactly --cost)

Users are created straight in the disposable test database (no registration rate limit); data is created and
read through the real HTTP API with harness-minted tokens (no login rate limit).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import subprocess
import sys
from datetime import datetime
from decimal import Decimal
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import e2e_api  # noqa: E402
import e2e_guard  # noqa: E402


def load_state(path: str) -> dict[str, str]:
    state: dict[str, str] = {}
    for line in Path(path).read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            state[k] = v
    # A state file is data from disk: it must not be able to point the harness (which mints bearer tokens and
    # writes data) at a real database or API.
    e2e_guard.validate_database_url(state["E2E_DATABASE_URL"])
    port = state.get("E2E_BACKEND_PORT", "")
    if not port.isdigit() or state.get("E2E_API_HOST_URL") != f"http://127.0.0.1:{int(port)}":
        raise e2e_guard.GuardError("state file API URL must be http://127.0.0.1:<E2E_BACKEND_PORT>")
    control = state.get("E2E_PROXY_CONTROL_URL", "")
    if control and not re.fullmatch(r"http://127\.0\.0\.1:[0-9]{4,5}", control):
        raise e2e_guard.GuardError("state file proxy control URL must be http://127.0.0.1:<port>")
    if len(state.get("E2E_JWT_SECRET", "")) < 16:
        raise e2e_guard.GuardError("state file JWT secret missing or too short")
    return state


def api_for(state: dict[str, str], email: str) -> e2e_api.Api:
    return e2e_api.Api(state["E2E_API_HOST_URL"], state["E2E_JWT_SECRET"], email)


def provision(state: dict[str, str], name: str) -> dict[str, str]:
    safe = "".join(c for c in name.lower() if c.isalnum()) or "user"
    email = f"qa.mobile.{state['E2E_RUN_ID']}.{safe}.{secrets.token_hex(3)}@trackspense.qa"
    password = "Qa_" + secrets.token_urlsafe(12) + "!"
    env = dict(os.environ, E2E_USER_PASSWORD=password, E2E_JWT_SECRET=state["E2E_JWT_SECRET"],
               E2E_DATABASE_URL=state["E2E_DATABASE_URL"])  # by environment: the URL carries the cluster password
    done = subprocess.run(
        [sys.executable, str(HERE / "run_test_backend.py"), "provision", "--email", email, "--name", f"QA Mobile {safe}"],
        env=env, capture_output=True, text=True,
    )
    if done.returncode != 0:
        raise RuntimeError(f"provision failed: {done.stderr.strip() or done.stdout.strip()}")
    return {"email": email, "password": password}


def create_group_expense(state: dict[str, str], email: str, gid: str, me: str, guest: str, description: str, cost: str) -> None:
    api = api_for(state, email)
    body = {"date": datetime.now().strftime("%m/%d/%Y"), "description": description, "category": "Food & Dining",
            "amount": float(cost), "payers": [{"member_id": me, "amount_paid": float(cost)}],
            "split": {"type": "equal", "entries": [{"member_id": me}, {"member_id": guest}]}}
    status, data = api.call("POST", f"/api/v1/groups/{gid}/expenses", body)
    if status != 201:
        raise RuntimeError(f"create group expense -> {status}: {data}")


def create_invite(state: dict[str, str], email: str, gid: str, member_id: str) -> str:
    status, data = api_for(state, email).call("POST", f"/api/v1/groups/{gid}/invites", {"member_id": member_id})
    if status != 201:
        raise RuntimeError(f"create invite -> {status}: {data}")
    return data["token"]


def expect_member(state: dict[str, str], email: str, gid: str, member_email: str, absent: bool) -> None:
    status, detail = api_for(state, email).call("GET", f"/api/v1/groups/{gid}")
    if status != 200:
        raise RuntimeError(f"get group -> {status}: {detail}")
    present = any((m.get("user_email") or "").lower() == member_email.lower() for m in detail["members"])
    if present == absent:
        raise RuntimeError(f"{member_email} is {'a member' if present else 'not a member'} of the group; expected {'absent' if absent else 'present'}")


def proxy_log(state: dict[str, str]) -> list[dict]:
    import urllib.request

    with urllib.request.urlopen(state["E2E_PROXY_CONTROL_URL"] + "/log", timeout=10) as resp:
        return json.load(resp)


def expect_proxy(state: dict[str, str], method: str, path: str, equals: int | None, faults: int | None,
                 at_most: int | None = None, allow_ai: str | None = None) -> None:
    """The proxy saw exactly `equals` (or at most `at_most`) requests to method+path (an app that resubmitted would show 2),
    `faults` of them dropped, and every one carried `allow_ai` (the consent choice) when given."""
    if (equals is None) == (at_most is None):
        raise RuntimeError("give exactly one of --equals or --at-most")
    matching = [e for e in proxy_log(state) if e["method"] == method and e["path"] == path]
    if equals is not None and len(matching) != equals:
        raise RuntimeError(f"expected {equals} {method} {path} request(s) through the proxy, saw {len(matching)}: {matching}")
    if at_most is not None and len(matching) > at_most:
        raise RuntimeError(f"expected at most {at_most} {method} {path} request(s) through the proxy, saw {len(matching)}: {matching}")
    if allow_ai is not None:
        wrong = [e for e in matching if e.get("allow_ai") != allow_ai]
        if wrong:
            raise RuntimeError(f"every {method} {path} request must carry allow_ai={allow_ai}; saw {wrong}")
    if faults is not None and sum(1 for e in matching if e["fault"]) != faults:
        raise RuntimeError(f"expected {faults} injected fault(s) on {method} {path}, saw {sum(1 for e in matching if e['fault'])}")


def _dec(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"))


def create_group(state: dict[str, str], email: str, name: str, guest: str) -> dict[str, str]:
    api = api_for(state, email)
    status, group = api.call("POST", "/api/v1/groups", {"name": name, "group_type": "other", "currency": "USD"})
    if status != 201:
        raise RuntimeError(f"create group -> {status}: {group}")
    gid = group["group_id"]
    status, member = api.call("POST", f"/api/v1/groups/{gid}/members", {"display_name": guest})  # name-only seat
    if status != 201:
        raise RuntimeError(f"add member -> {status}: {member}")
    status, detail = api.call("GET", f"/api/v1/groups/{gid}")
    me = next(m["member_id"] for m in detail["members"] if m.get("user_email") == email)
    return {"group_id": gid, "name": name, "me": me, "guest": member["member_id"]}


def expect_group_expense(state: dict[str, str], email: str, gid: str, me: str, guest: str, contains: str,
                         cost: str, my_share: str, guest_owes: str) -> None:
    """Exactly one matching group expense with the stored split, and the guest's debt as the viewer sees it:
    from the balance transfers involving the viewer (guest -> me), never another member's net, and in the right
    direction (the viewer owes the guest nothing). Amounts are compared as exact decimals."""
    api = api_for(state, email)
    status, data = api.call("GET", f"/api/v1/groups/{gid}/expenses")
    if status != 200:
        raise RuntimeError(f"list group expenses -> {status}")
    matches = [e for e in data["items"] if contains in (e.get("description") or "")]
    if len(matches) != 1:
        raise RuntimeError(f"expected exactly 1 group expense containing {contains!r}, found {len(matches)}")
    e = matches[0]
    if _dec(e["cost"]) != _dec(cost) or _dec(e["my_share"]) != _dec(my_share):
        raise RuntimeError(f"stored cost/share {e['cost']}/{e['my_share']} != {cost}/{my_share}")
    status, bal = api.call("GET", f"/api/v1/groups/{gid}/balances")
    if status != 200:
        raise RuntimeError(f"balances -> {status}")
    owed_to_me = sum((_dec(t["amount"]) for t in bal["transfers"] if t["to_member_id"] == me and t["from_member_id"] == guest),
                     Decimal("0"))
    i_owe = sum((_dec(t["amount"]) for t in bal["transfers"] if t["from_member_id"] == me), Decimal("0"))
    if owed_to_me != _dec(guest_owes) or i_owe != 0:
        raise RuntimeError(f"guest->me transfers {owed_to_me} (expected {guest_owes}), me->anyone {i_owe} (expected 0): {bal['transfers']}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["provision", "expense", "count", "expect-count", "group", "group-expense", "expect-group-expense", "expect-proxy", "invite", "expect-member"])
    ap.add_argument("--group-id")
    ap.add_argument("--guest", default="QA Guest")
    ap.add_argument("--my-share")
    ap.add_argument("--guest-owes")
    ap.add_argument("--me")
    ap.add_argument("--method")
    ap.add_argument("--member-id")
    ap.add_argument("--member-email")
    ap.add_argument("--absent", action="store_true")
    ap.add_argument("--path")
    ap.add_argument("--faults", type=int)
    ap.add_argument("--guest-id")
    ap.add_argument("--state", required=True)
    ap.add_argument("--name")
    ap.add_argument("--email")
    ap.add_argument("--description")
    ap.add_argument("--cost")
    ap.add_argument("--category", default="Food")
    ap.add_argument("--date")
    ap.add_argument("--contains")
    ap.add_argument("--equals", type=int)
    ap.add_argument("--at-most", type=int)
    ap.add_argument("--allow-ai", choices=["true", "false"])
    a = ap.parse_args()
    try:
        state = load_state(a.state)
        if a.command == "provision":
            print(json.dumps(provision(state, a.name or "user")))
        elif a.command == "expense":
            api = api_for(state, a.email)
            body = {"user_id": a.email, "cost": float(a.cost), "category": a.category, "description": a.description,
                    "date": a.date or datetime.now().strftime("%m/%d/%Y")}
            status, data = api.call("POST", "/api/v1/expenses", body)
            if status != 201:
                raise RuntimeError(f"create expense -> {status}: {data}")
            print(json.dumps(data))
        elif a.command == "group":
            print(json.dumps(create_group(state, a.email, a.name, a.guest)))
        elif a.command == "invite":
            print(json.dumps({"token": create_invite(state, a.email, a.group_id, a.member_id)}))
        elif a.command == "expect-member":
            expect_member(state, a.email, a.group_id, a.member_email, a.absent)
        elif a.command == "expect-proxy":
            expect_proxy(state, a.method, a.path, a.equals, a.faults, a.at_most, a.allow_ai)
        elif a.command == "group-expense":
            create_group_expense(state, a.email, a.group_id, a.me, a.guest_id, a.description, a.cost)
        elif a.command == "expect-group-expense":
            expect_group_expense(state, a.email, a.group_id, a.me, a.guest_id, a.contains, a.cost, a.my_share, a.guest_owes)
        else:
            matches = [e for e in api_for(state, a.email).expenses() if a.contains in (e.get("description") or "")]
            if a.command == "count":
                print(len(matches))
            elif len(matches) != a.equals:
                print(f"expected exactly {a.equals} expense(s) containing {a.contains!r}, found {len(matches)}", file=sys.stderr)
                return 1
            elif a.cost is not None and any(_dec(e["cost"]) != _dec(a.cost) for e in matches):
                print(f"expected cost {a.cost}, found {[e['cost'] for e in matches]}", file=sys.stderr)
                return 1
    except (e2e_guard.GuardError, RuntimeError, KeyError, OSError, ValueError) as exc:  # ValueError covers JSON decode errors
        print(f"seed.py: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
