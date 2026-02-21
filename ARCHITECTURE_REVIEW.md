# Trackspense: Architectural Codebase Review & Scaling Report

## Executive Summary
This document provides a rigorous, production-readiness review of the "Trackspense" application (currently `varavu_selavu`). The current architecture, while suitable for a proof-of-concept or single-user prototype, is **unfit for public production release**. It contains critical bottlenecks in data storage, backend processing, and mobile performance that will lead to system failure under even moderate concurrent load.

---

## 1. Backend Scalability & GCP Cloud Run Optimization

### 1.1. Reliance on Google Sheets as Primary Database
**The Vulnerability/Bottleneck:**
The backend uses Google Sheets (`varavu_selavu_service/db/google_sheets.py`) as its primary transactional database. Google Sheets is an online spreadsheet application, not a database. It has strict API rate limits (e.g., 60 writes/min per user project), no ACID compliance, and high latency (hundreds of milliseconds per read/write).

**The Impact:**
- **Throughput:** Severely capped. Concurrent writes from multiple users will result in `429 Too Many Requests` errors or data corruption due to race conditions.
- **Latency:** Every API call involves an external HTTP request to Google's API, adding significant overhead compared to a local database connection.
- **Reliability:** The application will fail under load.

**The Architectural Fix:**
- **Immediate Action:** Migrate to a relational database like **PostgreSQL** (managed via **Cloud SQL**) or a NoSQL solution like **Firestore** (if schema flexibility is preferred).
- **Implementation:** Replace `SheetsRepo` and `ExpenseService` data access layers with an ORM (e.g., SQLAlchemy or Prisma) interacting with the new database.
- **Connection Pooling:** Use `pgbouncer` or Cloud SQL Auth Proxy with built-in connection pooling to manage connections efficiently from Cloud Run.

### 1.2. In-Memory "Fetch All" Pattern
**The Vulnerability/Bottleneck:**
In `ExpenseService.get_expenses_for_user`, the code fetches **all records** from the spreadsheet (`self.expense_ws.get_all_records()`) and filters them in Python memory.
```python
# varavu_selavu_service/services/expense_service.py
records = self.expense_ws.get_all_records() # Fetches EVERYTHING
for row in records:
    if row.get("User ID") != user_id: continue # Filters in memory
```

**The Impact:**
- **Performance:** O(N) complexity where N is the total number of expenses for *all* users. As the user base grows, this endpoint will become exponentially slower until it times out.
- **Memory Usage:** Loading the entire dataset into memory for every request will cause the Cloud Run container to run out of memory (OOM) and crash.

**The Architectural Fix:**
- **Database Querying:** Push filtering to the database level. Use SQL `WHERE` clauses (e.g., `SELECT * FROM expenses WHERE user_id = :user_id`).
- **Pagination:** Implement database-level pagination (`LIMIT` and `OFFSET`) instead of slicing a full list in Python.

### 1.3. Local In-Memory Caching
**The Vulnerability/Bottleneck:**
The `AnalysisService` uses a simple Python dictionary (`_ANALYSIS_CACHE`) for caching.
```python
# varavu_selavu_service/api/routes.py
_ANALYSIS_CACHE: dict = {}
```

**The Impact:**
- **Statelessness Violation:** Cloud Run instances are stateless and ephemeral. The cache is not shared across instances. A user hitting Instance A will not benefit from a cache created on Instance B.
- **Scalability:** As the app scales out, cache hit rates will drop effectively to zero, increasing load on the (already slow) database.

**The Architectural Fix:**
- **Distributed Caching:** Use **Google Cloud Memorystore (Redis)**.
- **Implementation:** Replace the dictionary with a Redis client. This ensures a consistent cache across all Cloud Run instances.

---

## 2. Database & Data Modeling (High Throughput)

### 2.1. Lack of Indexing
**The Vulnerability/Bottleneck:**
Since Google Sheets is used, there are no database indexes. Every lookup (e.g., finding expenses by date or category) requires a full scan.

**The Impact:**
- **Query Performance:** Queries will become unacceptably slow as data volume grows.
- **Cost:** Higher CPU and memory usage for scanning data.

**The Architectural Fix:**
- **Schema Design:** Create a proper database schema with indexes on high-cardinality and frequently queried columns:
    - `user_id` (Hash Index)
    - `date` (B-Tree Index for range queries)
    - `category` (B-Tree Index)

