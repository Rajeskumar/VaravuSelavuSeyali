"""Rate-limit configuration (security audit VS-05).

`slowapi`'s stock `get_remote_address` reads the TCP peer address. Behind Cloud Run — and
Cloudflare in front of that — the peer is Google's front end, never the caller, so every
client on the internet shared a single counter. The practical consequence was not weak
throttling but a trivial denial of service: login is capped at 5/minute, so one attacker
sending six requests a minute exhausted the bucket for *every* user.

`client_ip_key` resolves the real caller instead, and `_storage_uri` lets the counters live
somewhere shared so they survive a cold start and span instances.
"""

import logging
import os
from typing import Optional

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

logger = logging.getLogger(__name__)

# Cloudflare overwrites CF-Connecting-IP on every request it proxies, so a client cannot
# forge it *through* Cloudflare. It can be forged by a caller who reaches the origin
# directly, which is why ONLY this header is consulted and not the freely-settable
# X-Forwarded-For: see the note on origin lockdown below.
TRUSTED_CLIENT_IP_HEADER = os.getenv("TRUSTED_CLIENT_IP_HEADER", "cf-connecting-ip")

# Where the counters live. Defaults to per-process memory, which is what upstream does, but
# means limits reset on cold start and each Cloud Run instance counts independently — so the
# effective limit is (configured limit x instance count). Point this at Redis
# (e.g. "redis://10.0.0.3:6379") to make limits global and durable.
_storage_uri: Optional[str] = os.getenv("RATE_LIMIT_STORAGE_URI") or None


def client_ip_key(request: Request) -> str:
    """Best available identity for the caller, preferring the proxy-asserted client IP.

    NOTE: this is only as trustworthy as the network path. The Cloud Run service is deployed
    `--allow-unauthenticated`, so its *.run.app URL is reachable without going through
    Cloudflare, and a caller who goes direct can set CF-Connecting-IP to anything and mint a
    fresh bucket per request. Closing that properly means forcing traffic through Cloudflare
    — restrict ingress to internal + load balancer, or require a shared secret header that
    Cloudflare adds and the origin checks. Until then this fixes the shared-bucket DoS but
    is not a hard guarantee against a determined attacker bypassing the edge.
    """
    forwarded = request.headers.get(TRUSTED_CLIENT_IP_HEADER)
    if forwarded:
        # Defensive: the header is specified as a single address, but take the first entry
        # if a proxy ever appends to it, and cap the length so a huge header cannot be used
        # to blow up the storage key space.
        return forwarded.split(",")[0].strip()[:64]
    return get_remote_address(request)


if _storage_uri:
    limiter = Limiter(key_func=client_ip_key, default_limits=["100/15minute"], storage_uri=_storage_uri)
else:
    logger.warning(
        "RATE_LIMIT_STORAGE_URI is not set: rate limits are per-process and reset on cold "
        "start, so the effective limit scales with the number of running instances."
    )
    limiter = Limiter(key_func=client_ip_key, default_limits=["100/15minute"])
