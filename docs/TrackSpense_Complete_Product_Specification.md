# TrackSpense by Cerebroos — Complete Product & Technical Specification

> **Document Version:** 1.0.0  
> **Last Updated:** 2026-03-14  
> **Product Name:** TrackSpense  
> **Company:** Cerebroos  
> **Repository Name:** VaravuSelavuSeyali  
> **Production Domain:** https://expense.cerebroos.com  

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Business Requirements & Target Users](#2-business-requirements--target-users)
3. [Feature Catalog](#3-feature-catalog)
4. [System Architecture](#4-system-architecture)
5. [Technology Stack](#5-technology-stack)
6. [Repository Structure](#6-repository-structure)
7. [Database Design](#7-database-design)
8. [Backend API Specification](#8-backend-api-specification)
9. [Authentication & Security](#9-authentication--security)
10. [AI/ML Services](#10-aiml-services)
11. [Web Frontend Application](#11-web-frontend-application)
12. [Mobile Application](#12-mobile-application)
13. [Expense Category Taxonomy](#13-expense-category-taxonomy)
14. [Deployment & Infrastructure](#14-deployment--infrastructure)
15. [Environment Configuration](#15-environment-configuration)
16. [Development Setup Guide](#16-development-setup-guide)
17. [Future Roadmap](#17-future-roadmap)
18. [Appendix: Full API Contract Reference](#appendix-full-api-contract-reference)

---

## 1. Product Overview

**TrackSpense** is an AI-powered personal finance tracking application. It enables users to track daily expenses, scan receipts with AI-driven OCR, manage recurring subscriptions, visualize spending analytics, and converse with an AI financial analyst — all across web and mobile platforms.

### Product Name Origins
- **TrackSpense** = "Track" + "Expense" (product/brand name)  
- **VaravuSelavuSeyali** = Tamil words meaning "Income Expense App" (repository/internal name)
- **Varavu** = Income, **Selavu** = Expense, **Seyali** = App

### Core Value Proposition
> Make personal finance tracking effortless, accurate, and highly insightful by leveraging AI to automate data entry, categorization, and financial analysis.

---

## 2. Business Requirements & Target Users

### Target Users
- **Individual consumers** who want to track daily expenses across categories
- **Budget-conscious users** who want spending trend visibility
- **Subscription-heavy users** who need recurring expense management
- **Receipt-heavy spenders** (groceries, dining) who want automated receipt ingestion
- **Tech-savvy users** who want to converse with an AI about their financial data

### Business Goals
1. Remove friction from manual expense entry through AI receipt scanning
2. Provide real-time spending analytics and trend visualization
3. Enable conversational natural-language queries about personal finances
4. Support cross-platform access (web + iOS + Android)
5. Manage recurring/subscription expenses proactively
6. Classify expenses intelligently using semantic AI categorization

### Key Business Rules
- Every expense must be associated with a registered user (identified by email)
- Expenses have a date (MM/DD/YYYY format internally), description, category (main + subcategory), and cost
- Receipt deduplication is enforced via SHA-256 fingerprinting
- Recurring expenses auto-prompt on their scheduled day of month
- All financial data is private per-user (multi-tenant, row-level isolation)
- Currency: USD (default), stored as `NUMERIC(12,2)`

---

## 3. Feature Catalog

### 3.1 User Authentication
| Feature | Description |
|:---|:---|
| Email/Password Registration | User registers with name, phone, email, password |
| Email/Password Login | OAuth2 password flow returning JWT access + refresh tokens |
| Google OAuth Login | One-tap Google Sign-In via ID token verification |
| Token Refresh | Refresh tokens (7-day expiry) can be exchanged for new access tokens |
| Logout | Revokes refresh token (server-side in-memory blacklist) |
| Forgot Password | Reset password by email lookup |
| Profile Management | View and update name and phone number |

### 3.2 Expense Management (CRUD)
| Feature | Description |
|:---|:---|
| Create Expense | Manual entry: date, description, category, cost, optional merchant name |
| Read Expenses | Paginated list (default 30 per page), sorted by date descending |
| Update Expense | Edit any field of an existing expense by row ID |
| Delete Expense | Soft delete by row ID |
| Auto-Categorization | AI suggests main category, subcategory, and merchant from description text |

### 3.3 AI Receipt Scanning (OCR)
| Feature | Description |
|:---|:---|
| Receipt Upload | Accept PNG, JPEG, or PDF uploads (max 12 MB) |
| AI Parsing | Extract merchant, date, total, tax, tip, discount, and individual line items |
| Item-Level Storage | Each receipt line item stored with name, quantity, unit, unit price, line total |
| Fingerprint Deduplication | SHA-256 hash of merchant + date + amount + top-3 items prevents duplicate receipts |
| Expense Confirmation | User reviews parsed data before confirming and saving |

### 3.4 Expense Analytics & Dashboard
| Feature | Description |
|:---|:---|
| Category Totals | Aggregate spend per category for filtered period |
| Top 5 Categories | Ranked by total spend |
| Monthly Trend | Time-series of monthly total spend |
| Category Drill-down | Detailed expense list per category |
| Year/Month Filtering | Filter analysis by year, month, or custom date range |
| In-Memory Caching | Analysis results cached for 60 seconds (configurable) |
| Item Insights | Pre-calculated aggregation of total spend, quantity, and average price per item |
| Merchant Insights | Tracking of lifetime spend and transaction count per merchant including monthly aggregates |

### 3.5 AI Financial Analyst (Chat)
| Feature | Description |
|:---|:---|
| Conversational Interface | Natural-language chat about personal expense data |
| Context-Aware | Injects user's analysis data (category totals, monthly trends) into LLM context |
| Multi-Provider | OpenAI (production) or Ollama (local development) |
| Model Selection | User can choose from available models (e.g., gpt-5-mini, gpt-5) |
| Date-Scoped Queries | Chat can be scoped to specific year/month or date ranges |

### 3.6 Recurring Expense Management
| Feature | Description |
|:---|:---|
| Template Creation | Define: description, category, day_of_month, default_cost, start_date |
| Template Status | Active or Paused |
| Due Computation | Auto-calculates which recurring expenses are due up to current date |
| Idempotency | Skips months where the expense already exists |
| Auto-Prompt | On login, prompts user to confirm/skip due recurring expenses |
| Execute Now | Immediately record a recurring expense for the current month |
| Template Deletion | Remove a recurring template |

### 3.7 Email / Feedback System
| Feature | Description |
|:---|:---|
| Feature Request | Submit feature requests via in-app form |
| Contact Us | General contact form |
| Email Delivery | SMTP via Gmail relay with HTML-formatted emails |

### 3.8 Platform Support
| Platform | Technology | Status |
|:---|:---|:---|
| Web Application | React + TypeScript + MUI | ✅ Shipped |
| Android (Native) | React Native + Expo | ✅ Shipped |
| iOS (Native) | React Native + Expo | ✅ Shipped |

---

## 4. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                    │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │  Web App      │  │  Android App     │  │  iOS App           │  │
│  │  React+TS     │  │  React Native    │  │  React Native      │  │
│  │  Port 3000    │  │  Expo            │  │  Expo              │  │
│  └──────┬───────┘  └───────┬──────────┘  └─────────┬──────────┘  │
│         │                  │                       │              │
│         └──────────────────┼───────────────────────┘              │
│                            │ HTTPS / JSON                         │
│                            ▼                                      │
│              ┌─────────────────────────┐                         │
│              │   FastAPI Backend        │                         │
│              │   /api/v1/*             │                         │
│              │   Port 8000 (dev)       │                         │
│              │   Port 8080 (prod)      │                         │
│              └─────────┬───────────────┘                         │
│                        │                                          │
│           ┌────────────┼────────────────┐                        │
│           ▼            ▼                ▼                         │
│  ┌──────────────┐ ┌──────────┐  ┌────────────────┐              │
│  │ PostgreSQL   │ │ OpenAI   │  │ Ollama (local) │              │
│  │ (trackspense │ │ API      │  │ LLM server     │              │
│  │  schema)     │ │ gpt-5-*  │  │ localhost:11434│              │
│  └──────────────┘ └──────────┘  └────────────────┘              │
│                                                                   │
│        ┌──────────────┐                                          │
│        │ Gmail SMTP   │  (Email delivery)                        │
│        │ smtp.gmail.com│                                          │
│        └──────────────┘                                          │
└──────────────────────────────────────────────────────────────────┘
```

### Request Flow
1. Client authenticates via `/api/v1/auth/login` or `/api/v1/auth/google` → receives JWT
2. All subsequent requests include `Authorization: Bearer <access_token>`
3. Backend validates JWT, extracts user email from token `sub` claim
4. Business logic executes via service layer → repository layer → PostgreSQL
5. AI features route to OpenAI (prod) or Ollama (local) based on `ENVIRONMENT` env var

---

## 5. Technology Stack

### Backend (`varavu_selavu_app`)
| Component | Technology | Version |
|:---|:---|:---|
| Language | Python | 3.9+ (Docker uses 3.12) |
| Framework | FastAPI | ≥0.116.1 |
| ASGI Server | Uvicorn | ≥0.35.0 |
| ORM | SQLAlchemy | ≥2.0.48 |
| Database | PostgreSQL | (via psycopg2-binary ≥2.9.11) |
| Auth: Password Hashing | bcrypt | ≥4.1.2 |
| Auth: JWT | python-jose | ≥3.3.0 |
| Auth: Google OAuth | google-auth | ≥2.49.0 |
| HTTP Client | requests | ≥2.32.0 |
| Package Manager | Poetry | ≥2.0.0 |
| Email | smtplib (stdlib) | — |
| Validation | Pydantic v2 (v1 compat for Settings) | — |
| Env Vars | python-dotenv | ≥1.0.1 |
| Testing | pytest | <9.0.0 |

### Web Frontend (`varavu_selavu_ui`)
| Component | Technology | Version |
|:---|:---|:---|
| Language | TypeScript | ~4.9.5 |
| Framework | React | ≥19.1.1 |
| Scaffolding | Create React App | 5.0.1 |
| UI Library | Material-UI (MUI) | ≥7.3.1 |
| Routing | React Router v6 | ≥6.30.1 |
| Data Fetching | TanStack React Query | ≥5.84.2 |
| Charts | Plotly.js + react-plotly.js | ≥3.0.3 |
| Date Utilities | date-fns | ≥4.1.0 |
| Image Conversion | heic2any | 0.0.4 |
| Styling | MUI Theme (Emotion) | — |
| Fonts | Inter, Roboto | — |
| Production Server | nginx (alpine) | — |

### Mobile App (`varavu_selavu_mobile`)
| Component | Technology | Version |
|:---|:---|:---|
| Language | TypeScript | ~5.9.2 |
| Framework | React Native | 0.81.5 |
| Platform | Expo SDK | ~54.0.0 |
| Navigation | React Navigation (Stack + Bottom Tabs) | v6 |
| HTTP Client | Axios | ≥1.6.8 |
| Secure Storage | expo-secure-store | ~15.0.8 |
| Camera/Gallery | expo-image-picker | ~17.0.10 |
| Charts | react-native-chart-kit | ≥6.12.0 |
| SVG | react-native-svg | 15.12.1 |
| Gradients | expo-linear-gradient | ~15.0.8 |
| State Management | React Context API | — |

---

## 6. Repository Structure

```
VaravuSelavuSeyali/                     # Monorepo root
├── README.md                           # Product overview (marketing)
├── MOBILE_APP_ROADMAP.md               # Mobile implementation guide
├── Makefile                            # Convenience commands
├── Dockerfile                          # Legacy Streamlit (unused)
├── docker-compose.yml                  # Local multi-container orchestration
├── cloudbuild.yaml                     # GCP Cloud Build CI/CD pipeline
├── docs/
│   ├── product/
│   │   ├── AI Financial Analyst Feature.md   # Vision: next-gen AI analyst
│   │   └── item-level-ai-analyst.md          # Item & merchant analytics plan
│   └── engineering/                          # (reserved)
│
├── varavu_selavu_app/                  # BACKEND SERVICE
│   ├── Dockerfile                      # Python 3.12-slim + Poetry
│   ├── pyproject.toml                  # Dependencies & build config
│   ├── poetry.lock
│   ├── main.py                         # Entry point (imports service main)
│   └── varavu_selavu_service/          # Python package
│       ├── main.py                     # FastAPI app factory, CORS, router
│       ├── core/
│       │   └── config.py              # Settings (Pydantic BaseSettings)
│       ├── api/
│       │   └── routes.py             # All API route definitions (615 lines)
│       ├── auth/
│       │   ├── routers.py            # Auth endpoints (register, login, Google, profile)
│       │   ├── security.py           # JWT create/decode, bcrypt, OAuth2 scheme
│       │   └── service.py            # AuthService (user CRUD, password ops)
│       ├── db/
│       │   ├── session.py            # SQLAlchemy engine + session factory
│       │   ├── models.py            # ORM models (User, Expense, ExpenseItem, RecurringTemplate)
│       │   ├── schema.sql           # Raw DDL for PostgreSQL (trackspense schema)
│       │   ├── postgres.py          # Postgres connection helper
│       │   └── database.py          # Database utility
│       ├── models/
│       │   └── api_models.py        # Pydantic request/response models (222 lines)
│       ├── repo/
│       │   └── postgres_repo.py     # Repository for receipt-based expenses + items
│       └── services/
│           ├── expense_service.py    # CRUD for expenses
│           ├── receipt_service.py    # OCR receipt parsing (OpenAI/Ollama)
│           ├── analysis_service.py   # Analytics aggregation with caching
│           ├── chat_service.py       # LLM chat routing (OpenAI/Ollama)
│           ├── categorization_service.py  # AI expense categorization
│           ├── recurring_service.py  # Recurring expense template management
│           ├── email_service.py      # SMTP email sending
│           └── auth_service.py       # (alias)
│
├── varavu_selavu_ui/                   # WEB FRONTEND
│   ├── Dockerfile                      # Node 18 build + nginx serve
│   ├── package.json
│   ├── tsconfig.json
│   ├── nginx.conf                      # SPA routing config
│   ├── .env.development                # REACT_APP_API_BASE_URL, GOOGLE_CLIENT_ID
│   ├── .env.production
│   ├── public/                         # Static assets
│   └── src/
│       ├── App.tsx                     # Root: Router, Auth guard, AppBar, Recurring prompt
│       ├── theme.ts                    # MUI theme (glassmorphism, gradients)
│       ├── index.tsx                   # React DOM root
│       ├── index.css                   # Global styles
│       ├── api/                        # API client layer
│       │   ├── apiconfig.ts           # Base URL resolution (dev/prod)
│       │   ├── api.ts                 # Generic fetch wrapper
│       │   ├── auth.ts               # Login, register, logout, refresh, Google
│       │   ├── expenses.ts           # CRUD + receipt parse + with_items
│       │   ├── analysis.ts           # Analysis GET + chat POST
│       │   ├── recurring.ts          # Templates, due, confirm, execute_now
│       │   ├── profile.ts            # Profile GET/PUT
│       │   └── models.ts             # Shared TypeScript interfaces
│       ├── pages/                      # Page-level components
│       │   ├── HomePage.tsx           # Landing / marketing page (public)
│       │   ├── LoginPage.tsx          # Login form + Google Sign-In
│       │   ├── RegisterPage.tsx       # Registration form
│       │   ├── ForgotPasswordPage.tsx # Password reset
│       │   ├── DashboardPage.tsx      # Main dashboard with metrics
│       │   ├── ExpensesPage.tsx       # Expense list + add/edit/delete
│       │   ├── ExpenseAnalysisPage.tsx # Charts + category breakdown
│       │   ├── AIAnalystPage.tsx      # Chat interface with AI
│       │   ├── RecurringPage.tsx      # Manage recurring templates
│       │   └── ProfilePage.tsx        # User profile management
│       ├── components/
│       │   ├── layout/               # MainLayout, UserMenu, Drawer
│       │   ├── dashboard/            # Dashboard cards, widgets
│       │   ├── expenses/             # Expense forms, RecurringPrompt
│       │   ├── analysis/             # Chart components
│       │   ├── ai-analyst/           # Chat UI components
│       │   └── common/               # Shared UI components
│       └── utils/                     # Utility functions
│
└── varavu_selavu_mobile/               # MOBILE APPLICATION
    ├── App.tsx                         # Root: Navigation, AuthProvider, Drawer
    ├── app.json                        # Expo config
    ├── package.json
    ├── tsconfig.json
    ├── index.js                        # Entry point
    ├── generate_assets.js              # Asset generation script
    ├── android/                        # Native Android project
    ├── ios/                            # Native iOS project
    ├── assets/                         # Icons, splash screens
    └── src/
        ├── theme.ts                    # Design tokens & color system
        ├── api/                        # API client layer
        │   ├── apiconfig.ts           # Base URL (Cloud Run prod / local dev)
        │   ├── apiFetch.ts            # Axios wrapper + token refresh + 401 logout
        │   ├── auth.ts               # Login, register, logout
        │   ├── expenses.ts           # CRUD + receipt parse + with_items
        │   ├── analysis.ts           # Analysis + chat
        │   ├── recurring.ts          # Recurring templates
        │   ├── chat.ts               # Chat-specific API
        │   └── email.ts              # Email sending API
        ├── context/
        │   └── AuthContext.tsx        # Auth state + SecureStore persistence
        ├── constants/
        │   └── categories.ts         # Shared category taxonomy
        ├── screens/
        │   ├── LoginScreen.tsx        # Login form
        │   ├── RegisterScreen.tsx     # Registration form
        │   ├── HomeScreen.tsx         # Dashboard home
        │   ├── AddExpenseScreen.tsx   # Add expense + receipt camera
        │   ├── ExpensesScreen.tsx     # Expense history list
        │   ├── AnalysisScreen.tsx     # Charts + statistics
        │   ├── AIAnalystScreen.tsx    # AI chat interface
        │   ├── RecurringExpensesScreen.tsx  # Recurring management
        │   ├── AboutScreen.tsx        # About the app
        │   ├── FeatureRequestScreen.tsx    # Submit feature requests
        │   └── ContactUsScreen.tsx    # Contact form
        └── components/
            ├── Card.tsx               # Reusable card container
            ├── CustomButton.tsx       # Themed button
            ├── CustomInput.tsx        # Themed text input
            ├── ScreenWrapper.tsx      # Screen container with safe area
            ├── CategoryDonutChart.tsx # Category pie/donut chart
            ├── TrendLineChart.tsx     # Monthly trend line chart
            ├── RecurringPrompt.tsx    # Auto-prompt for due recurring expenses
            ├── SkeletonLoader.tsx     # Loading placeholder
            ├── TabIcon.tsx            # Bottom tab icon component
            └── Toast.tsx              # Toast notification system
```

---

## 7. Database Design

### 7.1 Schema

All tables reside in the `trackspense` PostgreSQL schema.

```sql
CREATE SCHEMA IF NOT EXISTS trackspense;
```

### 7.2 Entity-Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ EXPENSES : "has many"
    USERS ||--o{ EXPENSE_ITEMS : "has many"
    USERS ||--o{ RECURRING_TEMPLATES : "has many"
    USERS ||--o{ ITEM_INSIGHTS : "has many"
    USERS ||--o{ MERCHANT_INSIGHTS : "has many"
    EXPENSES ||--o{ EXPENSE_ITEMS : "contains"
    ITEM_INSIGHTS ||--o{ ITEM_PRICE_HISTORY : "tracks"
    MERCHANT_INSIGHTS ||--o{ MERCHANT_AGGREGATES : "tracks"

    USERS {
        UUID id PK
        VARCHAR(255) email UK "NOT NULL"
        VARCHAR(255) name
        VARCHAR(50) phone
        VARCHAR(255) password_hash "NOT NULL"
        TIMESTAMPTZ created_at
    }

    EXPENSES {
        UUID id PK
        VARCHAR(255) user_email FK "NOT NULL"
        TIMESTAMPTZ purchased_at
        VARCHAR(255) merchant_name
        VARCHAR(255) merchant_id
        VARCHAR(100) category_id "NOT NULL"
        NUMERIC_12_2 amount "NOT NULL"
        VARCHAR(10) currency "DEFAULT USD"
        NUMERIC_12_2 tax "DEFAULT 0"
        NUMERIC_12_2 tip "DEFAULT 0"
        NUMERIC_12_2 discount "DEFAULT 0"
        VARCHAR(100) payment_method
        TEXT description
        TEXT notes
        VARCHAR(255) fingerprint "dedup marker"
        TIMESTAMPTZ created_at
    }

    EXPENSE_ITEMS {
        UUID id PK
        UUID expense_id FK "NOT NULL"
        VARCHAR(255) user_email FK "NOT NULL"
        INTEGER line_no "NOT NULL"
        VARCHAR(255) item_name "NOT NULL"
        VARCHAR(255) normalized_name
        VARCHAR(100) category_id
        NUMERIC_10_2 quantity
        VARCHAR(50) unit
        NUMERIC_12_2 unit_price
        NUMERIC_12_2 line_total "NOT NULL"
        NUMERIC_12_2 tax "DEFAULT 0"
        NUMERIC_12_2 discount "DEFAULT 0"
        JSONB attributes_json
        TIMESTAMPTZ created_at
    }

    RECURRING_TEMPLATES {
        UUID id PK
        VARCHAR(255) user_email FK "NOT NULL"
        VARCHAR(255) description "NOT NULL"
        VARCHAR(100) category "NOT NULL"
        INTEGER day_of_month "1-31"
        NUMERIC_12_2 default_cost "NOT NULL"
        DATE start_date "NOT NULL"
        DATE last_processed_date
        VARCHAR(50) status "DEFAULT Active"
        TIMESTAMPTZ created_at
    }

    ITEM_INSIGHTS {
        UUID id PK
        VARCHAR(255) user_email FK "NOT NULL"
        VARCHAR(255) normalized_name "NOT NULL"
        NUMERIC_12_2 avg_unit_price
        NUMERIC_12_2 min_price
        NUMERIC_12_2 max_price
        NUMERIC_12_2 total_quantity_bought
        NUMERIC_12_2 total_spent
        TIMESTAMPTZ created_at
    }

    ITEM_PRICE_HISTORY {
        UUID id PK
        UUID item_insight_id FK "NOT NULL"
        UUID expense_id FK "NOT NULL"
        VARCHAR(255) store_name
        DATE date
        NUMERIC_12_2 quantity
        NUMERIC_12_2 unit_price
        TIMESTAMPTZ created_at
    }

    MERCHANT_INSIGHTS {
        UUID id PK
        VARCHAR(255) user_email FK "NOT NULL"
        VARCHAR(255) merchant_name "NOT NULL"
        NUMERIC_12_2 total_spent
        INTEGER transaction_count
        TIMESTAMPTZ created_at
    }

    MERCHANT_AGGREGATES {
        UUID id PK
        UUID merchant_insight_id FK "NOT NULL"
        INTEGER year
        INTEGER month
        NUMERIC_12_2 total_spent
        INTEGER transaction_count
        TIMESTAMPTZ created_at
    }
```

### 7.3 Indexes
| Table | Index | Purpose |
|:---|:---|:---|
| `expenses` | `idx_expenses_user_email` | Fast user-scoped queries |
| `expenses` | `idx_expenses_purchased_at` | Time-range lookups |
| `expense_items` | `idx_expense_items_expense_id` | Fast item lookup by parent |
| `recurring_templates` | `idx_recurring_templates_user_email` | User-scoped template queries |

### 7.4 Key Design Decisions
- **UUID primary keys** — generated via `gen_random_uuid()` (PostgreSQL) or `uuid.uuid4()` (Python)
- **Cascade deletes** — deleting a user cascades to all expenses, items, and templates
- **`trackspense` schema** — isolates app tables from the `public` schema
- **Dual-mode date handling** — dates stored as `TIMESTAMPTZ` in DB; API accepts MM/DD/YYYY or YYYY-MM-DD strings; internal conversion handled by `ExpenseService`
- **Fingerprint column** — SHA-256 hash for receipt deduplication
- **SQLite fallback** — if `DATABASE_URL` is empty, falls back to SQLite for local testing

---

## 8. Backend API Specification

All endpoints are prefixed with `/api/v1`.

### 8.1 Health Endpoints
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/healthz` | No | Liveness probe → `{"status": "healthy"}` |
| `GET` | `/readyz` | No | Readiness probe → `{"status": "healthy"}` |

### 8.2 Authentication Endpoints (`/api/v1/auth/`)
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `POST` | `/auth/register` | No | Register new user (name, phone, email, password) |
| `POST` | `/auth/login` | No | OAuth2 password form → access + refresh tokens |
| `POST` | `/auth/google` | No | Google ID token → access + refresh tokens |
| `POST` | `/auth/refresh` | No | Exchange refresh token for new token pair |
| `POST` | `/auth/logout` | No | Revoke refresh token |
| `POST` | `/auth/forgot-password` | No | Reset password by email |
| `GET` | `/auth/me` | Yes | Get current user email |
| `GET` | `/auth/profile` | Yes | Get user profile (email, name, phone) |
| `PUT` | `/auth/profile` | Yes | Update name and/or phone |

### 8.3 Expense Endpoints
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `POST` | `/expenses` | Yes | Create a new expense |
| `GET` | `/expenses?user_id=&limit=30&offset=0` | Yes | Paginated expense list |
| `PUT` | `/expenses/{row_id}` | Yes | Update an expense |
| `DELETE` | `/expenses/{row_id}` | Yes | Delete an expense |
| `POST` | `/expenses/categorize` | Yes | AI-suggest category for a description |
| `POST` | `/expenses/with_items` | Yes | Create expense with itemized receipt lines |

### 8.4 Receipt Ingestion
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `POST` | `/ingest/receipt/parse` | Yes | Upload receipt image/PDF → parsed JSON |

### 8.5 Analysis Endpoints
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/analysis?user_id=&year=&month=&start_date=&end_date=` | Yes | Expense analytics |
| `POST` | `/analysis/chat` | Yes | AI chat about expenses |
| `GET` | `/analytics/items` | Yes | Paginated list of top item insights |
| `GET` | `/analytics/items/{item_name}` | Yes | Detail for a specific item, including history |
| `GET` | `/analytics/merchants` | Yes | Paginated list of top merchant insights |
| `GET` | `/analytics/merchants/{merchant_name}` | Yes | Detail for a specific merchant, including item list |

### 8.6 Recurring Expense Endpoints
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/recurring/templates` | Yes | List all recurring templates |
| `POST` | `/recurring/upsert` | Yes | Create or update a recurring template |
| `GET` | `/recurring/due?as_of=` | Yes | Get due recurring occurrences |
| `POST` | `/recurring/confirm` | Yes | Confirm due occurrences → create expenses |
| `POST` | `/recurring/execute_now` | Yes | Execute one template for current month |
| `DELETE` | `/recurring/templates/{template_id}` | Yes | Delete a recurring template |

### 8.7 Model & Email Endpoints
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/models` | No | List available LLM models |
| `POST` | `/email/send` | Yes | Send feature request / contact email |

---

## 9. Authentication & Security

### 9.1 JWT Token System
- **Algorithm:** HS256
- **Access Token Expiry:** 30 minutes (configurable via `JWT_EXPIRE_MINUTES`)
- **Refresh Token Expiry:** 7 days (10,080 minutes)
- **Secret:** Configured via `JWT_SECRET` environment variable
- **Token Structure:** `{"sub": "<user_email>", "type": "access|refresh", "exp": <timestamp>}`
- **Transport:** `Authorization: Bearer <token>` header
- **OAuth2 Scheme:** `OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")`

### 9.2 Password Security
- **Hashing:** bcrypt with auto-generated salt
- **Verification:** `bcrypt.checkpw()` with fallback to plaintext comparison (for migrated accounts)

### 9.3 Google OAuth Integration
- **Flow:** Client sends Google ID token → backend verifies via `google.oauth2.id_token.verify_oauth2_token`
- **Auto-registration:** If Google user doesn't exist, auto-creates account with empty password
- **Env Var:** `GOOGLE_CLIENT_ID` must be set on backend; `REACT_APP_GOOGLE_CLIENT_ID` on web frontend

### 9.4 Token Refresh & Revocation
- **Refresh:** `POST /auth/refresh` with `refresh_token` body → new access + refresh pair
- **Logout:** `POST /auth/logout` → adds refresh token to in-memory revocation set
- **Mobile:** `apiFetch` wrapper auto-refreshes on 401 or forces logout if refresh fails

### 9.5 CORS Configuration
Allowed origins (configured in `config.py`):
- `http://localhost:3000`, `http://127.0.0.1:3000` (local dev)
- `https://varavu-selavu-frontend-952416556244.us-central1.run.app` (Cloud Run)
- `https://cerebroos.com`, `https://www.cerebroos.com`, `https://expense.cerebroos.com` (custom domains)

---

## 10. AI/ML Services

### 10.1 Receipt OCR Parsing (`ReceiptService`)

**Engine Selection:** Controlled by `OCR_ENGINE` env var (default: `openai`).

| Engine | When Used | How It Works |
|:---|:---|:---|
| `openai` | Production / default | Sends receipt image as base64 (or PDF via file upload) to OpenAI Vision API |
| `ollama` | Local development | Sends base64-encoded image to local Ollama `/api/generate` |
| `mock` | Unit tests | Parses structured text format directly |

**OpenAI Vision Prompt (System):**
> "You are an expert receipt parsing assistant. Given a grocery receipt, return a JSON object with a `header` and an `items` array. The header must include merchant_name, purchased_at (ISO 8601), currency, amount (total), tax, tip, discount, description, main_category_name, and category_name. Choose main and sub categories from: [CATEGORY_PROMPT]. For each line item provide line_no, item_name, quantity, unit, unit_price, line_total, and category_name. Correct any misspelled or partial item names using your knowledge of grocery products. All monetary values must be floating point dollars exactly as shown on the receipt with no rounding. Respond only with JSON."

**Model:** `gpt-4o-mini` (configurable via `OCR_MODEL`)  
**Timeout:** 180 seconds (configurable via `LLM_TIMEOUT_SEC`)

**Fingerprint Generation:**
```python
fp_source = f"{merchant_name}{purchased_at[:13]}{amount}{top_3_item_names}"
fingerprint = hashlib.sha256(fp_source.encode()).hexdigest()
```

### 10.2 AI Chat Service (`ChatService`)

**Provider Routing:**
```
if ENVIRONMENT in {"prod", "production"} → OpenAI
else → Ollama (local)
```

**System Prompt:**
```
"You are a financial analyst.\n\nAnalysis data:\n {analysis_json}"
```

**OpenAI Config:**
- API: `https://api.openai.com/v1/chat/completions`
- Default Model: `gpt-5-mini` (configurable via `OPENAI_MODEL`)
- Timeout: 300 seconds

**Ollama Config:**
- API: `http://localhost:11434/api/chat`
- Default Model: `gpt-oss:20b` (configurable via `OLLAMA_MODEL`)
- Timeout: 300 seconds

**Context Injection:** Before each chat request, the `AnalysisService.analyze()` is called (without cache) to get fresh data for the requested user/period. This analysis JSON is injected as the system prompt context.

### 10.3 AI Categorization Service (`CategorizationService`)

Uses the chat model to classify expense descriptions.

**LLM Prompt:**
```
"You categorize expense descriptions. Available categories: {CATEGORY_GROUPS_JSON}. 
Also infer the merchant or company name from the description if it can be identified.
Strictly respond with ONLY JSON: {"main_category":"...", "subcategory":"...", "merchant_name":"..."}
Description: '{user_description}'."
```

**Fallback:** If LLM fails or returns invalid categories → returns `("Other", "General", None)`

**JSON Response Parsing:** Handles multiple LLM response formats:
- Plain JSON
- Double-encoded JSON strings
- Code-fenced JSON (```json blocks)
- JSON embedded within prose text

---

## 11. Web Frontend Application

### 11.1 Architecture
- **Framework:** React 19 + TypeScript
- **Routing:** React Router v6 (BrowserRouter)
- **State:** Local state + `localStorage` for auth; TanStack React Query for server state
- **UI Framework:** Material-UI (MUI) v7
- **Charts:** Plotly.js via `react-plotly.js`
- **Styling:** Emotion CSS-in-JS via MUI Theme

### 11.2 Theme Design System
- **Primary Color:** `#4F46E5` (Indigo)
- **Secondary Color:** `#14B8A6` (Teal)
- **Background:** `#F6F7FB`
- **Border Radius:** 12px globally
- **Typography:** Inter, Roboto, Helvetica, Arial
- **Glassmorphism:** `backdrop-filter: blur(12px)` on Paper, AppBar, Drawer
- **AppBar Gradient:** `linear-gradient(135deg, rgba(79,70,229,0.7), rgba(20,184,166,0.7))`
- **Card Hover:** `translateY(-2px)` transform on hover

### 11.3 Route Map
| Path | Component | Auth Required | Description |
|:---|:---|:---|:---|
| `/` | `HomePage` | No | Landing page |
| `/login` | `LoginPage` | No | Login form + Google Sign-In |
| `/register` | `RegisterPage` | No | Registration form |
| `/forgot-password` | `ForgotPasswordPage` | No | Password reset |
| `/dashboard` | `DashboardPage` | Yes | Main dashboard |
| `/expenses` | `ExpensesPage` | Yes | Expense list + CRUD |
| `/analysis` | `ExpenseAnalysisPage` | Yes | Charts + analytics |
| `/recurring` | `RecurringPage` | Yes | Recurring management |
| `/ai-analyst` | `AIAnalystPage` | Yes | Chat with AI |
| `/profile` | `ProfilePage` | Yes | Profile management |

### 11.4 Auth Guard
```typescript
const RequireAuth = ({ children }) => {
  const token = localStorage.getItem('vs_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
};
```

### 11.5 Local Storage Keys
| Key | Purpose |
|:---|:---|
| `vs_token` | JWT access token |
| `vs_refresh` | JWT refresh token |
| `vs_user` | User email |

### 11.6 Layout
- **Authenticated:** Sidebar drawer (`MainLayout`) + top AppBar with user menu
- **Unauthenticated:** Top AppBar with Login button only
- **Responsive:** Hamburger menu on mobile breakpoints
- **Recurring Prompt:** Auto-shows on login if recurring expenses are due

### 11.7 API Client Layer
- **Base URL (dev):** `http://localhost:8080` (via `REACT_APP_API_BASE_URL`)
- **Base URL (prod):** Set via `REACT_APP_API_BASE_URL` env var at build time
- **React Query:** 1-minute stale time, 5-minute garbage collection, no refetch on window focus

---

## 12. Mobile Application

### 12.1 Architecture
- **Framework:** React Native 0.81.5 + Expo SDK 54
- **Navigation:** React Navigation v6 (Native Stack + Bottom Tabs)
- **State Management:** React Context API (`AuthContext`)
- **Secure Storage:** `expo-secure-store` (encrypted key-value store)
- **HTTP Client:** Axios with custom interceptor (`apiFetch`)

### 12.2 Navigation Structure

```mermaid
graph TD
    A[App Root] --> B{Authenticated?}
    B -->|No| C[Auth Stack]
    C --> D[Login Screen]
    C --> E[Register Screen]
    B -->|Yes| F[App Shell]
    F --> G[Main Bottom Tabs]
    G --> H["🏠 Home (Dashboard)"]
    G --> I["📋 History (Expenses)"]
    G --> J["＋ Add Expense"]
    G --> K["📊 Stats (Analysis)"]
    G --> L["🤖 AI Chat (AI Analyst)"]
    F --> M[Custom Drawer]
    M --> N[Home]
    M --> O["🔁 Recurring Expenses"]
    M --> P["ℹ️ About App"]
    M --> Q["💡 Feature Request"]
    M --> R["✉️ Contact Us"]
    M --> S["🚪 Logout"]
    F --> T[Recurring Prompt Auto-popup]
```

### 12.3 Bottom Tab Bar
| Position | Icon | Label | Screen |
|:---|:---|:---|:---|
| 1 | 🏠 | Home | `HomeScreen` |
| 2 | 📋 | History | `ExpensesScreen` |
| 3 (center) | ＋ | Add | `AddExpenseScreen` |
| 4 | 📊 | Stats | `AnalysisScreen` |
| 5 | 🤖 | AI Chat | `AIAnalystScreen` |

### 12.4 Auth Flow
1. App starts → `AuthContext` reads `access_token` and `user_email` from `SecureStore`
2. If token exists → show `AppShell` (main navigation)
3. If no token → show `AuthStack` (Login/Register)
4. On login → API returns tokens → stored in `SecureStore`
5. On logout → tokens deleted from `SecureStore` → state cleared → navigate to login
6. On 401 from any API → `apiFetch` attempts token refresh → if fails, forces logout

### 12.5 SecureStore Keys
| Key | Purpose |
|:---|:---|
| `access_token` | JWT access token |
| `refresh_token` | JWT refresh token |
| `user_email` | Current user email |

### 12.6 Custom Drawer
- Animated slide-in from left (260ms animation)
- Width: 78% of screen
- Items: Home, Recurring Expenses, About App, Submit Feature Request, Contact Us
- Footer: Logout button (red themed)
- Shows current user email

### 12.7 API Configuration
- **Production:** `https://varavu-selavu-backend-952416556244.us-central1.run.app`
- **Development:** Configurable via `EXPO_PUBLIC_API_URL` env var
- **Android Emulator:** Use `10.0.2.2:8000` for localhost mapping
- **iOS Simulator:** `localhost:8000` works directly
- **Physical Device:** Use computer's LAN IP

### 12.8 Shared Components
| Component | Purpose |
|:---|:---|
| `Card` | Reusable card container with shadow |
| `CustomButton` | Themed button with variants |
| `CustomInput` | Themed text input |
| `ScreenWrapper` | Screen container with safe area padding |
| `CategoryDonutChart` | Donut/pie chart for category breakdown |
| `TrendLineChart` | Line chart for monthly spending trends |
| `RecurringPrompt` | Modal prompt for due recurring expenses |
| `SkeletonLoader` | Loading placeholder animation |
| `TabIcon` | Bottom tab icon with label |
| `Toast` | Toast notification system |

---

## 13. Expense Category Taxonomy

The following category hierarchy is shared across backend, web, and mobile. It is the single source of truth for categorization.

```json
{
  "Home": [
    "Rent", "Electronics", "Furniture", "Household supplies",
    "Maintenance", "Mortgage", "Other", "Pets", "Services"
  ],
  "Transportation": [
    "Gas/fuel", "Car", "Parking", "Plane", "Other",
    "Bicycle", "Bus/Train", "Taxi", "Hotel"
  ],
  "Food & Drink": [
    "Groceries", "Dining out", "Liquor", "Other"
  ],
  "Entertainment": [
    "Movies", "Other", "Games", "Music", "Sports"
  ],
  "Life": [
    "Medical expenses", "Insurance", "Taxes", "Education",
    "Childcare", "Clothing", "Gifts", "Other"
  ],
  "Other": [
    "Services", "General", "Electronics"
  ],
  "Utilities": [
    "Heat/gas", "Electricity", "Water", "Other",
    "Cleaning", "Trash", "TV/Phone/Internet"
  ]
}
```

**Total:** 7 main categories, 44 subcategories.

This taxonomy is defined in three locations:
1. **Backend:** `receipt_service.py` → `CATEGORY_GROUPS` and `categorization_service.py` → `CATEGORY_GROUPS`
2. **Web Frontend:** Used inline in page components
3. **Mobile:** `src/constants/categories.ts` → `CATEGORY_GROUPS`

---

## 14. Deployment & Infrastructure

### 14.1 Cloud Platform
- **Provider:** Google Cloud Platform (GCP)
- **Project ID:** `gold-circlet-424313-r7`
- **Region:** `us-central1`
- **Services:** Google Cloud Run (serverless containers)

### 14.2 Production Services
| Service | Cloud Run Name | Port | URL Pattern |
|:---|:---|:---|:---|
| Backend | `varavu-selavu-backend` | 8080 | `https://varavu-selavu-backend-952416556244.us-central1.run.app` |
| Frontend | `varavu-selavu-frontend` | 8080 | `https://varavu-selavu-frontend-952416556244.us-central1.run.app` |

### 14.3 Custom Domains (via Cloudflare)
- `https://expense.cerebroos.com` → Frontend
- `https://cerebroos.com`, `https://www.cerebroos.com` → Also configured in CORS

### 14.4 Backend Docker Image
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml poetry.lock /app/
RUN pip install poetry && poetry config virtualenvs.create false && poetry install
COPY . /app
EXPOSE 8080
CMD ["poetry", "run", "uvicorn", "varavu_selavu_service.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### 14.5 Frontend Docker Image
```dockerfile
FROM node:18 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
RUN npm run build

FROM nginx:alpine AS production
ENV NODE_ENV=production
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN sed -i 's/listen       80;/listen       8080;/' /etc/nginx/conf.d/default.conf || true
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

### 14.6 CI/CD Pipeline (Cloud Build)
Defined in `cloudbuild.yaml`:
1. Build backend Docker image → tag `gcr.io/${PROJECT_ID}/varavu-selavu-backend`
2. Build frontend Docker image → tag `gcr.io/${PROJECT_ID}/varavu-selavu-frontend`
3. Push both images to GCR
4. Deploy backend to Cloud Run
5. Deploy frontend to Cloud Run

### 14.7 Local Development (docker-compose)
```yaml
services:
  varavu_selavu_ui:
    build: ./varavu_selavu_ui
    ports: ["8080:8080"]
    depends_on: [varavu_selavu_app]

  varavu_selavu_app:
    build: ./varavu_selavu_app
    ports: ["8000:8000"]
```

### 14.8 Mobile App Distribution
- **Development:** `npx expo start` → QR code for Expo Go app
- **Android Build:** `npx expo run:android` or EAS Build
- **iOS Build:** `npx expo run:ios` (requires Mac/Xcode) or EAS Build
- **Store Submission:** Via Expo Application Services (EAS)
  ```bash
  npm install -g eas-cli
  eas build --profile production --platform all
  ```

---

## 15. Environment Configuration

### 15.1 Backend Environment Variables (`.env`)

```env
# --- App & Environment ---
PROJECT_NAME="TrackSpense Service"
VERSION="1.0.0"
DEBUG=true
ENVIRONMENT=local                        # local | production

# --- Database ---
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# --- CORS ---
CORS_ALLOW_ORIGINS='["http://localhost:3000"]'

# --- JWT ---
JWT_SECRET=your-secret-key-here
JWT_EXPIRE_MINUTES=30

# --- Analysis Cache ---
ANALYSIS_CACHE_TTL_SEC=60

# --- OCR / Receipt Parsing ---
OCR_ENGINE=openai                        # openai | ollama | mock
OCR_MODEL=gpt-4o-mini
MAX_UPLOAD_MB=12
ALLOWED_MIME=image/png,image/jpeg,application/pdf
LLM_TIMEOUT_SEC=180

# --- Chat Providers ---
# OpenAI (production)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-mini
OPENAI_TIMEOUT_SEC=300

# Ollama (local)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gpt-oss:20b
OLLAMA_TIMEOUT_SEC=300

# --- Google OAuth ---
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com

# --- Email (SMTP via Gmail) ---
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_FROM=your-email@gmail.com
MAIL_PORT=587
MAIL_SERVER=smtp.gmail.com
```

### 15.2 Web Frontend Environment Variables

**`.env.development`:**
```env
REACT_APP_API_BASE_URL=http://localhost:8080
REACT_APP_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```

**`.env.production`:**
```env
REACT_APP_API_BASE_URL=https://varavu-selavu-backend-952416556244.us-central1.run.app
REACT_APP_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```

### 15.3 Mobile Environment Variables
- `EXPO_PUBLIC_API_URL` — Override development API URL
- Production URL hardcoded in `apiconfig.ts`

---

## 16. Development Setup Guide

### 16.1 Prerequisites
- Python 3.9+ with Poetry
- Node.js 18+
- PostgreSQL instance (or use SQLite fallback for quick testing)
- Expo Go app on mobile device (for mobile development)
- Optional: Ollama for local LLM (AI features in dev)

### 16.2 Backend Setup
```bash
cd varavu_selavu_app
poetry install
cp varavu_selavu_service/.env.example varavu_selavu_service/.env
# Edit .env with your DATABASE_URL, JWT_SECRET, OPENAI_API_KEY, etc.
poetry run uvicorn varavu_selavu_service.main:app --host 0.0.0.0 --port 8000 --reload
```

**Verify:** `curl http://localhost:8000/api/v1/healthz` → `{"status":"healthy"}`

### 16.3 Web Frontend Setup
```bash
cd varavu_selavu_ui
npm install
# Create .env.development with REACT_APP_API_BASE_URL=http://localhost:8000
npm start
```

**Verify:** Open `http://localhost:3000`

### 16.4 Mobile App Setup
```bash
cd varavu_selavu_mobile
npm install
node generate_assets.js                  # Generate placeholder icon/splash assets
npx expo start                           # Start Expo dev server
# Scan QR code with Expo Go app, or:
npx expo run:android                     # Run on Android emulator
npx expo run:ios                         # Run on iOS simulator (Mac only)
```

### 16.5 Makefile Shortcuts
```bash
make install-all          # Install all dependencies
make start-backend        # Start backend (0.0.0.0:8000)
make start-web            # Start web frontend
make start-mobile-android # Start Android
make start-mobile-ios     # Start iOS
make test-backend         # Run backend tests
```

### 16.6 Database Initialization
```bash
# Connect to PostgreSQL and run:
psql -U your_user -d your_db -f varavu_selavu_app/varavu_selavu_service/db/schema.sql
```

Or let SQLAlchemy create tables automatically (the ORM models define the schema).

---

## 17. Future Roadmap

### Planned Features (from product docs)

#### Item-Level AI Analyst (In Design)
- New tables: `item_insights`, `item_price_history`, `merchant_insights`, `merchant_aggregates`
- Pre-calculation pipeline that aggregates item data at expense save time
- New API endpoints: `GET /analytics/items`, `GET /analytics/items/{name}`, `GET /analytics/merchants`, `GET /analytics/merchants/{name}`
- RAG-enhanced chat: Intent detection routes to item/merchant data vs. general analysis
- UI: "Item Insights" and "Merchant Insights" screens on both web and mobile
- Features: Historical price tracking, store price comparison, personal inflation calculator

#### Strategic Vision
- LLM entity normalization (canonical product/merchant matching)
- Text-to-SQL agent for complex analytical queries
- Discretionary micro-habit detection
- Proactive dynamic chat prompt suggestions
- Granular tax categorization for freelancers

---

## Appendix: Full API Contract Reference

### A.1 Request/Response Models (Pydantic)

#### `ExpenseRequest`
```json
{
  "user_id": "string (email)",
  "cost": 0.0,
  "category": "string (e.g., 'Food & Drink - Groceries')",
  "description": "string",
  "date": "string (MM/DD/YYYY)",
  "merchant_name": "string | null"
}
```

#### `ExpenseRow` (Response)
```json
{
  "user_id": "string",
  "date": "MM/DD/YYYY",
  "description": "string",
  "category": "string",
  "cost": 0.0,
  "merchant_name": "string | null",
  "row_id": "string (UUID)"
}
```

#### `ReceiptParseResponse`
```json
{
  "header": {
    "merchant_name": "string",
    "purchased_at": "ISO 8601",
    "currency": "USD",
    "amount": 0.0,
    "tax": 0.0,
    "tip": 0.0,
    "discount": 0.0,
    "description": "string",
    "main_category_name": "string",
    "category_name": "string"
  },
  "items": [
    {
      "line_no": 1,
      "item_name": "string",
      "quantity": 1.0,
      "unit": "string",
      "unit_price": 0.0,
      "line_total": 0.0,
      "category_name": "string"
    }
  ],
  "warnings": [],
  "fingerprint": "sha256 hex string",
  "ocr_text": "string | null"
}
```

#### `ExpenseWithItemsRequest`
```json
{
  "user_email": "string",
  "header": {
    "purchased_at": "ISO 8601",
    "amount": 0.0,
    "merchant_name": "string",
    "tax": 0.0,
    "tip": 0.0,
    "discount": 0.0,
    "fingerprint": "string",
    "description": "string",
    "category_name": "string"
  },
  "items": [
    {
      "line_no": 1,
      "item_name": "string",
      "normalized_name": "string | null",
      "category_id": "string | null",
      "quantity": 1.0,
      "unit": "string | null",
      "unit_price": 0.0,
      "line_total": 0.0,
      "tax": 0.0,
      "discount": 0.0,
      "attributes_json": "string | null"
    }
  ]
}
```

#### `CategorizeRequest` / `CategorizeResponse`
```json
// Request
{ "description": "Starbucks coffee" }

// Response
{
  "main_category": "Food & Drink",
  "subcategory": "Dining out",
  "merchant_name": "Starbucks"
}
```

#### `ChatRequest`
```json
{
  "user_id": "string (email)",
  "query": "How much did I spend on groceries this month?",
  "year": 2026,
  "month": 3,
  "start_date": "2026-03-01",
  "end_date": "2026-03-31",
  "model": "gpt-5-mini"
}
```

#### `ChatResponse`
```json
{
  "response": "Based on your data, you spent $456.78 on groceries this month..."
}
```

#### `AnalysisResponse`
```json
{
  "top_categories": ["Food & Drink", "Transportation", "Utilities", "Life", "Home"],
  "category_totals": [
    { "category": "Food & Drink", "total": 456.78 }
  ],
  "monthly_trend": [
    { "month": "2026-01", "total": 1234.56 }
  ],
  "total_expenses": 5678.90,
  "category_expense_details": {
    "Food & Drink": [
      { "date": "2026-03-10", "description": "Grocery shopping", "category": "Food & Drink", "cost": 89.50 }
    ]
  },
  "filter_info": {
    "applied_user_col": "user_email",
    "year": 2026,
    "month": 3,
    "row_count": 42
  }
}
```

#### `RecurringTemplateDTO`
```json
{
  "id": "UUID string",
  "description": "Netflix",
  "category": "Entertainment - Other",
  "day_of_month": 15,
  "default_cost": 15.99,
  "start_date_iso": "2026-01-15",
  "last_processed_iso": "2026-02-15",
  "status": "Active"
}
```

#### `TokenResponse` (Auth)
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "email": "user@example.com"
}
```

#### `SendEmailRequest`
```json
{
  "form_type": "feature_request",
  "user_email": "user@example.com",
  "subject": "Add dark mode",
  "message_body": "I would love dark mode support...",
  "name": "John Doe"
}
```

### A.2 Validation Rules
| Field | Rule |
|:---|:---|
| `ExpenseRequest.date` | Must match pattern `\d{2}/\d{2}/\d{4}` (MM/DD/YYYY) |
| `ExpenseRequest.cost` | Float (no explicit min, but recurring rejects ≤ 0) |
| `RecurringTemplate.day_of_month` | Integer, 1 ≤ value ≤ 31 |
| `ChatRequest.year` | Integer, 1970 ≤ value ≤ 2100 |
| `ChatRequest.month` | Integer, 1 ≤ value ≤ 12 |
| `RegisterRequest.email` | Valid email (Pydantic `EmailStr`) |
| `ExpenseWithItems` validation | `sum(item.line_total) + tax + tip - discount ≈ header.amount` (tolerance: $0.02) |
| Receipt deduplication | Existing fingerprint returns HTTP 409 unless `force=true` |

### A.3 Error Response Format
```json
{
  "code": "error",
  "message": "Human-readable description",
  "details": { "key": "value" }
}
```

HTTP status codes used: `200`, `201`, `400`, `401`, `409`, `500`, `502`.

---

*This document is the single comprehensive reference for the TrackSpense product. It contains sufficient detail for any developer, agent, or LLM to understand, maintain, extend, or fully re-implement the application.*
