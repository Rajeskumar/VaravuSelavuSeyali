from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .core.config import Settings

settings = Settings()

app = FastAPI(title=settings.PROJECT_NAME, version=settings.VERSION)

# Include the API router
app.include_router(router)

# List the origins that should be allowed to make cross-origin requests
origins = [
    "http://localhost:3000",     # React dev server
    "http://127.0.0.1:3000",
    # "https://your-production-domain.com",
]

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
