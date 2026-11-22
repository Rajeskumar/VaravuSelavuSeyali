"""MCP operator controls. Run with poetry run python scripts/mcp_admin.py --help."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from varavu_selavu_service.db.session import SessionLocal
from varavu_selavu_service.db.mcp_models import (
    MCPGlobal,
    OAuthClient,
    MCPUserPolicy,
    MCPConnection,
)
from varavu_selavu_service.mcp.security import revoke_connections
from varavu_selavu_service.mcp.maintenance import cleanup
from varavu_selavu_service.oauth.cimd import redirect_allowed
from varavu_selavu_service.services.personal_write_lock import lock_personal_user


def main():
    parser = argparse.ArgumentParser(
        description="Manage default-off MCP integration. Every stop invalidates existing approval authority."
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init")
    register = commands.add_parser("register")
    register.add_argument("client_id")
    register.add_argument("name")
    register.add_argument("redirects", nargs="+")
    register.add_argument("--verified", action="store_true")
    global_command = commands.add_parser("global")
    global_command.add_argument("state", choices=["stop", "read-only", "writes"])
    block = commands.add_parser("block-client")
    block.add_argument("client_id")
    user = commands.add_parser("suspend-user")
    user.add_argument("email")
    resume = commands.add_parser("resume-user")
    resume.add_argument("email")
    unblock = commands.add_parser("unblock-client")
    unblock.add_argument("client_id")
    revoke = commands.add_parser("revoke")
    revoke.add_argument("email")
    revoke.add_argument("--connection")
    sweep = commands.add_parser("cleanup")
    sweep.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()
    with SessionLocal() as db:
        if args.command == "init":
            if db.get(MCPGlobal, 1) is None:
                db.add(MCPGlobal(id=1))
        elif args.command == "register":
            if (
                not 1 <= len(args.client_id) <= 512
                or not 1 <= len(args.name) <= 100
                or len(args.redirects) > 10
                or not all(redirect_allowed(u) for u in args.redirects)
            ):
                parser.error("Use bounded client IDs/names and exact HTTPS redirects")
            if db.get(OAuthClient, args.client_id):
                parser.error(
                    "Client already exists; do not silently change trusted callbacks"
                )
            db.add(
                OAuthClient(
                    client_id=args.client_id,
                    client_name=args.name,
                    redirect_uris=args.redirects,
                    verified=args.verified,
                )
            )
        elif args.command == "global":
            row = db.query(MCPGlobal).filter_by(id=1).with_for_update().one()
            row.disabled = args.state == "stop"
            row.writes_disabled = args.state != "writes"
            row.generation += 1
        elif args.command in ("block-client", "unblock-client"):
            row = (
                db.query(OAuthClient)
                .filter_by(client_id=args.client_id)
                .with_for_update()
                .one()
            )
            row.blocked = args.command == "block-client"
            if row.blocked:
                for conn in (
                    db.query(MCPConnection)
                    .filter_by(client_id=row.client_id)
                    .order_by(MCPConnection.user_email, MCPConnection.id)
                    .all()
                ):
                    revoke_connections(db, conn.user_email, "client_blocked", conn.id)
        elif args.command in ("suspend-user", "resume-user"):
            lock_personal_user(db, args.email)
            row = db.get(MCPUserPolicy, args.email) or MCPUserPolicy(
                user_email=args.email
            )
            row.suspended = args.command == "suspend-user"
            db.add(row)
            if row.suspended:
                revoke_connections(db, args.email, "operator_suspended")
        elif args.command == "revoke":
            revoke_connections(db, args.email, "operator_revoked", args.connection)
        elif args.command == "cleanup":
            if not 1 <= args.batch_size <= 1000:
                parser.error("Batch size must be 1..1000")
            print("Rows processed:", cleanup(db, args.batch_size))
        from varavu_selavu_service.mcp.audit import audit

        audit(
            db,
            None,
            "operator." + args.command,
            outcome=getattr(args, "state", "ok"),
            client_id=getattr(args, "client_id", None),
        )
        db.commit()
    print("MCP control updated.")


if __name__ == "__main__":
    main()