### 2.2. Write Contention & Locking
**The Vulnerability/Bottleneck:**
Google Sheets API operations are atomic per cell/row but lack transaction support across multiple updates. The current implementation uses `append_row` which locks the sheet momentarily.

**The Impact:**
- **Concurrency:** Multiple users adding expenses simultaneously will face "resource exhausted" or lock contention errors.

**The Architectural Fix:**
- **Transactions:** Use a database that supports ACID transactions. When adding an expense that affects a monthly budget summary, wrap both updates in a single transaction.

---

## 3. Mobile Performance (React Native / Expo)

### 3.1. Render Optimization in Lists
**The Vulnerability/Bottleneck:**
In `ExpensesScreen.tsx`, the `renderItem` function is defined *inside* the component body.
```typescript
// varavu_selavu_mobile/src/screens/ExpensesScreen.tsx
const ExpensesScreen = () => {
  // ...
  const renderItem = ({ item }) => ( ... ) // Created on every render
  // ...
}
```

**The Impact:**
- **Re-renders:** The `FlatList` sees a "new" function reference for `renderItem` on every render of the screen, forcing it to discard optimizations and re-render all rows. This causes UI stuttering (jank) during scrolling.

**The Architectural Fix:**
- **Refactor:** Move `renderItem` outside the component or wrap it in `useCallback`.
- **Memoization:** Wrap the row component (currently `Card` with inline content) in `React.memo` to prevent re-renders if props haven't changed.

### 3.2. Missing Offline Capabilities
**The Vulnerability/Bottleneck:**
The app relies entirely on `apiFetch` which wraps `fetch`. If the network is unavailable (e.g., subway), the request fails, and the user cannot log an expense.

**The Impact:**
- **User Experience:** Critical failure in a core use case (logging expenses on the go).

**The Architectural Fix:**
- **Offline-First Architecture:** Use a local database like **SQLite** (via `expo-sqlite`) or **WatermelonDB**.
- **Sync Engine:**
    1.  Write new expenses to local SQLite immediately (Optimistic UI).
    2.  Background job (using `expo-background-fetch`) pushes local changes to the backend when online.
    3.  Reconcile server-side data with local data.

### 3.3. State Management & Prop Drilling
**The Vulnerability/Bottleneck:**
The app relies on local state (`useState` in screens) and refetches data on focus (`useIsFocused`).
```typescript
// varavu_selavu_mobile/src/screens/ExpensesScreen.tsx
useEffect(() => {
    if (isFocused && accessToken) fetchExpenses(true);
}, [isFocused]);
```

**The Impact:**
- **Network Overhead:** Navigating between tabs causes redundant API calls even if data hasn't changed.
- **UX:** Loading spinners appear frequently.

**The Architectural Fix:**
- **Global Store:** Implement **TanStack Query (React Query)** or **Zustand**.
- **Caching:** React Query handles caching, deduplication, and background refetching out of the box. It will serve cached data instantly and update in the background.

---

## 4. API & Network Latency

### 4.1. Payload Over-fetching
**The Vulnerability/Bottleneck:**
The `list_expenses` endpoint returns full expense objects. While currently small, if metadata (e.g., receipt images, logs) is added, this will bloat.

**The Impact:**
- **Bandwidth:** Wasted data transfer for mobile users.
- **Latency:** Slower parsing on the mobile device.

**The Architectural Fix:**
- **GraphQL or Sparse Fieldsets:** Consider GraphQL (e.g., Apollo Server) to let the client request only needed fields. Alternatively, add a `fields` query parameter to REST endpoints.

### 4.2. Lack of Rate Limiting
**The Vulnerability/Bottleneck:**
There is no application-level rate limiting. The dependency is solely on Google Sheets quotas (which are global, not per user).

**The Impact:**
- **Security:** Vulnerable to DDoS attacks or a single malicious user exhausting the Google Sheets quota for the entire application.

**The Architectural Fix:**
- **API Gateway:** Use **Google Cloud API Gateway** or **Cloud Armor** to enforce rate limits per IP or API key.
- **Application Level:** Implement a middleware (e.g., `slowapi` for FastAPI) using Redis to track and limit requests per user ID.

---

## Conclusion
The current codebase is a functional prototype but essentially an "Excel wrapper." For a public launch targeting high scalability and performance, the **migration away from Google Sheets to a real SQL database is the single most critical step.** Without this, the application will not survive production traffic.
