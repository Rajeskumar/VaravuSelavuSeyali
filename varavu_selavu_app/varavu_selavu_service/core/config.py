import os
from pathlib import Path
from typing import List, Optional
from pydantic.v1 import BaseSettings

try:  # pragma: no cover - optional dependency
    from dotenv import load_dotenv
    load_dotenv()
except Exception:  # pragma: no cover - fallback simple loader
    env_path = Path(__file__).resolve().parents[2] / '.env'
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if not line or line.strip().startswith('#') or '=' not in line:
                continue
            key, val = line.split('=', 1)
            os.environ.setdefault(key.strip(), val.strip())


class Settings(BaseSettings):
    PROJECT_NAME: str = "TrackSpense Service"
    VERSION: str = "1.0.0"
    DEBUG: bool = True
    ENVIRONMENT: str = "local"

    # CORS
    CORS_ALLOW_ORIGINS: List[str] = [
        # Local dev
    "http://localhost:3000",
    "http://127.0.0.1:3000",

    # Direct Cloud Run endpoints
    "https://varavu-selavu-frontend-952416556244.us-central1.run.app",

    # Your custom domains via Cloudflare
    "https://cerebroos.com",
    "https://www.cerebroos.com",
    "https://expense.cerebroos.com",
    ]

    # Analysis cache TTL (seconds)
    ANALYSIS_CACHE_TTL_SEC: int = 60

    # PostgreSQL Toggles
    DATABASE_URL: str = ""

    # OCR / receipts
    OCR_ENGINE: str = "gemini"
    OCR_MODEL: str = "gemini-2.5-flash"
    MAX_UPLOAD_MB: int = 12
    ALLOWED_MIME: str = "image/png,image/jpeg,application/pdf"
    LLM_TIMEOUT_SEC: int = 180

    # Email
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = "unknown_user"
    MAIL_TO: str = ""
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.gmail.com"


    JWT_SECRET: str = "change-me"
    JWT_EXPIRE_MINUTES: int = 30
    REFRESH_EXPIRE_MINUTES: int = 60 * 24 * 7

    # Auth cookies (P0-1). Tokens are delivered to browsers as HttpOnly cookies
    # so page JavaScript cannot read them; native clients keep using the
    # Authorization header. Secure is disabled only for local http development.
    AUTH_COOKIE_SECURE: bool = True
    AUTH_COOKIE_SAMESITE: str = "strict"
    AUTH_COOKIE_DOMAIN: Optional[str] = None

    # Groups (TS-GRP series) — staged rollout flag; off by default so nothing
    # group-related is reachable until explicitly enabled (spec §13.4).
    GROUPS_ENABLED: bool = False
    PUBLIC_APP_URL: str = "http://localhost:3000"

    # Smart Entity Resolution (TS-ENT series) — same staged-rollout pattern as
    # GROUPS_ENABLED. See docs/features/smart_entity/TrackSpense_Smart_Entity_Resolution_Spec.md.
    ENTITY_RESOLUTION_ENABLED: bool = False

    # Push notifications (TS-GRP-110) — Expo Push Service, no FCM/APNs plumbing needed.
    EXPO_PUSH_URL: str = "https://exp.host/--/api/v2/push/send"
    EXPO_ACCESS_TOKEN: str = ""

    # Multi-currency groups (TS-GRP-131) — free, no-API-key exchange rate provider.
    # A lookup failure never blocks expense creation; FxRateService falls back to 1:1.
    FX_RATE_API_URL: str = "https://open.er-api.com/v6/latest"

    # Budgets (TS-BUD series) — unlike GROUPS_ENABLED/ENTITY_RESOLUTION_ENABLED's staged
    # rollout, this defaults ON: budgets are personal-only, additive, and have no cross-user
    # blast radius, so there's no reason to gate them behind an explicit opt-in.
    BUDGETS_ENABLED: bool = True

    # Card Coach (TS-CARD series) — same staged-rollout pattern as GROUPS_ENABLED: off by
    # default until the curated card_catalog dataset (TS-CARD-102) is populated and reviewed.
    # See docs/features/card_coach/TrackSpense_Card_Rewards_Product_Spec.md.
    CARD_COACH_ENABLED: bool = True

    # Tags (TS-TAG series) — same staged-rollout pattern as GROUPS_ENABLED: off by default
    # until the retrieval surfaces (filter + bulk apply) actually ship, since a tag field with
    # no working filter/bulk-apply is dead weight per the PRD's own §4.2 finding.
    # See docs/features/custom_tags/tags-prd-v0.2.0.md.
    TAGS_ENABLED: bool = False
    TAG_MAX_PER_EXPENSE: int = 5
    TAG_MAX_PER_USER: int = 100
    TAG_BULK_MAX: int = 1000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
