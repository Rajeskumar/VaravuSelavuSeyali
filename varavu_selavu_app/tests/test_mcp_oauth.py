from datetime import timedelta
import base64
import hashlib
from urllib.parse import urlencode, urlsplit, parse_qs
import uuid
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from varavu_selavu_service.db.session import get_db
from varavu_selavu_service.oauth.routes import router
from varavu_selavu_service.auth.security import (
    create_access_token,
)
from varavu_selavu_service.db.mcp_models import (
    MCPRefreshToken,
    MCPConnection,
)
from varavu_selavu_service.mcp.security import (
    utcnow,
    mint_access,
    authenticate,
    MCPError,
)
from varavu_selavu_service.core.csrf import CSRFMiddleware
from test_mcp import mcp as mcp


@pytest.fixture
def oauth(mcp):
    db, p, c = mcp
    app = FastAPI()
    app.include_router(router)
    app.add_middleware(CSRFMiddleware)
    app.dependency_overrides[get_db] = lambda: db

    @app.exception_handler(MCPError)
    async def errors(request, exc):
        from fastapi.responses import JSONResponse

        return JSONResponse(
            {"error": exc.code}, exc.status if exc.status != 200 else 400
        )

    with TestClient(app, base_url="https://api.trackspense.com") as client:
        yield client, db, p, c


def authorize(client, p, db):
    verifier = "a" * 64
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .rstrip(b"=")
        .decode()
    )
    from varavu_selavu_service.core.config import Settings

    resource = Settings().MCP_RESOURCE_URL
    response = client.get(
        "/oauth/authorize",
        params={
            "client_id": "test-client",
            "response_type": "code",
            "redirect_uri": "https://client.example/callback",
            "state": "test-state",
            "resource": resource,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "scope": "categories:read expenses:read expenses:create",
        },
        follow_redirects=False,
    )
    assert response.status_code == 303, response.text
    rid = response.headers["location"].split("/")[-1]
    from varavu_selavu_service.auth.service import AuthService

    family = uuid.uuid4()
    AuthService(db).register_refresh_token(
        uuid.uuid4(),
        family,
        p.user_email,
        utcnow() + timedelta(days=1),
        authenticated_at=utcnow(),
    )
    browser_token = create_access_token(
        {"sub": p.user_email, "auth_time": utcnow().timestamp(), "sid": str(family)}
    )
    client.cookies.set("vs_token", browser_token)
    client.cookies.set("vs_csrf", "test-csrf")
    headers = {"X-CSRF-Token": "test-csrf"}
    info = client.get("/api/v1/mcp/consent/" + rid, headers=headers)
    assert info.status_code == 200, info.text
    response = client.post(
        "/api/v1/mcp/consent/" + rid,
        headers=headers,
        json={
            "approve": True,
            "scopes": ["categories:read", "expenses:read", "expenses:create"],
        },
    )
    assert response.status_code == 200, response.text
    code = parse_qs(urlsplit(response.json()["redirect_url"]).query)["code"][0]
    return dict(
        client_id="test-client",
        grant_type="authorization_code",
        code=code,
        code_verifier=verifier,
        redirect_uri="https://client.example/callback",
        resource=resource,
    )


def test_oauth_code_pkce_rotation_reuse(oauth):
    client, db, p, c = oauth
    values = authorize(client, p, db)
    bad = client.post("/oauth/token", data={**values, "code_verifier": "b" * 64})
    assert bad.status_code == 400 and bad.json()["error"] == "invalid_grant"
    response = client.post("/oauth/token", data=values)
    assert response.status_code == 200, response.text
    tokens = response.json()
    principal = authenticate(db, tokens["access_token"])
    refresh = {
        "client_id": "test-client",
        "grant_type": "refresh_token",
        "resource": values["resource"],
        "refresh_token": tokens["refresh_token"],
    }
    result = client.post("/oauth/token", data=refresh)
    assert result.status_code == 200, result.text
    assert result.json()["refresh_token"] != tokens["refresh_token"]
    reused = client.post("/oauth/token", data=refresh)
    assert reused.status_code == 400
    with pytest.raises(MCPError):
        authenticate(db, result.json()["access_token"])
    assert db.get(MCPConnection, principal.connection_id).status == "revoked"


