# TrackSpense Web Frontend

The React-based web application for the TrackSpense expense tracking platform. Features a modern glassmorphism UI, interactive charts, AI-powered receipt scanning, a conversational financial analyst, and recurring expense management.

---

## Tech Stack

| Component | Technology | Version |
|:---|:---|:---|
| Language | TypeScript | ~4.9.5 |
| Framework | React | ≥19.1.1 |
| Scaffolding | Create React App | 5.0.1 |
| UI Library | Material-UI (MUI) | ≥7.3.1 |
| Routing | React Router v6 | ≥6.30.1 |
| Data Fetching | TanStack React Query | ≥5.84.2 |
| Charts | Plotly.js + react-plotly.js | ≥3.0.3 |
| Date Utils | date-fns | ≥4.1.0 |
| Image Conversion | heic2any | 0.0.4 |
| Styling Engine | Emotion (CSS-in-JS via MUI) | — |
| Production Server | nginx (alpine) | — |

---

## Quick Start

### Prerequisites
- Node.js 18+
- Backend service running (see `../varavu_selavu_app/README.md`)

### 1. Install Dependencies
```bash
cd varavu_selavu_ui
npm install
```

### 2. Configure Environment
Create `.env.development` if it doesn't exist:
```env
REACT_APP_API_BASE_URL=http://localhost:8000
REACT_APP_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

> **Note:** If `REACT_APP_GOOGLE_CLIENT_ID` is not set, the login page will show "Google login not configured" and the Google Sign-In button will not initialize.

### 3. Run the App
```bash
npm start
```

Open http://localhost:3000 in your browser.

### Makefile Shortcuts (from repo root)
```bash
make install-web     # Install deps
make start-web       # Start dev server
```

---

## Project Structure

```
varavu_selavu_ui/
├── Dockerfile                          # Multi-stage: Node 18 build → nginx serve
├── nginx.conf                          # SPA routing (all paths → index.html)
├── package.json
├── tsconfig.json
├── .env.development                    # Dev env vars (API URL, Google Client ID)
├── .env.production                     # Prod env vars (Cloud Run URLs)
├── public/                             # Static assets (index.html, favicon, etc.)
└── src/
    ├── App.tsx                         # Root component: Router, Auth guard, AppBar
    ├── theme.ts                        # MUI theme (glassmorphism, gradients, colors)
    ├── index.tsx                       # React DOM root
    ├── index.css                       # Global CSS
    │
    ├── api/                            # API client layer
    │   ├── apiconfig.ts               # Base URL resolution (dev vs prod)
    │   ├── api.ts                     # Generic fetch wrapper with auth headers
    │   ├── auth.ts                    # Login, register, logout, refresh, Google login
    │   ├── expenses.ts               # Expense CRUD + receipt parse + with_items
    │   ├── analysis.ts               # Analysis GET + chat POST
    │   ├── recurring.ts              # Templates, due, confirm, execute_now
    │   ├── profile.ts                # Profile GET/PUT
    │   └── models.ts                 # Shared TypeScript interfaces
    │
    ├── pages/                          # Page-level components (one per route)
    │   ├── HomePage.tsx               # Public landing / marketing page
    │   ├── LoginPage.tsx              # Login form + Google Sign-In button
    │   ├── RegisterPage.tsx           # Registration form
    │   ├── ForgotPasswordPage.tsx     # Password reset form
    │   ├── DashboardPage.tsx          # Main dashboard with summary cards
    │   ├── ExpensesPage.tsx           # Expense list with add/edit/delete
    │   ├── ExpenseAnalysisPage.tsx    # Plotly charts + category breakdown
    │   ├── AIAnalystPage.tsx          # Conversational AI chat interface
    │   ├── RecurringPage.tsx          # Recurring expense template management
    │   └── ProfilePage.tsx            # User profile management
    │
    ├── components/                     # Reusable UI components
    │   ├── layout/                    # MainLayout (sidebar drawer), UserMenu
    │   ├── dashboard/                 # Dashboard cards, summary widgets
    │   ├── expenses/                  # Expense forms, RecurringPrompt modal
    │   ├── analysis/                  # Chart wrappers
    │   ├── ai-analyst/                # Chat UI components
    │   └── common/                    # Shared UI elements
    │
    └── utils/                          # Utility functions
