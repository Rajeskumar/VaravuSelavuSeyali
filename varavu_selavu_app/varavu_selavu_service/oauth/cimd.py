"""Allowlisted metadata fetch with DNS/IP pinning and no redirects/proxies."""

import ipaddress
import json
import socket
import asyncio
import anyio
import aiohttp
import dns.asyncresolver
import dns.resolver
from datetime import timedelta
from urllib.parse import urlsplit
from fastapi import HTTPException
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.db.mcp_models import OAuthClient
from varavu_selavu_service.mcp.security import utcnow, aware


def redirect_allowed(uri):
    if not isinstance(uri, str) or len(uri) > 2048:
        return False
    p = urlsplit(uri)
    return bool(
        p.scheme == "https"
        and p.hostname
        and not p.username
        and not p.password
        and not p.fragment
        and p.port in (None, 443)
    )


METADATA_TIMEOUT_SECONDS = 3


async def resolve_addresses(host):
    # Async DNS avoids an uninterruptible system getaddrinfo worker outliving the
    # total deadline. Validate BOTH families before allowing any connection.
    async def family(kind):
        try:
            answer = await dns.asyncresolver.resolve(
                host, kind, lifetime=METADATA_TIMEOUT_SECONDS
            )
            return [str(record) for record in answer]
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
            return []

    answers = await asyncio.gather(family("A"), family("AAAA"))
    return [address for answer in answers for address in answer]


class PublicResolver(aiohttp.abc.AbstractResolver):
    async def resolve(self, host, port=0, family=socket.AF_UNSPEC):
        ips = await resolve_addresses(host)
        if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
            raise ValueError("metadata_address_not_allowed")
        return [
            dict(
                hostname=host,
                host=ip,
                port=port,
                family=socket.AF_INET6 if ":" in ip else socket.AF_INET,
                proto=socket.IPPROTO_TCP,
                flags=socket.AI_NUMERICHOST,
            )
            for ip in ips
        ]

    async def close(self):
        pass


async def fetch_metadata_async(url):
    try:
        # The outer deadline includes DNS, TCP, TLS, headers and every body chunk.
        with anyio.fail_after(METADATA_TIMEOUT_SECONDS):
            connector = aiohttp.TCPConnector(
                resolver=PublicResolver(), use_dns_cache=False
            )
            async with aiohttp.ClientSession(
                connector=connector,
                trust_env=False,
                auto_decompress=False,
                timeout=aiohttp.ClientTimeout(total=METADATA_TIMEOUT_SECONDS),
            ) as client:
                async with client.get(
                    url,
                    allow_redirects=False,
                    headers={
                        "Accept": "application/json",
                        "Accept-Encoding": "identity",
                    },
                ) as response:
                    if (
                        response.status != 200
                        or response.headers.get("Content-Type", "").split(";")[0]
                        not in (
                            "application/json",
                            "application/oauth-client-metadata+json",
                        )
                        or response.headers.get("Content-Encoding", "identity").lower()
                        != "identity"
                    ):
                        raise ValueError("invalid_metadata_response")
                    data = bytearray()
                    async for chunk in response.content.iter_chunked(4096):
                        data.extend(chunk)
                        if len(data) > 32768:
                            raise ValueError("metadata_too_large")
                    return json.loads(data)
    except TimeoutError:
        raise ValueError("metadata_timeout") from None


def fetch_metadata(url):
    p = urlsplit(url)
    if (
        p.scheme != "https"
        or p.hostname not in Settings().MCP_CIMD_ALLOWED_HOSTS
        or p.port not in (None, 443)
        or p.username
        or p.password
        or p.fragment
        or len(url) > 512
    ):
        raise ValueError("metadata_host_not_allowed")
    try:
        ipaddress.ip_address(p.hostname)
    except ValueError:
        pass
    else:
        # aiohttp bypasses custom DNS resolvers for literal IPs.
        raise ValueError("metadata_host_not_allowed")
    # Called by the synchronous authorization route in its worker thread.
    return anyio.run(fetch_metadata_async, url)


def load_client(db, client_id):
    existing = db.get(OAuthClient, client_id)
    if existing and (
        existing.blocked
        or existing.registration_type == "preregistered"
        or (
            existing.metadata_expires_at
            and aware(existing.metadata_expires_at) > utcnow()
        )
    ):
        return existing
    try:
        data = fetch_metadata(client_id)
        redirects = data["redirect_uris"]
        if (
            data.get("client_id") != client_id
            or data.get("token_endpoint_auth_method", "none") != "none"
            or not isinstance(redirects, list)
            or not 1 <= len(redirects) <= 10
            or not all(redirect_allowed(u) for u in redirects)
            or not isinstance(data.get("client_name"), str)
            or not 1 <= len(data["client_name"]) <= 100
        ):
            raise ValueError("invalid_metadata")
    except (
        ValueError,
        KeyError,
        TypeError,
        OSError,
        aiohttp.ClientError,
        dns.exception.DNSException,
    ):
        raise HTTPException(400, detail="Client metadata unavailable") from None
    row = existing or OAuthClient(
        client_id=client_id, registration_type="cimd", verified=False
    )
    row.client_name, row.redirect_uris, row.metadata_expires_at = (
        data["client_name"],
        redirects,
        utcnow() + timedelta(hours=1),
    )
    db.add(row)
    db.flush()
    return row