def test_foreign_redirect_rejected_without_redirect(oauth):
    client, db, p, c = oauth
    response = client.get(
        "/oauth/authorize",
        params={
            "client_id": "test-client",
            "response_type": "code",
            "redirect_uri": "https://evil.example/cb",
            "resource": "https://api.trackspense.com/mcp",
            "state": "x",
            "code_challenge": "a" * 43,
            "code_challenge_method": "S256",
        },
        follow_redirects=False,
    )
    assert response.status_code == 400 and "location" not in response.headers


def test_cookie_csrf_and_stale_session(oauth):
    client, db, p, c = oauth
    token = create_access_token(
        {
            "sub": p.user_email,
            "auth_time": (utcnow() - timedelta(days=1)).timestamp(),
            "sid": str(uuid.uuid4()),
        }
    )
    client.cookies.set("vs_token", token)
    response = client.get("/api/v1/mcp/consent/nonexistent")
    assert response.status_code == 403
    client.cookies.set("vs_token", token)
    response = client.post(
        "/api/v1/mcp/consent/nonexistent",
        json={"approve": True, "scopes": ["categories:read"]},
    )
    assert response.status_code == 403


def test_sdk_transport_auth_and_tools(mcp, monkeypatch):
    db, p, c = mcp
    from varavu_selavu_service.mcp import server as module
    from contextlib import contextmanager

    @contextmanager
    def session():
        yield db

    monkeypatch.setattr(module, "SessionLocal", session)
    monkeypatch.setenv("MCP_RESOURCE_URL", "https://api.trackspense.com/mcp")
    monkeypatch.setenv("MCP_ISSUER", "https://api.trackspense.com")
    sdk, gateway = module.build_app()
    app = FastAPI(lifespan=sdk.router.lifespan_context)
    app.mount("/", gateway)
    with TestClient(app, base_url="https://api.trackspense.com") as client:
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "1"},
            },
        }
        assert client.post("/mcp", json=request).status_code == 401
        headers = {
            "Authorization": "Bearer " + mint_access(c),
            "Accept": "application/json, text/event-stream",
        }
        response = client.post("/mcp", json=request, headers=headers)
        assert response.status_code == 200, response.text
        response = client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            headers={**headers, "MCP-Protocol-Version": "2025-03-26"},
        )
        assert response.status_code == 200, response.text
        tools = response.json()["result"]["tools"]
        assert "save_expense" in {t["name"] for t in tools}
        assert "create_expense" not in {t["name"] for t in tools}
        response = client.post(
            "/mcp",
            json={
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "list_categories", "arguments": {}},
            },
            headers={**headers, "MCP-Protocol-Version": "2025-03-26"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["result"]["structuredContent"]["categories"]


def test_revocation_uses_presented_token_not_browser_cookie(oauth):
    client, db, p, c = oauth
    values = authorize(client, p, db)
    tokens = client.post("/oauth/token", data=values).json()
    principal = authenticate(db, tokens["access_token"])
    assert (
        client.post(
            "/oauth/revoke",
            data={"client_id": "test-client", "token": tokens["refresh_token"]},
        ).status_code
        == 200
    )
    with pytest.raises(MCPError):
        authenticate(db, tokens["access_token"])
    assert db.get(MCPConnection, principal.connection_id).status == "revoked"
    assert (
        client.post(
            "/oauth/revoke", data={"client_id": "test-client", "token": "unknown"}
        ).status_code
        == 200
    )


def test_cimd_rejects_non_allowlisted_and_private_dns(monkeypatch):
    from varavu_selavu_service.oauth.cimd import fetch_metadata

    with pytest.raises(ValueError):
        fetch_metadata("http://127.0.0.1/metadata")
    monkeypatch.setenv("MCP_CIMD_ALLOWED_HOSTS", '["client.example"]')

    async def private_dns(host):
        return ["127.0.0.1"]

    monkeypatch.setattr(
        "varavu_selavu_service.oauth.cimd.resolve_addresses", private_dns
    )
    with pytest.raises(ValueError, match="metadata_address_not_allowed"):
        fetch_metadata("https://client.example/metadata")


def test_oauth_access_logs_drop_query_values():
    import logging
    from varavu_selavu_service.oauth.logging import RedactOAuthQuery

    record = logging.LogRecord(
        "uvicorn.access",
        20,
        "",
        1,
        "%s %s %s %s %s",
        ("ip", "GET", "/oauth/authorize?state=sensitive", "1.1", 303),
        None,
    )
    assert RedactOAuthQuery().filter(record)
    assert "sensitive" not in record.getMessage()


def test_refresh_absolute_and_idle_lifetimes_do_not_extend(oauth, monkeypatch):
    from varavu_selavu_service.oauth import server
    from varavu_selavu_service.mcp.security import digest, aware

    client, db, p, _ = oauth
    values = authorize(client, p, db)
    start = utcnow()
    monkeypatch.setattr(server, "utcnow", lambda: start)
    initial = client.post("/oauth/token", data=values).json()
    row = db.get(MCPRefreshToken, digest(initial["refresh_token"]))
    assert aware(row.absolute_expires_at) == start + timedelta(days=30)
    assert aware(row.expires_at) == start + timedelta(days=14)
    refresh = dict(
        client_id="test-client",
        grant_type="refresh_token",
        resource=values["resource"],
        refresh_token=initial["refresh_token"],
    )
    for day in (13, 26):
        monkeypatch.setattr(server, "utcnow", lambda: start + timedelta(days=day))
        response = client.post("/oauth/token", data=refresh)
        assert response.status_code == 200, response.text
        refresh["refresh_token"] = response.json()["refresh_token"]
        successor = db.get(MCPRefreshToken, digest(refresh["refresh_token"]))
        assert aware(successor.absolute_expires_at) == start + timedelta(days=30)
        assert aware(successor.expires_at) == start + timedelta(days=min(day + 14, 30))
    monkeypatch.setattr(server, "utcnow", lambda: start + timedelta(days=30))
    assert client.post("/oauth/token", data=refresh).status_code == 400


@pytest.mark.parametrize("endpoint", ["token", "revoke"])
def test_oauth_body_deadline_without_database_access(endpoint, monkeypatch):
    import anyio
    from fastapi import HTTPException
    from starlette.requests import Request
    from varavu_selavu_service.oauth import routes

    monkeypatch.setattr(routes, "FORM_READ_SECONDS", 0.01, raising=False)

    class NoDatabase:
        def __getattr__(self, name):
            pytest.fail("Database accessed before the body was received: " + name)

    async def receive():
        await anyio.sleep_forever()

    async def run():
        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/oauth/" + endpoint,
                "headers": [(b"content-type", b"application/x-www-form-urlencoded")],
            },
            receive,
        )
        with anyio.fail_after(0.5):
            with pytest.raises(HTTPException) as error:
                await getattr(routes, endpoint)(request, NoDatabase())
        assert error.value.status_code == 408

    anyio.run(run)


