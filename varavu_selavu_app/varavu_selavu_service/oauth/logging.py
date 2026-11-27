"""Global Uvicorn access-log suppression & OAuth query redaction (TS-OBS-001 L11).

Raw `uvicorn.access` records carry unnormalized paths, query strings, and client IPs.
Installing this filter (done globally at boot via `configure_logging` as well as when
MCP is enabled) suppresses raw access output while preserving normalized `ObservabilityMiddleware`
events, and still redacts `/oauth/` query parameters if `RedactOAuthQuery` is invoked directly.
"""

import logging


class RedactOAuthQuery(logging.Filter):
    def filter(self, record):
        if isinstance(record.args, tuple) and len(record.args) == 5:
            args = list(record.args)
            if isinstance(args[2], str) and args[2].startswith("/oauth/"):
                args[2] = args[2].split("?", 1)[0]
                record.args = tuple(args)
        return True


def install():
    from varavu_selavu_service.core.observability.sanitizer import _SuppressRawUvicornAccessFilter

    uv_access = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, RedactOAuthQuery) for f in uv_access.filters):
        uv_access.addFilter(RedactOAuthQuery())
    if not any(isinstance(f, _SuppressRawUvicornAccessFilter) for f in uv_access.filters):
        uv_access.addFilter(_SuppressRawUvicornAccessFilter())
