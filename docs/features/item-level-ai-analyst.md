# Brainstorming & Implementation Plan: Item & Merchant-Level AI Analyst Flow

You raised a great point—sending every single expense line item to the LLM will overwhelm its context window and degrade performance, yet ignoring them means losing valuable insights on specific items, price comparisons, and merchant history. 

Here is a proposed architectural approach and requirements to achieve deep item and merchant-level analytics without breaking the AI Chat.

## 1. Goal Description
Create a new automated analytic flow that aggregates and pre-calculates individual expense item data (e.g., receipt line items) as well as merchant-level data. This data will power new "Item Insights" and "Merchant Insights" UIs and act as a concise, rich context source for the AI Analyst when the user asks specific questions (e.g., "Where did I buy milk cheapest?", "How much did I spend at Costco this year?").

## 2. Proposed Architecture & Approach

### A. Pre-calculation & Aggregation Pipeline (Backend)
Instead of calculating stats on the fly when the user opens the mobile/web app, we should calculate them **at the time an expense is saved**.
- **New Tables**:
  - `ItemInsight`: Stores the aggregated view per user and normalized item name (e.g., `avg_price_per_unit`, `min_price`, `max_price`, `total_quantity_bought`, `total_spent`).
  - `ItemPriceHistory`: Tracks individual purchases of an item linked to the store (parent expense description) and date.
  - `MerchantInsight`: Stores the aggregated view per user and merchant (e.g., `total_spent`, `transaction_count`, `monthly_aggregates`, `yearly_aggregates`).
  - `MerchantItemHistory`: Tracks what items are frequently bought at a specific merchant.
- **Aggregation Trigger**: When a receipt is ingested and items are saved via `create_expense_with_items`, a background task (or synchronous function) will update the `ItemInsight` and `MerchantInsight` aggregates and append to history tables.

### B. LLM Retrieval-Augmented Generation (RAG) for Chat
When the user asks a question in the AI Analyst screen, we use a smarter Context Retrieval mechanism:
1. **Intent Detection / Keyword Extraction**: Check if the user's query mentions a specific item (e.g., "Apple") or merchant (e.g., "Walmart", "Costco").
2. **Targeted Data Injection**: 
   - If they ask about an item, fetch *only* that item's `ItemInsight`, price comparisons (merchant vs merchant), and `ItemPriceHistory` from the DB.
   - If they ask about a merchant, fetch *only* that merchant's `MerchantInsight`, total spending, monthly/yearly aggregates, and frequently bought items from the DB.
   - If they ask general questions, pass the parent-level AnalysisResult.
*(This keeps the LLM payload extremely small but highly relevant).*

### C. Web & Mobile App Experience
While the AI Analyst chat is great, having a dedicated UI for these aggregated insights gives immediate value without typing.
- **New "Item Insights" Screen/Tab**:
  - Displays a list of "Top Purchased Items" with their historical average price.
  - Tapping an item opens a **Price History Chart** (e.g., Line Chart showing price changes over time) and a **Store Comparison** (e.g., $3.50 at Target vs $3.99 at Walmart).
- **New "Merchant Insights" Screen/Tab**:
  - Displays "Top Merchants by Expense" (e.g., Walmart, Amazon).
  - Tapping a merchant shows total spending, monthly/yearly aggregate trends (bar/line charts), and a list of items bought at this merchant.
- **Update AI Analyst Setup**: Inform the user on the screen that they can now ask about specific item prices, merchant spending, store comparisons, and inflation.

---

## 3. Requirements Breakdown

### Database Changes (PostgreSQL)
- [NEW] Table `item_insights` (user_id, normalized_name, avg_unit, min_price, max_price, total_spent)
- [NEW] Table `item_price_history` (item_insight_id, expense_id, store_name, date, unit_price)
- [NEW] Table `merchant_insights` (user_id, merchant_name, total_spent, transaction_count)
- [NEW] Table `merchant_aggregates` (merchant_insight_id, year, month, total_spent)
*(Note: requires a lightweight migration)*

### Backend API (`varavu_selavu_service`)
- Modify `ExpenseService.add_expense_with_items` and `add_expense` to trigger the aggregation logic for both items and merchants.
- Create `AnalyticsService` enhancements (e.g., `MerchantAnalyticsService`, `ItemAnalyticsService`) to handle fetching granular insights.
- [NEW] Endpoint `GET /api/v1/analytics/items` -> Returns top items.
- [NEW] Endpoint `GET /api/v1/analytics/items/{item_name}` -> Returns history and store price comparison.
- [NEW] Endpoint `GET /api/v1/analytics/merchants` -> Returns top merchants and high-level stats.
- [NEW] Endpoint `GET /api/v1/analytics/merchants/{merchant_name}` -> Returns monthly/yearly aggregates and items bought.
- Update `POST /api/v1/analysis/chat` to detect item/merchant-based queries and fetch the targeted insights.

### Frontend App (`varavu_selavu_app` - React/Next.js)
- Add "Item Insights" and "Merchant Insights" Dashboard pages.
- Integrate charts mapping the item/merchant history API.

### Mobile App (`varavu_selavu_mobile` - React Native)
- Add new screens to the Navigation for "Item Insights" and "Merchant Insights".
- Add a Line/Bar Chart for item price history and merchant spending trends.
- Update AIAnalystScreen placeholder to encourage item/merchant-specific queries.

---

## Finalized Decisions

1. **Normalization**: The LLM will normalize merchant and item names during the parsing request before saving.
2. **Dedicated UI vs Chat Only**: Both approaches will be taken. There will be dedicated UI screens for Item and Merchant insights, and the AI Analyst Chat will be capable of answering any question about the expense data using the RAG approach.
3. **Architecture**: Pre-calculation is confirmed as the best approach for performance and scalability, given the potential volume of item-level data.

---

## 4. Next Steps
With the requirements finalized, we can proceed to the EXECUTION phase. Implementation will start with the database schema changes and backend API updates.
