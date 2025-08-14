from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from varavu_selavu_service.api.routes import router
from varavu_selavu_service.core.config import Settings

settings = Settings()

# Configure root logging early
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(title=settings.PROJECT_NAME, version=settings.VERSION)

# Include the API router (versioned only)
app.include_router(router)

# List the origins that should be allowed to make cross-origin requests
origins = settings.CORS_ALLOW_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,        # or ["*"] to allow all, but use specific domains in prod
    allow_credentials=True,       # allow cookies, Authorization headers
    allow_methods=["*"],          # GET, POST, PUT, etc.
    allow_headers=["*"],          # allow all headers
)

# Add a root endpoint for clarity
@app.get("/")
def root():
    return {"message": "Welcome to the Varavu Selavu Service!"}
