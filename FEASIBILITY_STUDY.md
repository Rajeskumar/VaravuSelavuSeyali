# Feasibility Study: "Bring Your Own Google Sheet" Architecture

## 1. Concept Overview
**The Vision:** Each user brings their own Google Sheet. The application acts as a "dumb" interface to their data. The data resides solely in the user's Google Drive, ensuring complete privacy and ownership. The backend does not store any financial data centrally.

**Is it Feasible?**
**YES.** This architecture is technically feasible and is used by several "privacy-first" financial tools (e.g., Tiller Money, Aspire Budgeting). However, it fundamentally changes the scaling characteristics of the application.

---

## 2. Technical Implementation

### Authentication Mechanism
**DO NOT ask users to upload `creds.json`.**
Asking users to create a Google Cloud Project, enable APIs, download a JSON key file, and upload it is a severe security risk and a terrible user experience (UX). It will result in near-zero adoption for a public app.

**The Correct Approach: OAuth 2.0 with Offline Access**
1.  **Login Flow:** User logs in with Google ("Sign in with Google").
2.  **Scopes:** The app requests the `https://www.googleapis.com/auth/spreadsheets` scope.
3.  **Tokens:**
    -   **Access Token:** Short-lived (1 hour). Used for immediate API calls.
    -   **Refresh Token:** Long-lived. **This is what you must store securely.**
4.  **Backend Storage:** The backend database (e.g., a small SQL table or Firestore) stores *only* the user's `refresh_token` and `spreadsheet_id`. It does *not* store transaction data.
5.  **Execution:** When the user makes a request, the backend:
    -   Retrieves the encrypted `refresh_token`.
    -   Exchanges it for a fresh `access_token` via Google's OAuth endpoint.
    -   Instantiates a `gspread` client *specifically for that user*.
    -   Reads/Writes to *their* sheet.

### Quotas & Limits
*   **Per Project:** Google Sheets API has a global quota (e.g., 300 read requests/min per project). This can be increased by requesting a quota increase from Google.
*   **Per User:** There is a quota of ~60 write requests/min per user.
*   **Analysis:** In this "BYO-Sheet" model, the **per-user quota** becomes the primary constraint. Since each user is writing to their own sheet, User A's activity does not block User B's activity (unlike the single service account model).
    *   **Verdict:** This scales *better* for concurrent writes than the single-sheet model, provided the global project quota is monitored.

---

## 3. Critical Trade-offs

### Pros (Why do it?)
1.  **Privacy:** User data is never "at rest" on your servers. It lives in their Google Drive. This is a massive selling point for privacy-conscious users.
2.  **Portability:** Users can open their sheet in Google Sheets UI to make manual edits, view charts, or backup data. They aren't locked into your app.
3.  **Cost:** You don't pay for database storage (Cloud SQL / Firestore) for transaction data. Google hosts it for free.

### Cons (The "Public App" Risks)
1.  **Latency (Speed):**
    *   Every single operation (Add Expense, View Dashboard) requires an HTTP round-trip to Google's API.
    *   **Impact:** A dashboard load might take 1-3 seconds instead of 100ms.
    *   **Mitigation:** Aggressive caching (Redis) is required, but this weakens the "no data stored" promise.
2.  **Query Limitations:**
    *   You cannot run SQL queries (`SELECT sum(cost) WHERE category='Food' GROUP BY month`).
    *   **Impact:** The backend must fetch **ALL** rows into memory (Python) to filter or aggregate them.
    *   **Scalability Limit:** If a user has 10,000+ expenses, the backend process for that user will run out of memory or time out. The app becomes unusable for "heavy" users.
3.  **Search:**
    *   Full-text search is impossible without fetching the entire dataset.
4.  **Fragility:**
    *   If the user opens the sheet and deletes a column or renames the "Expenses" tab, the app crashes. You must build robust error handling for "schema drift."

---

## 4. Recommendation for Public Launch

**Is it "Production Ready"?**
It depends on the definition of "Production."
*   **For a Startup / High-Scale App:** **NO.** The latency and lack of querying capabilities will kill the user experience compared to competitors (Mint, YNAB, Copilot).
*   **For a Niche "Privacy-First" Tool:** **YES.** If the marketing hook is "We don't touch your data," users will tolerate the 2-second loading times.

### The Hybrid Approach (Best of Both Worlds)
If you proceed with the "BYO-Sheet" model, I recommend a **Hybrid Architecture**:
1.  **Primary DB:** Use a proper SQL database (PostgreSQL) for the app's core performance (instant loads, complex queries).
2.  **Sync Engine:** Treat the Google Sheet as a "Backup / Export" target, not the live database.
    *   When a user adds an expense -> Write to SQL (fast) -> Async Job writes to Google Sheet (slow).
    *   This gives you **Sub-100ms performance** AND **Data Ownership** for the user.

### Final Verdict
If you stick to **Pure Google Sheets as DB**:
1.  **Limit Data:** You must archive/rotate data (e.g., create a new sheet every year) to keep row counts under ~2,000 per sheet to avoid timeouts.
2.  **Set Expectations:** The UI must handle "Loading..." states gracefully.
3.  **Security:** Implement OAuth 2.0 immediately. Do not use `creds.json`.
