# Alternative Architecture: Local-First & Zero-Knowledge Sync

## 1. Executive Summary
**The Vision:** You want the scalability of a modern app (instant load times, complex queries) but the privacy of a local spreadsheet (user owns the data, you can't see it).

**The Solution:** A **"Local-First" Architecture with End-to-End Encryption (E2EE)**.
Instead of using Google Sheets as a slow remote database, the app uses a **fast local database on the phone** (SQLite) and only syncs **encrypted blobs** to the cloud. The server never sees the raw financial data.

---

## 2. How It Works

### The Data Flow
1.  **Write (Local):** User adds an expense. It is written immediately to an **SQLite database** on their device.
    *   **Speed:** Instant (0ms latency). Works offline perfectly.
2.  **Encrypt (Client-Side):** Before leaving the device, the data is encrypted using a key derived from the user's password (or a generated recovery key).
    *   **Privacy:** Only the user has the key. The server receives a blob of gibberish.
3.  **Sync (Cloud):** The encrypted blob is sent to your backend (Cloud Run + Postgres/Firestore).
    *   **Server Role:** The server acts as a "dumb" storage locker. It stores the blob but cannot read it.
4.  **Read (Cross-Device):** When the user logs in on a second device (e.g., iPad or Web), the app downloads the encrypted blobs and decrypts them locally using the user's key.

### Technology Stack Recommendation
*   **Mobile DB:** **WatermelonDB** (built on SQLite). It is optimized for React Native and handles thousands of records effortlessly.
*   **Sync Engine:** **RxDB** or a custom sync loop using **PowerSync** (Postgres-based sync).
*   **Encryption:** **LibSodium** (via `react-native-libsodium`) or Web Crypto API.

---

## 3. Comparison: Google Sheets vs. Local-First E2EE

| Feature | Google Sheets (Current Idea) | Local-First E2EE (Recommended) |
| :--- | :--- | :--- |
| **Privacy** | **High.** Data is on user's drive. | **Maximum.** Data is encrypted; even you (the dev) can't see it. |
| **Speed** | **Slow.** Network call for every click. | **Instant.** Zero-latency local reads/writes. |
| **Offline** | **Poor.** Requires complex caching. | **Native.** Works 100% offline by default. |
| **Scalability**| **Low.** API quotas & timeouts. | **High.** Server only stores encrypted text; no complex processing. |
| **Querying** | **Limited.** No SQL or aggregations. | **Powerful.** Full SQL/Relational queries on the device. |
| **User Data** | **User's Google Account** | **User's Device + Your Encrypted Cloud** |

---

## 4. Why This Fits Your Vision
This architecture solves the "Privacy vs. Performance" dilemma:

1.  **"Data stays with the user":** It literally does. The primary copy is on their phone. The cloud copy is just an encrypted backup.
2.  **"Scaling and Performance":** Since all heavy lifting (filtering, sorting, summing) happens on the user's powerful phone processor (iPhone/Android), your server load is negligible. You can support 100x more users on the same Cloud Run instance because the server is just moving encrypted text, not calculating monthly budgets.

## 5. Implementation Roadmap
1.  **Replace API Calls:** Refactor the React Native app to read/write to `WatermelonDB` instead of calling `apiFetch`.
2.  **Implement Sync:** Build a simple "Push/Pull" endpoint on FastAPI that accepts JSON blobs and timestamps.
3.  **Add Encryption:** Integrate a crypto library to encrypt the JSON payload before the Push and decrypt after the Pull.

**Verdict:** This is the standard architecture for modern privacy-focused apps (e.g., Signal, Standard Notes, 1Password). It is the only way to achieve **both** high performance and absolute privacy.
