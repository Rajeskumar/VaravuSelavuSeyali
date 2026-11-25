#!/usr/bin/env python3
"""A local pass-through HTTP proxy with one fault: "the backend committed, but the response never arrived" (TS-QA-103).

    fault_proxy.py --listen 18080 --backend 18081 --control 18082 [--log FILE]

The app under test talks to --listen (its compiled-in API port); the proxy forwards every request to the backend on
127.0.0.1:--backend and returns the response unchanged. A control API on 127.0.0.1:--control arms faults:

    POST /arm    {"method": "POST", "path": "/api/v1/expenses", "times": 1, "mode": "drop_response"}
    POST /reset  disarm everything and clear the log
    GET  /log    every proxied request: [{"ts", "method", "path", "status", "fault", "allow_ai"}] (allow_ai is the only query value kept)
    GET  /healthz

`drop_response` forwards the request, waits for the backend's complete response (so the write is committed), then
aborts the client connection without sending a byte of it. That is the failure that matters for a money app: the
server has the expense, the app does not know. Matching is exact on method and path (a prefix would also hit
`/api/v1/expenses/categorize`). Everything binds to 127.0.0.1; HTTP/1.1, one request per connection (Connection:
close both ways), request bodies by Content-Length or chunked. Stdlib only.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import threading
import time
from urllib.parse import parse_qs

MAX_HEAD = 64 * 1024
MAX_LOG = 10_000          # newest entries kept; a long suite must not grow the proxy without bound
HEAD_TIMEOUT = 30         # seconds to receive a request head/body (a stalled client must not hold a connection)
BACKEND_TIMEOUT = 120     # seconds for the backend's whole response
MODES = ("drop_response",)


class ProxyHandle:
    """Lets a caller (tests) wait for startup and stop the proxy from another thread."""

    def __init__(self) -> None:
        self.ready = threading.Event()
        self.loop: asyncio.AbstractEventLoop | None = None
        self._stop: asyncio.Event | None = None

    def shutdown(self) -> None:
        if self.loop and self._stop:
            self.loop.call_soon_threadsafe(self._stop.set)


class State:
    def __init__(self, log_path: str | None) -> None:
        self.rules: list[dict] = []
        self.log: list[dict] = []
        self.log_path = log_path

    def record(self, entry: dict) -> None:
        self.log.append(entry)
        del self.log[:-MAX_LOG]
        if self.log_path:
            with open(self.log_path, "a") as fh:
                fh.write(json.dumps(entry) + "\n")

    def take_fault(self, method: str, path: str) -> str | None:
        for rule in self.rules:
            if rule["times"] > 0 and rule["method"] == method and rule["path"] == path:
                rule["times"] -= 1
                return rule["mode"]
        return None


async def read_http_message(reader: asyncio.StreamReader) -> tuple[bytes, bytes]:
    """Return (head including the blank line, de-chunked-or-length body)."""
    head = await reader.readuntil(b"\r\n\r\n")
    if len(head) > MAX_HEAD:
        raise ValueError("header too large")
    lines = head.decode("latin-1").split("\r\n")
    pairs = [(k.strip().lower(), v.strip()) for k, _, v in (ln.partition(":") for ln in lines[1:] if ":" in ln)]
    headers = dict(pairs)
    # Framing the proxy and the backend could read differently is how a second request gets smuggled in: refuse it.
    if sum(1 for k, _ in pairs if k == "content-length") > 1 or sum(1 for k, _ in pairs if k == "transfer-encoding") > 1:
        raise ValueError("duplicate framing header")
    if "transfer-encoding" in headers and (headers["transfer-encoding"].lower() != "chunked" or "content-length" in headers):
        raise ValueError("unsupported or ambiguous Transfer-Encoding")
    if headers.get("transfer-encoding", "").lower() == "chunked":
        body = bytearray()
        while True:
            size_line = (await reader.readline()).strip()
            size = int(size_line.split(b";")[0] or b"0", 16)
            if size == 0:
                await reader.readuntil(b"\r\n")  # trailing CRLF (no trailers supported)
                break
            body += await reader.readexactly(size)
            await reader.readexactly(2)
        # Forward as a plain length-delimited body.
        head = (
            "\r\n".join([lines[0]] + [ln for ln in lines[1:] if ln and not ln.lower().startswith(("transfer-encoding:", "content-length:"))]
                        + [f"Content-Length: {len(body)}"]) + "\r\n\r\n"
        ).encode("latin-1")
        return head, bytes(body)
    length = int(headers.get("content-length", "0") or 0)
    return head, (await reader.readexactly(length) if length else b"")


def force_close(head: bytes) -> bytes:
    lines = [ln for ln in head.decode("latin-1").split("\r\n") if ln and not ln.lower().startswith(("connection:", "proxy-connection:", "keep-alive:"))]
    return ("\r\n".join(lines + ["Connection: close"]) + "\r\n\r\n").encode("latin-1")


def header_map(head: bytes) -> dict[str, str]:
    lines = head.decode("latin-1").split("\r\n")[1:]
    return {k.strip().lower(): v.strip() for k, _, v in (ln.partition(":") for ln in lines if ":" in ln)}


def allow_ai_of(target: str) -> str | None:
    """The ONLY query value the log keeps: `allow_ai` (the consent choice the app sent). Everything else (tokens, ids) is dropped."""
    value = parse_qs(target.partition("?")[2]).get("allow_ai", [None])[0]
    return value if value in ("true", "false") else None


async def handle_client(state: State, backend_port: int, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    b_writer = None
    method = path = allow_ai = None
    recorded = False
    try:
        head, body = await asyncio.wait_for(read_http_message(reader), HEAD_TIMEOUT)
        request_line = head.split(b"\r\n", 1)[0].decode("latin-1")
        method, target, _ = request_line.split(" ", 2)
        path = target.split("?", 1)[0]
        allow_ai = allow_ai_of(target)
        b_reader, b_writer = await asyncio.open_connection("127.0.0.1", backend_port)
        b_writer.write(force_close(head) + body)
        await b_writer.drain()
        response = await asyncio.wait_for(b_reader.read(-1), BACKEND_TIMEOUT)  # until the backend closes (Connection: close)
        status = None
        try:
            status = int(response.split(b" ", 2)[1])
        except (IndexError, ValueError):
            pass
        fault = state.take_fault(method, path)
        state.record({"ts": round(time.time(), 3), "method": method, "path": path, "status": status, "fault": fault, "allow_ai": allow_ai})
        recorded = True
        if fault == "drop_response":
            writer.transport.abort()  # RST: the backend has committed, the client never hears
            return
        writer.write(response)
        await writer.drain()
    except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, asyncio.TimeoutError, ConnectionError, ValueError, OSError):
        pass
    finally:
        if method and not recorded:
            # The request reached the proxy but no response was seen (backend timeout/refusal): still log it, so an assertion of
            # "zero requests to X" cannot pass merely because the backend was slow to answer.
            state.record({"ts": round(time.time(), 3), "method": method, "path": path, "status": None, "fault": None, "allow_ai": allow_ai})
        for w in (b_writer, writer):
            try:
                if w is not None:
                    w.close()
            except Exception:  # noqa: BLE001
                pass


async def handle_control(state: State, control_port: int, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    def reply(status: int, payload) -> None:
        data = json.dumps(payload).encode()
        writer.write(f"HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {len(data)}\r\nConnection: close\r\n\r\n".encode() + data)

    try:
        head, body = await asyncio.wait_for(read_http_message(reader), HEAD_TIMEOUT)
        method, target, _ = head.split(b"\r\n", 1)[0].decode("latin-1").split(" ", 2)
        path = target.split("?", 1)[0]
        headers = header_map(head)
        # Loopback is reachable by any web page open on this machine (no-cors POSTs, DNS rebinding): refuse anything a
        # browser sent. The harness (curl, urllib, Maestro's JS runtime) sends neither an Origin nor a foreign Host.
        if "origin" in headers or headers.get("host", "") not in (f"127.0.0.1:{control_port}", f"localhost:{control_port}"):
            reply(403, {"error": "forbidden"})
        elif method == "POST" and not headers.get("content-type", "").lower().startswith("application/json"):
            reply(415, {"error": "POST bodies must be application/json"})
        elif method == "GET" and path == "/healthz":
            reply(200, {"ok": True})
        elif method == "GET" and path == "/log":
            reply(200, state.log)
        elif method == "POST" and path == "/reset":
            state.rules.clear()
            state.log.clear()
            reply(200, {"ok": True})
        elif method == "POST" and path == "/arm":
            try:
                spec = json.loads(body or b"{}")
                rule = {"method": str(spec["method"]).upper(), "path": str(spec["path"]), "times": int(spec.get("times", 1)),
                        "mode": spec.get("mode", "drop_response")}
                if not rule["path"].startswith("/") or rule["times"] < 1 or rule["mode"] not in MODES or not rule["method"].isalpha():
                    raise ValueError("invalid rule")
            except (KeyError, ValueError, TypeError):
                reply(400, {"error": "need method, path (starting with /), times >= 1 and mode in %s" % (MODES,)})
            else:
                state.rules.append(rule)
                reply(200, rule)
        else:
            reply(404, {"error": "not found"})
        await writer.drain()
    except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, asyncio.TimeoutError, ConnectionError, ValueError, OSError):
        pass
    finally:
        writer.close()


async def run(listen: int, backend: int, control: int, log_path: str | None, handle: ProxyHandle | None = None) -> None:
    state = State(log_path)
    proxy = await asyncio.start_server(lambda r, w: handle_client(state, backend, r, w), "127.0.0.1", listen)
    ctl = await asyncio.start_server(lambda r, w: handle_control(state, control, r, w), "127.0.0.1", control)
    stop = asyncio.Event()
    if handle is not None:
        handle.loop, handle._stop = asyncio.get_running_loop(), stop
        handle.ready.set()
    async with proxy, ctl:
        await stop.wait()


def run_blocking(listen: int, backend: int, control: int, log_path: str | None, handle: ProxyHandle | None = None) -> None:
    asyncio.run(run(listen, backend, control, log_path, handle))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--listen", type=int, required=True)
    ap.add_argument("--backend", type=int, required=True)
    ap.add_argument("--control", type=int, required=True)
    ap.add_argument("--log")
    a = ap.parse_args()
    if len({a.listen, a.backend, a.control}) != 3:
        print("listen, backend and control ports must differ", file=sys.stderr)
        return 2
    try:
        run_blocking(a.listen, a.backend, a.control, a.log)
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
