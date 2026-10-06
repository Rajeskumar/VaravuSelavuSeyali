from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import logging

from varavu_selavu_service.api.routes import router
from varavu_selavu_service.core.limiter import limiter
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.core.csrf import CSRFMiddleware
from varavu_selavu_service.auth.security import assert_signing_secret_is_safe

settings = Settings()

# Configure root logging early
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

# Fail fast rather than serve traffic with a forgeable signing key.
assert_signing_secret_is_safe(settings.ENVIRONMENT, settings.JWT_SECRET)

# The interactive docs and the schema list every endpoint and field to anyone, signed in or not.
# Useful locally; nothing a customer needs in production.
_expose_docs = settings.ENVIRONMENT == "local"
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url="/docs" if _expose_docs else None,
    redoc_url="/redoc" if _expose_docs else None,
    openapi_url="/openapi.json" if _expose_docs else None,
)


@app.exception_handler(RequestValidationError)
async def _validation_error_handler(request: Request, exc: RequestValidationError):
    """FastAPI's default 422 echoes each rejected value back as `input` — for a sign-up or reset
    form that includes the password the user just typed, which then sits in proxy and browser
    logs. Keep where and why it failed; drop the value."""
    errors = [{k: v for k, v in e.items() if k not in ("input", "url")} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})


@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response = await call_next(request)
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    # Authenticated JSON (and the auth endpoints that set cookies) must never be stored by a
    # shared cache or the browser's back/forward cache.
    if request.url.path.startswith("/api/"):
        h.setdefault("Cache-Control", "no-store")
    return response
app.state.limiter = limiter


@app.on_event("startup")
def _warm_up_receipt_ocr() -> None:
    # Loading the OCR models takes seconds; do it off the request path so the
    # first receipt scan after a cold start isn't the one that pays for it.
    if settings.OCR_ENGINE in ("local", "hybrid"):
        import threading

        from varavu_selavu_service.services.ocr.engine import warm_up

        threading.Thread(target=warm_up, name="ocr-warmup", daemon=True).start()


app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Include the API router (versioned only)
app.include_router(router)

# List the origins that should be allowed to make cross-origin requests
origins = settings.CORS_ALLOW_ORIGINS


# Added before CORS so it runs *after* it: a rejected cross-origin request still
# gets CORS headers, letting the browser surface the 403 instead of an opaque
# network error.
app.add_middleware(CSRFMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,        # or ["*"] to allow all, but use specific domains in prod
    # Local dev only: CRA's preview server falls back to a random port when 3000 is
    # busy (e.g. a second instance alongside one already running). Regex avoids
    # having to hardcode/update the allowlist every time that happens.
    allow_origin_regex=r"http://localhost:\d+" if settings.ENVIRONMENT == "local" else None,
    allow_credentials=True,       # allow cookies, Authorization headers
    allow_methods=["*"],          # GET, POST, PUT, etc.
    allow_headers=["*"],          # allow all headers
)

# Add a root endpoint for clarity
@app.get("/")
def root():
    return {"message": "Welcome to the TrackSpense Service!"}

@app.get("/privacy-policy")
def privacy_policy():
    # parents[1] is the package root (varavu_selavu_app/, i.e. /app in the container) —
    # the HTML files live there as siblings of varavu_selavu_service/, inside the Docker
    # build context (cloudbuild.yaml builds the backend image from that directory, so a
    # path outside it — e.g. the old parents[2] — can never resolve inside the container).
    path = Path(__file__).resolve().parents[1] / "privacy_policy.html"
    return FileResponse(path)

@app.get("/terms-of-service")
def terms_of_service():
    path = Path(__file__).resolve().parents[1] / "terms_of_service.html"
    return FileResponse(path)