```

---

## Features Implemented

### 🔐 Authentication
- Email/password login with JWT tokens
- Google One-Tap Sign-In (via Google Identity Services)
- User registration with name, phone, email, password
- Password reset (forgot password flow)
- Token auto-refresh on expiry
- Profile management (update name, phone)

### 💰 Expense Management
- Create expenses with date, description, category, cost, merchant
- AI-powered auto-categorization: type a description → get category suggestion
- Paginated expense history (sorted by date, newest first)
- Edit and delete existing expenses
- Receipt scanning: upload image/PDF → AI extracts all fields and line items

### 📊 Analytics & Charts
- Category totals (Plotly pie/bar charts)
- Monthly spending trend (line chart)
- Top 5 spending categories
- Category drill-down with expense details
- Filter by year, month, or custom date range
- Cache-backed for fast loading (60s TTL)

### 🤖 AI Financial Analyst
- Conversational chat interface
- Asks natural language questions about your expenses
- Powered by OpenAI (production) or Ollama (local)
- Model selection dropdown (lists available models)
- Context-aware: injects your expense data into the LLM

### 🔄 Recurring Expenses
- Create recurring expense templates (description, category, day of month, cost)
- View all templates with Active/Paused status
- Auto-prompt on login when recurring expenses are due
- Confirm or skip due expenses
- Execute immediately for current month
- Delete templates

### ✉️ Contact & Feedback
- Submit Feature Request form
- Contact Us form
- Sent via backend SMTP email

---

## Route Map

| Path | Component | Auth | Description |
|:---|:---|:---|:---|
| `/` | `HomePage` | No | Landing page |
| `/login` | `LoginPage` | No | Login |
| `/register` | `RegisterPage` | No | Registration |
| `/forgot-password` | `ForgotPasswordPage` | No | Password reset |
| `/dashboard` | `DashboardPage` | Yes | Dashboard |
| `/expenses` | `ExpensesPage` | Yes | Expense list & CRUD |
| `/analysis` | `ExpenseAnalysisPage` | Yes | Charts & analytics |
| `/recurring` | `RecurringPage` | Yes | Recurring management |
| `/ai-analyst` | `AIAnalystPage` | Yes | AI chat |
| `/profile` | `ProfilePage` | Yes | Profile settings |

**Auth Guard:** Routes with `Auth=Yes` redirect to `/login` if no `vs_token` exists in `localStorage`.

---

## Design System

### Theme
- **Primary:** `#4F46E5` (Indigo)
- **Secondary:** `#14B8A6` (Teal)
- **Background:** `#F6F7FB`
- **Border Radius:** 12px
- **Font:** Inter, Roboto

### Visual Effects
- **Glassmorphism:** Semi-transparent panels with `backdrop-filter: blur(12px)`
- **AppBar:** Gradient `linear-gradient(135deg, indigo 70%, teal 70%)`
- **Cards:** Subtle shadow with `translateY(-2px)` hover lift
- **Buttons:** No uppercase text-transform, shadow on hover

---

## Auth Token Storage

| `localStorage` Key | Value |
|:---|:---|
| `vs_token` | JWT access token |
| `vs_refresh` | JWT refresh token |
| `vs_user` | User email address |

A custom event `vs_auth_changed` is dispatched on login/logout to synchronize auth state across components.

---

## API Client

- **Base URL (dev):** `http://localhost:8080` (default) or `REACT_APP_API_BASE_URL`
- **Base URL (prod):** Set via `REACT_APP_API_BASE_URL` environment variable at build time
- **React Query Config:** 1-min stale time, 5-min GC, no refetch on window focus
- **Auth Header:** `Authorization: Bearer <vs_token>` attached to all protected requests

---

## Google Login Setup

1. Create an OAuth 2.0 Web Client ID in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Add `http://localhost:3000` (and your prod domain) to **Authorized JavaScript origins**
3. Set `REACT_APP_GOOGLE_CLIENT_ID` in `.env.development` and `.env.production`
4. Also set `GOOGLE_CLIENT_ID` on the backend (see backend README)

---

## Build & Deploy

### Production Build
```bash
npm run build    # Output: ./build/
```

### Docker

```bash
docker build -t trackspense-frontend .
docker run -p 8080:8080 trackspense-frontend
```

**Multi-stage Dockerfile:**
1. **Stage 1 (build):** Node 18 → `npm ci` → `npm run build`
2. **Stage 2 (serve):** nginx:alpine → copies `build/` → serves on port 8080

**SPA Routing:** nginx is configured via `nginx.conf` to serve `index.html` for all routes.

---

## Testing

```bash
npm test         # Interactive test runner (Jest + React Testing Library)
```

---

## Environment Variables

| Variable | Required | Description |
|:---|:---|:---|
| `REACT_APP_API_BASE_URL` | Yes | Backend API base URL |
| `REACT_APP_GOOGLE_CLIENT_ID` | Optional | Google OAuth Web Client ID |

---

## License

This project is licensed under the MIT License.
