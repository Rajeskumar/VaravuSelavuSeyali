# TrackSpense Backend Service

The FastAPI backend powering the TrackSpense expense tracking platform. Handles authentication, CRUD operations, receipt OCR, AI chat, analytics, recurring expenses, and email delivery.

---

## Tech Stack

| Component | Technology | Version |
|:---|:---|:---|
| Language | Python | 3.9+ (Docker uses 3.12) |
| Framework | FastAPI | ≥0.116.1 |
| ASGI Server | Uvicorn | ≥0.35.0 |
| ORM | SQLAlchemy | ≥2.0.48 |
| Database | PostgreSQL | via psycopg2-binary ≥2.9.11 |
| Password Hashing | bcrypt | ≥4.1.2 |
| JWT | python-jose (HS256) | ≥3.3.0 |
| Google OAuth | google-auth | ≥2.49.0 |
| HTTP Client | requests | ≥2.32.0 |
| Package Manager | Poetry | ≥2.0.0 |
| Validation | Pydantic v2 | — |
| Testing | pytest | <9.0.0 |

---

## Quick Start

### Prerequisites
- Python 3.9+
- [Poetry](https://python-poetry.org/docs/#installation)
- PostgreSQL instance (or use SQLite fallback for quick local testing)
- Optional: [Ollama](https://ollama.ai) for local AI features

### 1. Install Dependencies
```bash
cd varavu_selavu_app
poetry install
```

### 2. Configure Environment
```bash
cp varavu_selavu_service/.env.example varavu_selavu_service/.env
```

Edit `.env` with your values — at minimum set:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/trackspense
JWT_SECRET=your-secret-key-here
ENVIRONMENT=local
```

> **SQLite Fallback:** If `DATABASE_URL` is left empty, the app falls back to `sqlite:///./test.db` for quick local testing.

### 3. Initialize Database
```bash
psql -U your_user -d your_db -f varavu_selavu_service/db/schema.sql
```

Or let SQLAlchemy auto-create tables from the ORM models on first run.

### 4. Run the Application
```bash
poetry run uvicorn varavu_selavu_service.main:app --host 0.0.0.0 --port 8000 --reload
```

### 5. Verify
```bash
curl http://localhost:8000/api/v1/healthz
# → {"status":"healthy"}
```

- **API Docs (Swagger):** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

### Run via Makefile (from repo root)
```bash
make install-backend    # Install deps
make start-backend      # Start server on 0.0.0.0:8000
make test-backend       # Run tests
```

---

## Project Structure

```
varavu_selavu_app/
├── Dockerfile                          # Python 3.12-slim + Poetry (prod: port 8080)
├── pyproject.toml                      # Dependencies & build config
├── poetry.lock
├── main.py                             # Entrypoint (imports service main)
├── tests/                              # Test suite
└── varavu_selavu_service/              # Main Python package
    ├── main.py                         # FastAPI app factory, CORS, root router
    ├── core/
    │   └── config.py                  # Settings class (Pydantic BaseSettings)
    ├── api/
    │   └── routes.py                 # All versioned API routes (/api/v1/*)
    ├── auth/
    │   ├── routers.py                # Auth endpoints (register, login, google, profile)
    │   ├── security.py               # JWT creation/decoding, bcrypt, OAuth2 scheme
    │   └── service.py                # AuthService (user CRUD, password ops)
    ├── db/
    │   ├── session.py                # SQLAlchemy engine + session factory
    │   ├── models.py                # ORM models (User, Expense, ExpenseItem, RecurringTemplate)
    │   ├── schema.sql               # Raw PostgreSQL DDL (trackspense schema)
    │   ├── postgres.py              # Postgres connection helpers
    │   └── database.py              # Database utilities
    ├── models/
    │   └── api_models.py            # Pydantic request/response schemas
    ├── repo/
    │   └── postgres_repo.py         # Repository for receipt-based expenses + items
    └── services/
        ├── expense_service.py        # Expense CRUD (create, read, update, delete)
        ├── receipt_service.py        # OCR receipt parsing (OpenAI Vision / Ollama)
        ├── analysis_service.py       # Analytics aggregation with in-memory caching
        ├── chat_service.py           # LLM chat routing (OpenAI prod / Ollama local)
        ├── categorization_service.py # AI semantic expense categorization
        ├── recurring_service.py      # Recurring template management & due computation
        └── email_service.py          # SMTP email via Gmail relay
```

---

## API Endpoints

All endpoints are prefixed with `/api/v1`. Auth-protected routes require `Authorization: Bearer <access_token>`.

### Health
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/healthz` | No | Liveness probe |
| `GET` | `/readyz` | No | Readiness probe |

### Authentication (`/auth/`)
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `POST` | `/auth/register` | No | Register (name, phone, email, password) |
| `POST` | `/auth/login` | No | OAuth2 password form → JWT tokens |
| `POST` | `/auth/google` | No | Google ID token → JWT tokens |
| `POST` | `/auth/refresh` | No | Refresh token → new token pair |
| `POST` | `/auth/logout` | No | Revoke refresh token |
| `POST` | `/auth/forgot-password` | No | Reset password |
| `GET` | `/auth/me` | Yes | Current user email |
| `GET` | `/auth/profile` | Yes | User profile |
| `PUT` | `/auth/profile` | Yes | Update profile |

### Expenses
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `POST` | `/expenses` | Yes | Create expense |
| `GET` | `/expenses?user_id=&limit=&offset=` | Yes | Paginated list (sorted by date desc) |
| `PUT` | `/expenses/{row_id}` | Yes | Update expense |
| `DELETE` | `/expenses/{row_id}` | Yes | Delete expense |
| `POST` | `/expenses/categorize` | Yes | AI-suggest category for description |
| `POST` | `/expenses/with_items` | Yes | Create expense with receipt line items |

### Receipt Ingestion
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `POST` | `/ingest/receipt/parse` | Yes | Upload receipt (PNG/JPEG/PDF, max 12MB) → parsed JSON |

### Analysis
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/analysis?user_id=&year=&month=&start_date=&end_date=` | Yes | Expense analytics (cached 60s) |
| `POST` | `/analysis/chat` | Yes | AI chat about expenses |

### Recurring Expenses
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/recurring/templates` | Yes | List templates |
| `POST` | `/recurring/upsert` | Yes | Create/update template |
| `GET` | `/recurring/due?as_of=` | Yes | Get due occurrences |
| `POST` | `/recurring/confirm` | Yes | Confirm → create expenses |
| `POST` | `/recurring/execute_now` | Yes | Execute template for current month |
| `DELETE` | `/recurring/templates/{id}` | Yes | Delete template |

### Other
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/models` | No | List available LLM models |
| `POST` | `/email/send` | Yes | Send feature request / contact email |

---

## Database Schema

All tables live in the `trackspense` PostgreSQL schema:

| Table | Purpose |
|:---|:---|
| `users` | User accounts (email, name, phone, password_hash) |
| `expenses` | Expense records (amount, category, date, merchant, fingerprint) |
| `expense_items` | Receipt line items (item_name, quantity, unit_price, line_total) |
| `recurring_templates` | Subscription/recurring expense definitions |

Schema DDL: [`db/schema.sql`](./varavu_selavu_service/db/schema.sql)  
ORM Models: [`db/models.py`](./varavu_selavu_service/db/models.py)

---

## AI/LLM Configuration

The backend uses LLMs for three features: receipt OCR, expense categorization, and financial chat.

### Provider Routing
| Environment | Provider | Default Model |
|:---|:---|:---|
| `production` | OpenAI API | `gpt-5-mini` |
| `local` (default) | Ollama (localhost) | `gpt-oss:20b` |

### Key Environment Variables
```env
# Provider routing
ENVIRONMENT=local                    # local | production

# OpenAI (used in production)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-mini
OPENAI_TIMEOUT_SEC=300

# Ollama (used locally)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gpt-oss:20b
OLLAMA_TIMEOUT_SEC=300

# Receipt OCR
OCR_ENGINE=openai                    # openai | ollama | mock
OCR_MODEL=gpt-4o-mini
LLM_TIMEOUT_SEC=180
```

---

## Authentication Details

- **JWT Algorithm:** HS256
- **Access Token Expiry:** 30 minutes (`JWT_EXPIRE_MINUTES`)
- **Refresh Token Expiry:** 7 days
- **Password Hashing:** bcrypt
- **Google OAuth:** Verifies Google ID tokens via `google-auth` library; requires `GOOGLE_CLIENT_ID`
- **Token URL:** `/api/v1/auth/login` (OAuth2 password form)

---

## Docker

### Build & Run
```bash
docker build -t trackspense-backend .
docker run -p 8080:8080 --env-file varavu_selavu_service/.env trackspense-backend
```

### Production Dockerfile
- Base: `python:3.12-slim`
- Installs Poetry, runs `poetry install`
- Exposes port `8080`
- CMD: `uvicorn varavu_selavu_service.main:app --host 0.0.0.0 --port 8080`

---

## Testing

```bash
poetry run pytest
```

Tests use an in-process SQLite database. The receipt service supports a `mock` engine for deterministic test parsing.

---

## License

This project is licensed under the MIT License.
