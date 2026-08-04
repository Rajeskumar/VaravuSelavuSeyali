"""Auth cookie plumbing (P0-1).

Browsers receive tokens as cookies instead of holding them in localStorage,
where any script on the page could read them. Native clients (the Expo app)
keep using `Authorization: Bearer` with SecureStore and are unaffected.

- access  (`vs_token`)  HttpOnly, site-wide, so every API call carries it.
- refresh (`vs_refresh`) HttpOnly and path-scoped to the auth routes, so it is
  not attached to ordinary API traffic.
- csrf    (`vs_csrf`)   deliberately readable by JS: the client echoes it in the
  X-CSRF-Token header and the server compares the two (double-submit). An
  attacker's cross-site page can cause the cookie to be sent but cannot read
  it to construct the matching header.
"""

import secrets

from fastapi import Response

from varavu_selavu_service.core.config import Settings

settings = Settings()

ACCESS_COOKIE = "vs_token"
REFRESH_COOKIE = "vs_refresh"
CSRF_COOKIE = "vs_csrf"
CSRF_HEADER = "X-CSRF-Token"

# Only the auth routes ever need the refresh token.
REFRESH_COOKIE_PATH = "/api/v1/auth"


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def _base_kwargs() -> dict:
    return {
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
        "domain": settings.AUTH_COOKIE_DOMAIN,
    }


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> str:
    """Writes the auth cookie trio. Returns the CSRF token so the caller can
    also surface it in the response body for the first request."""
    csrf_token = new_csrf_token()

    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        httponly=True,
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        path="/",
        **_base_kwargs(),
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        httponly=True,
        max_age=settings.REFRESH_EXPIRE_MINUTES * 60,
        path=REFRESH_COOKIE_PATH,
        **_base_kwargs(),
    )
    response.set_cookie(
        CSRF_COOKIE,
        csrf_token,
        httponly=False,  # the client must read this to echo it back
        max_age=settings.REFRESH_EXPIRE_MINUTES * 60,
        path="/",
        **_base_kwargs(),
    )
    return csrf_token


def clear_auth_cookies(response: Response) -> None:
    kwargs = _base_kwargs()
    response.delete_cookie(ACCESS_COOKIE, path="/", **kwargs)
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, **kwargs)
    response.delete_cookie(CSRF_COOKIE, path="/", **kwargs)
