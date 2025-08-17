from typing import List
from pydantic.v1 import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Varavu Selavu Service"
    VERSION: str = "1.0.0"
    DEBUG: bool = True
    ENVIRONMENT: str = "local"

    # CORS
    CORS_ALLOW_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://varavu-selavu-frontend-952416556244.us-central1.run.app",
    ]

    # Analysis cache TTL (seconds)
    ANALYSIS_CACHE_TTL_SEC: int = 60

    # OCR / receipts
    OCR_ENGINE: str = "openai"
    MAX_UPLOAD_MB: int = 12
    ALLOWED_MIME: str = "image/png,image/jpeg,application/pdf"

    JWT_SECRET: str = "change-me"
    JWT_EXPIRE_MINUTES: int = 30

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
