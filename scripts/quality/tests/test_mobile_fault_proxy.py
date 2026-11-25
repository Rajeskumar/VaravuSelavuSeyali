"""Tests for qa/mobile/scripts/fault_proxy.py (TS-QA-103, AC-005): pass-through, commit-then-drop-response fault, request log."""
import http.client
import importlib.util
import json
import socket
import sys
import threading
import unittest
import time
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[3] / "qa" / "mobile" / "scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("fault_proxy", SCRIPTS / "fault_proxy.py")
fp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fp)


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Backend(BaseHTTPRequestHandler):
    # HTTP/1.1 keep-alive like uvicorn: the proxy must send Connection: close itself or its read-to-EOF would hang.
    protocol_version = "HTTP/1.1"
    received = []

    def log_message(self, *a):
        pass

    def _reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        Backend.received.append(("GET", self.path, b""))
        if self.path.startswith("/api/v1/slow"):
            time.sleep(2)
        self._reply(200, {"ok": True, "path": self.path})

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n)
        Backend.received.append(("POST", self.path, body))
        self._reply(201, {"created": True, "echo": body.decode()})


class FaultProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bport, cls.pport, cls.cport = free_port(), free_port(), free_port()
        cls.backend = ThreadingHTTPServer(("127.0.0.1", cls.bport), Backend)
        threading.Thread(target=cls.backend.serve_forever, daemon=True).start()
        cls.handle = fp.ProxyHandle()
        cls.thread = threading.Thread(
            target=lambda: fp.run_blocking(cls.pport, cls.bport, cls.cport, None, cls.handle), daemon=True)
        cls.thread.start()
        assert cls.handle.ready.wait(10), "proxy did not start"

    @classmethod
    def tearDownClass(cls):
        cls.handle.shutdown()
        cls.thread.join(5)
        assert not cls.thread.is_alive(), "proxy thread did not stop"
        cls.backend.shutdown()
        cls.backend.server_close()

    def setUp(self):
        Backend.received.clear()
        self.control("POST", "/reset")

    def control(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.cport, timeout=5)
        hdrs = {"Content-Type": "application/json"} if method == "POST" else {}
        hdrs.update(headers or {})
        try:
            c.request(method, path, body=None if body is None else json.dumps(body), headers=hdrs)
            r = c.getresponse()
            return r.status, json.loads(r.read() or b"null")
        finally:
            c.close()

    def call(self, method, path, body=None):
        c = http.client.HTTPConnection("127.0.0.1", self.pport, timeout=5)
        try:
            c.request(method, path, body=body, headers={"Content-Type": "application/json"} if body else {})
            r = c.getresponse()
            return r.status, r.read()
        finally:
            c.close()

    def test_passes_requests_and_responses_through_unchanged(self):
        status, data = self.call("GET", "/api/v1/ping")
        self.assertEqual((status, json.loads(data)["path"]), (200, "/api/v1/ping"))
        status, data = self.call("POST", "/api/v1/expenses", '{"cost": 12.5}')
        self.assertEqual(status, 201)
        self.assertEqual(json.loads(data)["echo"], '{"cost": 12.5}')
        self.assertEqual([(m, p) for m, p, _ in Backend.received], [("GET", "/api/v1/ping"), ("POST", "/api/v1/expenses")])

    def test_armed_fault_lets_the_backend_commit_then_drops_the_response(self):
        self.assertEqual(self.control("POST", "/arm", {"method": "POST", "path": "/api/v1/expenses", "times": 1})[0], 200)
        with self.assertRaises((http.client.HTTPException, ConnectionError, OSError)):
            self.call("POST", "/api/v1/expenses", '{"cost": 1}')
        # the request DID reach the backend (it committed); only the response was lost
        self.assertEqual([(m, p) for m, p, _ in Backend.received], [("POST", "/api/v1/expenses")])
        # one-shot: the next identical request goes through
        self.assertEqual(self.call("POST", "/api/v1/expenses", '{"cost": 2}')[0], 201)

    def test_fault_matches_method_and_exact_path_only(self):
        self.control("POST", "/arm", {"method": "POST", "path": "/api/v1/expenses", "times": 1})
        self.assertEqual(self.call("POST", "/api/v1/expenses/categorize", "{}")[0], 201)   # different path
        self.assertEqual(self.call("GET", "/api/v1/expenses")[0], 200)                       # different method
        with self.assertRaises((http.client.HTTPException, ConnectionError, OSError)):
            self.call("POST", "/api/v1/expenses", "{}")

    def test_log_records_every_request_and_the_fault(self):
        self.control("POST", "/arm", {"method": "POST", "path": "/api/v1/expenses", "times": 1})
        self.call("GET", "/api/v1/ping")
        try:
            self.call("POST", "/api/v1/expenses", "{}")
        except (http.client.HTTPException, ConnectionError, OSError):
            pass
        status, log = self.control("GET", "/log")
        self.assertEqual(status, 200)
        self.assertEqual([(e["method"], e["path"], e["fault"]) for e in log],
                         [("GET", "/api/v1/ping", None), ("POST", "/api/v1/expenses", "drop_response")])
        self.assertEqual(log[0]["status"], 200)

    def test_reset_disarms_and_clears_the_log(self):
        self.control("POST", "/arm", {"method": "POST", "path": "/api/v1/expenses", "times": 5})
        self.control("POST", "/reset")
        self.assertEqual(self.call("POST", "/api/v1/expenses", "{}")[0], 201)
        self.control("POST", "/reset")
        self.assertEqual(self.control("GET", "/log")[1], [])

    def test_arm_validates_its_input(self):
        for bad in ({}, {"method": "POST"}, {"method": "POST", "path": "/x", "times": 0}, {"method": "POST", "path": "x"},
                    {"method": "POST", "path": "/x", "times": 1, "mode": "explode"}):
            with self.subTest(bad=bad):
                self.assertEqual(self.control("POST", "/arm", bad)[0], 400)

    def test_chunked_request_bodies_are_forwarded_with_their_content(self):
        with socket.create_connection(("127.0.0.1", self.pport), timeout=5) as c:
            c.sendall(b"POST /api/v1/chunked HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n")
            data = b""
            while True:
                part = c.recv(4096)
                if not part:
                    break
                data += part
        self.assertIn(b"201", data.split(b"\r\n", 1)[0])
        self.assertEqual(Backend.received[-1][2], b"hello world")

    def test_control_api_refuses_browser_originated_requests(self):
        # A web page open on the dev machine must not be able to arm faults or clear the log (no-cors POSTs reach loopback).
        arm = {"method": "POST", "path": "/api/v1/expenses", "times": 5}
        self.assertEqual(self.control("POST", "/arm", arm, {"Origin": "http://evil.example"})[0], 403)
        self.assertEqual(self.control("POST", "/reset", None, {"Origin": "null"})[0], 403)
        self.assertEqual(self.control("GET", "/log", None, {"Origin": "http://evil.example"})[0], 403)
        self.assertEqual(self.call("POST", "/api/v1/expenses", "{}")[0], 201)  # nothing was armed

    def test_control_api_refuses_a_foreign_host_header_dns_rebinding(self):
        self.assertEqual(self.control("GET", "/log", None, {"Host": "evil.example:%d" % self.cport})[0], 403)
        self.assertEqual(self.control("GET", "/log", None, {"Host": "localhost:%d" % self.cport})[0], 200)

    def test_control_api_requires_a_json_content_type_for_posts(self):
        arm = {"method": "POST", "path": "/api/v1/expenses", "times": 1}
        self.assertEqual(self.control("POST", "/arm", arm, {"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.control("POST", "/arm", arm, {"Content-Type": "application/x-www-form-urlencoded"})[0], 415)
        self.assertEqual(self.control("POST", "/arm", arm)[0], 200)

    def test_the_log_is_bounded(self):
        old = fp.MAX_LOG
        fp.MAX_LOG = 3
        try:
            for i in range(6):
                self.call("GET", f"/api/v1/n{i}")
            paths = [e["path"] for e in self.control("GET", "/log")[1]]
        finally:
            fp.MAX_LOG = old
        self.assertEqual(paths, ["/api/v1/n3", "/api/v1/n4", "/api/v1/n5"])

    def test_an_oversized_header_block_is_dropped_without_wedging_the_proxy(self):
        with socket.create_connection(("127.0.0.1", self.pport), timeout=5) as c:
            c.sendall(b"GET /x HTTP/1.1\r\nHost: x\r\nX-Big: " + b"a" * 200000 + b"\r\n\r\n")
            try:
                c.recv(1024)
            except OSError:
                pass
        self.assertEqual(self.call("GET", "/api/v1/ping")[0], 200)  # still serving

    def test_the_log_records_allow_ai_and_nothing_else_from_the_query(self):
        # Declining AI consent still POSTs to our own server with allow_ai=false; the server enforces it. The harness must be
        # able to assert that, without ever logging other query values (tokens, ids).
        self.call("POST", "/api/v1/ingest/receipt/parse?allow_ai=false&token=SECRET", "{}")
        self.call("POST", "/api/v1/ingest/receipt/parse?allow_ai=true", "{}")
        self.call("POST", "/api/v1/ingest/receipt/parse", "{}")
        log = [e for e in self.control("GET", "/log")[1] if e["path"] == "/api/v1/ingest/receipt/parse"]
        self.assertEqual([e.get("allow_ai") for e in log], ["false", "true", None])
        self.assertNotIn("SECRET", json.dumps(log))

    def test_a_request_the_backend_never_answered_is_still_logged(self):
        # A "zero POSTs" assertion must not pass just because the backend was slow to answer.
        old = fp.BACKEND_TIMEOUT
        fp.BACKEND_TIMEOUT = 0.3
        try:
            try:
                self.call("GET", "/api/v1/slow")
            except (http.client.HTTPException, OSError):
                pass
            deadline = time.time() + 5
            entries = []
            while time.time() < deadline and not entries:
                entries = [e for e in self.control("GET", "/log")[1] if e["path"] == "/api/v1/slow"]
                time.sleep(0.1)
        finally:
            fp.BACKEND_TIMEOUT = old
        self.assertEqual(len(entries), 1)
        self.assertIsNone(entries[0]["status"])

    def raw(self, request: bytes) -> bytes:
        with socket.create_connection(("127.0.0.1", self.pport), timeout=5) as c:
            c.sendall(request)
            try:
                return c.recv(4096)
            except OSError:
                return b""

    def test_ambiguous_request_framing_is_dropped_not_forwarded(self):
        # Framing the backend might read differently from the proxy is how a second request gets smuggled in.
        dup = self.raw(b"POST /api/v1/x HTTP/1.1\r\nHost: h\r\nContent-Length: 2\r\nContent-Length: 40\r\n\r\n{}")
        te = self.raw(b"POST /api/v1/x HTTP/1.1\r\nHost: h\r\nTransfer-Encoding: gzip, chunked\r\n\r\n0\r\n\r\n")
        self.assertEqual((dup, te), (b"", b""))
        self.assertEqual([p for m, p, b in Backend.received if p == "/api/v1/x"], [])

    def test_the_runner_clients_work_against_the_real_control_api(self):
        # run_flows.reset_proxy and seed.proxy_log are what the harness really uses: they must satisfy the Host/Origin/JSON checks.
        rfspec = importlib.util.spec_from_file_location("run_flows_it", SCRIPTS / "run_flows.py")
        rf = importlib.util.module_from_spec(rfspec)
        rfspec.loader.exec_module(rf)
        state = {"E2E_PROXY_CONTROL_URL": f"http://127.0.0.1:{self.cport}"}
        self.call("POST", "/api/v1/expenses", "{}")
        self.assertEqual(len(rf.seed.proxy_log(state)), 1)
        rf.reset_proxy(state)
        self.assertEqual(rf.seed.proxy_log(state), [])

    def test_control_port_is_not_reachable_through_the_proxy_port(self):
        self.assertEqual(self.call("POST", "/arm", '{"method":"POST","path":"/x","times":1}')[0], 201)  # just proxied to the backend


if __name__ == "__main__":
    unittest.main()