@pytest.mark.parametrize("endpoint", ["token", "revoke"])
def test_oauth_database_work_does_not_block_event_loop(endpoint, monkeypatch, mcp):
    import anyio
    import threading
    from starlette.requests import Request
    from varavu_selavu_service.oauth import routes
    from varavu_selavu_service.core.config import Settings

    async def run():
        loop_thread = threading.get_ident()

        def assert_worker(*args, **kwargs):
            assert threading.get_ident() != loop_thread

        class FakeDB:
            def commit(self):
                assert_worker()

            def rollback(self):
                assert_worker()

            def get(self, *args, **kwargs):
                assert_worker()
                return None

        class FakeServer:
            def __init__(self, db):
                assert_worker()

            def create_token_response(self, *args):
                assert_worker()
                return 400, {"error": "invalid_grant"}, []

        monkeypatch.setattr(routes, "controls", assert_worker)
        monkeypatch.setattr(routes, "reserve", assert_worker)
        monkeypatch.setattr(routes, "Server", FakeServer)

        async def receive():
            return {
                "type": "http.request",
                "body": urlencode({"resource": Settings().MCP_RESOURCE_URL}).encode(),
                "more_body": False,
            }

        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/oauth/" + endpoint,
                "headers": [(b"content-type", b"application/x-www-form-urlencoded")],
            },
            receive,
        )
        await getattr(routes, endpoint)(request, FakeDB())

    anyio.run(run)


