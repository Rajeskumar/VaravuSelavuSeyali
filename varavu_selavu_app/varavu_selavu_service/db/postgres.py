import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
import logging

from varavu_selavu_service.core.config import Settings

logger = logging.getLogger(__name__)
settings = Settings()

# Global connection pool initialized dynamically if postgres is used
_pool = None

def get_pool():
    global _pool
    if _pool is None:
        if not settings.DATABASE_URL:
            # Fallback for when Postgres is enabled but url missing
            raise ValueError("DATABASE_URL is not set but USE_POSTGRES is true!")
        logger.info("Initializing Postgres ThreadedConnectionPool...")
        _pool = ThreadedConnectionPool(1, 10, dsn=settings.DATABASE_URL)
    return _pool

@contextmanager
def get_db_connection():
    """
    Yields a connection from the pool.
    Usage:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(...)
    """
    pool = get_pool()
    conn = pool.getconn()
    try:
        # yield autocommitting connections for simplicity if preferred,
        # but manual transaction control is safer for the repository
        yield conn
    finally:
        pool.putconn(conn)

@contextmanager
def get_db_cursor(commit: bool = False):
    """
    Yields a RealDictCursor that automatically commits on exit if `commit=True`.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        try:
            yield cursor
            if commit:
                conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()
