#!/usr/bin/env python3
"""Tiny stdlib client for the E2E test backend (harness side only; TS-QA-103).

The harness seeds and verifies data with tokens minted from the per-run JWT secret (the same HS256 claims the
backend's auth/security.py issues), so it never spends the 5-logins/minute budget. The app under test is
different: it always performs a real login.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import urllib.error
import urllib.request


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def mint_access_token(secret: str, email: str, minutes: int = 30) -> str:
    now = time.time()
    claims = {"sub": email, "exp": int(now) + minutes * 60, "iat": int(now), "iat_ms": int(now * 1000), "type": "access"}
    head = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64(json.dumps(claims, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
    return f"{head}.{body}.{_b64(sig)}"


class Api:
    def __init__(self, base_url: str, secret: str, email: str):
        self.base = base_url.rstrip("/")
        self.email = email
        self.token = mint_access_token(secret, email)

    def call(self, method: str, path: str, body: dict | None = None) -> tuple[int, object]:
        req = urllib.request.Request(
            self.base + path,
            method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read()
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            try:
                return exc.code, json.loads(raw)
            except ValueError:
                return exc.code, raw.decode(errors="replace")

    def expenses(self) -> list[dict]:
        status, data = self.call("GET", "/api/v1/expenses?limit=1000")
        if status != 200:
            raise RuntimeError(f"GET /expenses -> {status}: {data}")
        return data["items"]