def test_cimd_deadline_includes_dns(monkeypatch):
    import anyio
    from varavu_selavu_service.oauth import cimd

    monkeypatch.setenv("MCP_CIMD_ALLOWED_HOSTS", '["client.example"]')
    monkeypatch.setattr(cimd, "METADATA_TIMEOUT_SECONDS", 0.02)

    async def slow_dns(*args, **kwargs):
        await anyio.sleep_forever()

    monkeypatch.setattr(cimd.dns.asyncresolver, "resolve", slow_dns)
    with pytest.raises(ValueError, match="metadata_timeout"):
        cimd.fetch_metadata("https://client.example/metadata")


@pytest.mark.parametrize("phase", ["headers", "body"])
def test_cimd_deadline_stops_trickled_responses(monkeypatch, phase):
    import asyncio
    import anyio
    from varavu_selavu_service.oauth import cimd

    monkeypatch.setattr(cimd, "METADATA_TIMEOUT_SECONDS", 0.1)

    async def run():
        tasks = set()

        async def serve(reader, writer):
            task = asyncio.current_task()
            tasks.add(task)
            try:
                await reader.readuntil(b"\r\n\r\n")
                if phase == "body":
                    writer.write(
                        b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100000\r\n\r\n"
                    )
                else:
                    writer.write(b"HTTP/1.1 200 OK\r\nX-Slow: ")
                while True:
                    writer.write(b" ")
                    await writer.drain()
                    await asyncio.sleep(0.005)
            except (ConnectionError, asyncio.CancelledError):
                pass
            finally:
                writer.close()
                await writer.wait_closed()
                tasks.discard(task)

        server = await asyncio.start_server(serve, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        try:
            with anyio.fail_after(1):
                with pytest.raises(ValueError, match="metadata_timeout"):
                    # Exercise transport against a local peer; production entry requires HTTPS.
                    await cimd.fetch_metadata_async(f"http://127.0.0.1:{port}/metadata")
        finally:
            server.close()
            await server.wait_closed()
            for task in list(tasks):
                task.cancel()
            await asyncio.gather(*list(tasks), return_exceptions=True)

    anyio.run(run)


def test_refresh_rejected_at_inactivity_boundary(oauth, monkeypatch):
    from varavu_selavu_service.oauth import server

    client, db, p, _ = oauth
    values = authorize(client, p, db)
    start = utcnow()
    monkeypatch.setattr(server, "utcnow", lambda: start)
    response = client.post("/oauth/token", data=values)
    assert response.status_code == 200
    monkeypatch.setattr(server, "utcnow", lambda: start + timedelta(days=14))
    result = client.post(
        "/oauth/token",
        data=dict(
            client_id="test-client",
            grant_type="refresh_token",
            resource=values["resource"],
            refresh_token=response.json()["refresh_token"],
        ),
    )
    assert result.status_code == 400 and result.json()["error"] == "invalid_grant"


@pytest.mark.parametrize("endpoint", ["token", "revoke"])
def test_oauth_route_times_out_before_checking_out_database(endpoint, monkeypatch):
    import anyio
    import httpx
    from varavu_selavu_service.oauth import routes

    monkeypatch.setattr(routes, "FORM_READ_SECONDS", 0.01)
    app = FastAPI()
    app.include_router(router)

    class NoDatabase:
        def __getattr__(self, name):
            pytest.fail("Slow body checked out database: " + name)

    app.dependency_overrides[get_db] = lambda: NoDatabase()

    async def slow_body():
        yield b"client_id="
        await anyio.sleep_forever()

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="https://api.example"
        ) as client:
            with anyio.fail_after(0.5):
                response = await client.post(
                    "/oauth/" + endpoint,
                    content=slow_body(),
                    headers={"content-type": "application/x-www-form-urlencoded"},
                )
            assert response.status_code == 408

    anyio.run(run)


