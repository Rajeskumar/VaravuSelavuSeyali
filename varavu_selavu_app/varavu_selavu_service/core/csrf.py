"""Double-submit CSRF protection for cookie-authenticated requests (P0-1).

Once the access token lives in a cookie the browser attaches it to cross-site
requests automatically, so state-changing endpoints need a second factor that a
cross-origin page cannot forge. The client reads the (non-HttpOnly) `vs_csrf`
cookie and echoes it in the `X-CSRF-Token` header; only same-origin JavaScript
can read that cookie, so a matching pair proves the request came from our app.

Only enforced when the request authenticates *via cookie*. A native client
sending `Authorization: Bearer` is not subject to CSRF (nothing attaches its
credential ambiently), so those requests are exempt.
"""

import hmac

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from varavu_selavu_service.auth.cookies import ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "TRACE"})

# Session-establishing routes: the caller has no cookie pair yet. They are
# rate-limited instead, and carry no ambient authority to abuse.
EXEMPT_PATHS = frozenset(
    {
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/google",
        "/api/v1/auth/refresh",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        "/api/v1/auth/verify-email",
    }
)


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in SAFE_METHODS or request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        # No auth cookie => header-authenticated (or anonymous): not a CSRF target.
        if not request.cookies.get(ACCESS_COOKIE):
            return await call_next(request)

        # An explicit Bearer credential is never ambient: a cross-site page can't attach an
        # Authorization header without a CORS preflight our allowlist refuses, and
        # auth_required authenticates from that header whenever it's present (never from the
        # cookie). Native HTTP stacks (iOS NSURLSession, Android OkHttp's cookie jar) store the
        # Set-Cookie from /auth/login and /auth/refresh and resend it, so mobile requests
        # carried vs_token too and got 403 on every POST (AI chat, categorize) until the
        # cookie expired. The mobile app now sends credentials: 'omit', but Android doesn't
        # reliably honour that, so the exemption lives here.
        if request.headers.get("authorization", "").lower().startswith("bearer "):
            return await call_next(request)

        cookie_token = request.cookies.get(CSRF_COOKIE)
        header_token = request.headers.get(CSRF_HEADER)
        if not cookie_token or not header_token or not hmac.compare_digest(cookie_token, header_token):
            return JSONResponse(status_code=403, content={"detail": "CSRF token missing or invalid"})

        return await call_next(request)
