from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from varavu_selavu_service.core.config import Settings

settings = Settings()

db_url = settings.DATABASE_URL
# SQLAlchemy 1.4+ requires postgresql:// instead of postgres://
if db_url and db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

# Default to sqlite for local tests if needed, though postgres is intended
if not db_url:
    db_url = "sqlite:///./test.db"

engine = create_engine(db_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