def test_oauth_capacity_released_after_malformed_body(monkeypatch):
    import anyio
    from fastapi import HTTPException
    from starlette.requests import Request
    from varavu_selavu_service.oauth import routes

    async def run():
        limiter = anyio.CapacityLimiter(1)
        monkeypatch.setattr(routes, "_oauth_capacity", limiter)
        request = Request(
            {"type": "http", "method": "POST", "path": "/oauth/token", "headers": []}
        )
        with pytest.raises(HTTPException) as error:
            await routes.oauth_form(request)
        assert error.value.status_code == 400
        assert limiter.borrowed_tokens == 0
        async with anyio.create_task_group() as group:
            ready = anyio.Event()

            async def occupy():
                async with limiter:
                    ready.set()
                    await anyio.sleep_forever()

            group.start_soon(occupy)
            await ready.wait()
            with pytest.raises(HTTPException) as error:
                await routes.oauth_form(request)
            assert error.value.status_code == 429
            group.cancel_scope.cancel()
        assert limiter.borrowed_tokens == 0

    anyio.run(run)


@pytest.mark.parametrize(
    "addresses", [["8.8.8.8", "127.0.0.1"], ["::1"], ["::ffff:127.0.0.1"]]
)
def test_cimd_rejects_any_nonpublic_resolved_address(monkeypatch, addresses):
    from varavu_selavu_service.oauth import cimd

    monkeypatch.setenv("MCP_CIMD_ALLOWED_HOSTS", '["client.example"]')

    async def resolve(host):
        return addresses

    monkeypatch.setattr(cimd, "resolve_addresses", resolve)
    with pytest.raises(ValueError, match="metadata_address_not_allowed"):
        cimd.fetch_metadata("https://client.example/metadata")


def test_cimd_disallows_ip_literal_even_when_allowlisted(monkeypatch):
    from varavu_selavu_service.oauth.cimd import fetch_metadata

    monkeypatch.setenv("MCP_CIMD_ALLOWED_HOSTS", '["127.0.0.1"]')
    with pytest.raises(ValueError, match="metadata_host_not_allowed"):
        fetch_metadata("https://127.0.0.1/metadata")


@pytest.mark.parametrize(
    "status,headers,body,error",
    [
        (200, b"Content-Type: application/json\r\n", b'{"client_id":"ok"}', None),
        (
            302,
            b"Location: http://127.0.0.1/private\r\n",
            b"",
            "invalid_metadata_response",
        ),
        (
            200,
            b"Content-Type: application/json\r\nContent-Encoding: gzip\r\n",
            b"compressed",
            "invalid_metadata_response",
        ),
        (
            200,
            b"Content-Type: application/json\r\n",
            b" " * 32769,
            "metadata_too_large",
        ),
    ],
)
def test_cimd_response_limits_and_no_redirects(status, headers, body, error):
    import asyncio
    import anyio
    from varavu_selavu_service.oauth import cimd

    async def run():
        requests = []

        async def serve(reader, writer):
            requests.append(await reader.readuntil(b"\r\n\r\n"))
            writer.write(
                f"HTTP/1.1 {status} Test\r\n".encode()
                + headers
                + f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode()
                + body
            )
            await writer.drain()
            writer.close()
            await writer.wait_closed()

        server = await asyncio.start_server(serve, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        try:
            if error:
                with pytest.raises(ValueError, match=error):
                    await cimd.fetch_metadata_async(f"http://127.0.0.1:{port}/metadata")
            else:
                assert await cimd.fetch_metadata_async(
                    f"http://127.0.0.1:{port}/metadata"
                ) == {"client_id": "ok"}
            assert len(requests) == 1
        finally:
            server.close()
            await server.wait_closed()

    anyio.run(run)
