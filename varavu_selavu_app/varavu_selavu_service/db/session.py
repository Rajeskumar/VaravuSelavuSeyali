from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from varavu_selavu_service.core.config import Settings
from varavu_selavu_service.core.observability.db_instrumentation import instrument_engine

settings = Settings()

db_url = settings.DATABASE_URL
# SQLAlchemy 1.4+ requires postgresql:// instead of postgres://
if db_url and db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

# Default to sqlite for local tests if needed, though postgres is intended
if not db_url:
    db_url = "sqlite:///./test.db"

_engine_kwargs: dict = {"pool_pre_ping": True}
if db_url.startswith("postgresql"):
    _engine_kwargs.update(
        {
            "pool_size": settings.DB_POOL_SIZE,
            "max_overflow": settings.DB_MAX_OVERFLOW,
            "pool_timeout": settings.DB_POOL_TIMEOUT_SEC,
        }
    )

engine = create_engine(db_url, **_engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
instrument_engine(engine, SessionLocal)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
