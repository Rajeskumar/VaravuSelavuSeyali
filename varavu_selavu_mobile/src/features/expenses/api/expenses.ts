import { ensureAiConsent, hasAiConsent } from '../../ask/utils/aiConsent';
import { apiFetch } from '../../../core/api/apiFetch';
import { HttpStatusError } from '../../../core/api/request';
import { confirmed, expenseCreation, ExpenseCapture } from '../../shared/analytics/operations';
import { aiErrorFromResponse } from '../../ask/api/aiUsage';
import { TagRefDTO } from '../../tags/api/tags';
import { CardRefDTO } from '../../cards/api/cards';
import type { OcrResult, UploadableImage } from '../../receipts/utils/onDeviceOcr';

export interface ExpensePayload {
  description: string;
  category: string;
  sub_category?: string;
  date: string; // MM/DD/YYYY
  cost: number;
  user_id?: string;
  merchant_name?: string;
  // TS-TAG-112 — on PUT, omitted leaves tags unchanged; an explicit [] clears them (matches
  // web's write-through semantics, PRD §10.2). Mobile only ever sends names of EXISTING tags.
  tag_names?: string[];
  // TS-CARD-114 — always-replace, same as merchant_name (this reduced mobile picker always
  // shows the expense's current attribution, so there's no omitted/unchanged case to support).
  card_id?: string | null;
}

export interface ExpenseRecord {
  created_by_assistant?: string | null;
  row_id: number;
  user_id: string;
  date: string;
  description: string;
  category: string;
  cost: number;
  merchant_name?: string;
  item_count?: number;
  split_type?: string | null;
  tags?: TagRefDTO[];
  card?: CardRefDTO | null;
}

export interface ExpenseListResponse {
  items: ExpenseRecord[];
  next_offset?: number;
}

export interface CategorizeResult {
  main_category: string;
  subcategory: string;
  merchant_name?: string;
  /** Which tier answered: memory | merchant | keyword | llm | default. */
  source?: string;
}

/** `capture` is the analytics context of a user-initiated save; without it nothing is reported. */
export function addExpense(payload: ExpensePayload, token: string, capture?: ExpenseCapture): Promise<void> {
  return expenseCreation(async () => {
    const response = await apiFetch(`/api/v1/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new HttpStatusError('Failed to add expense', response.status);
    }
  }, capture, 'personal');
}

export interface ExpenseDateRange {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

/** Converts a 'YYYY-MM' month key into an inclusive ISO date range; empty string -> undefined (all time). */
export function monthToDateRange(month: string): ExpenseDateRange | undefined {
  if (!/^\d{4}-\d{2}$/.test(month)) return undefined;
  const [y, m] = month.split('-').map(Number);
  if (!y || m < 1 || m > 12) return undefined;
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return { startDate: `${y}-${mm}-01`, endDate: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

export async function listExpenses(
  token: string,
  userId: string,
  offset = 0,
  limit = 30,
  tagIds?: string[],
  dateRange?: ExpenseDateRange,
): Promise<ExpenseListResponse> {
  const params = new URLSearchParams({
    user_id: userId,
    offset: offset.toString(),
    limit: limit.toString(),
  });
  (tagIds || []).forEach((id) => params.append('tag_ids', id));
  if (dateRange?.startDate) params.set('start_date', dateRange.startDate);
  if (dateRange?.endDate) params.set('end_date', dateRange.endDate);

  const response = await apiFetch(`/api/v1/expenses?${params.toString()}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch expenses');
  }

  return response.json();
}

/**
 * Fetches every page of personal expenses for the active month (or all time when `dateRange` is
 * omitted). Bounded by `maxPages` so a runaway server cursor can never loop indefinitely.
 */
export async function listAllExpenses(
  token: string,
  userId: string,
  tagIds?: string[],
  pageSize = 500,
  maxPages = 10,
  dateRange?: ExpenseDateRange,
): Promise<ExpenseRecord[]> {
  const seen = new Set<number>();
  const all: ExpenseRecord[] = [];
  let offset: number | null = 0;
  let pages = 0;

  while (offset !== null && pages < maxPages) {
    const data = await listExpenses(token, userId, offset, pageSize, tagIds, dateRange);
    pages += 1;
    for (const item of data.items || []) {
      if (!seen.has(item.row_id)) {
        seen.add(item.row_id);
        all.push(item);
      }
    }
    offset = data.next_offset != null && data.next_offset > offset ? data.next_offset : null;
  }

  return all;
}

export function deleteExpense(rowId: number, token: string): Promise<void> {
  return confirmed(async () => {
    const response = await apiFetch(`/api/v1/expenses/${rowId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new HttpStatusError('Failed to delete expense', response.status);
    }
  }, 'expense_deleted', { expense_scope: 'personal' });
}

export function updateExpense(rowId: number, payload: ExpensePayload, token: string): Promise<void> {
  return confirmed(async () => {
    const response = await apiFetch(`/api/v1/expenses/${rowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new HttpStatusError('Failed to update expense', response.status);
    }
  }, 'expense_updated', { expense_scope: 'personal' });
}

export async function uploadReceipt(source: string | UploadableImage, token: string): Promise<any> {
  const image: UploadableImage = typeof source === 'string' ? { uri: source } : source;
  const name = image.name || 'receipt.jpg';
  const type = image.type || 'image/jpeg';
  const formData = new FormData();
  // Expo SDK 57's winter/fetch (`convertFormDataAsync`) rejects React Native's legacy `{ uri }`
  // FormData parts unless the part exposes `.bytes(): Promise<Uint8Array>`. Keep `uri` too for
  // legacy RN fetch compatibility, and fall back to fetching the local URI if bytes weren't supplied.
  const file = {
    uri: image.uri,
    name,
    type,
    bytes: async () => {
      if (image.bytes) return image.bytes;
      const res = await fetch(image.uri);
      return new Uint8Array(await res.arrayBuffer());
    },
  } as any;

  formData.append('file', file);

  // Do NOT set Content-Type manually — React Native sets it with the boundary
  // Our own reader goes first; only a low-confidence read may be forwarded to an AI service, and
  // never without the person's agreement (the server enforces `allow_ai=false`).
  const allowAi = await ensureAiConsent();
  const response = await apiFetch(`/api/v1/ingest/receipt/parse?allow_ai=${allowAi}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    // Same error as before (AiLimitError or a plain Error); the status rides along so a failure can be classified.
    throw Object.assign(await aiErrorFromResponse(response, 'Failed to parse receipt'), { status: response.status });
  }

  return response.json();
}

/**
 * Parse receipt text recognized on-device. The server only runs its rule parser (no LLM, no
 * quota); `needs_image` means the read wasn't good enough and the photo should be uploaded.
 */
export async function parseReceiptOcr(ocr: OcrResult): Promise<any> {
  const response = await apiFetch(`/api/v1/ingest/receipt/parse_ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ocr),
  });
  if (!response.ok) {
    throw new HttpStatusError('Failed to parse receipt', response.status);
  }
  return response.json();
}

/**
 * Call the backend categorization endpoint.
 * Returns suggested main_category and subcategory for a description.
 */
export async function categorizeExpense(description: string): Promise<CategorizeResult> {
  const response = await apiFetch(`/api/v1/expenses/categorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Without consent only built-in rules may answer; the text isn't sent to an AI provider.
    body: JSON.stringify({ description, allow_ai: await hasAiConsent() }),
  });

  if (!response.ok) {
    throw new HttpStatusError('Failed to categorize', response.status);
  }

  return response.json();
}

export interface ExpenseItemDTO {
  id: string;
  line_no: number;
  item_name: string;
  normalized_name?: string | null;
  category_id?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  line_total: number;
  tax?: number | null;
  discount?: number | null;
  original_price?: number | null;
}

export interface ItemsResponse {
  items: ExpenseItemDTO[];
  amount: number;
  tax: number;
  tip?: number;
  /** Always 0 since TS-FIX-102: discounts are already in the line prices. */
  discount: number;
  savings?: number;
  legacy_discount_format?: boolean;
}

export interface ItemsUpdatePayload {
  items: {
    line_no: number;
    item_name: string;
    normalized_name?: string | null;
    category_id?: string | null;
    quantity?: number | null;
    unit_price?: number | null;
    line_total: number;
    discount?: number;
    original_price?: number | null;
  }[];
  amount: number;
  tax?: number;
  tip?: number;
}

/** Receipt saves explain refusals (totals don't match, update the app): show the server's words. */
async function receiptError(response: Response, fallback: string): Promise<HttpStatusError> {
  const body = await response.json().catch(() => ({}));
  const detail = (body as any)?.detail;
  const message = typeof detail === 'string' ? detail : detail?.message || fallback;
  return Object.assign(new HttpStatusError(message, response.status), { detail });
}

/** Fetches an already-saved itemized personal expense's line items. */
export async function getExpenseItems(rowId: number | string): Promise<ItemsResponse> {
  const response = await apiFetch(`/api/v1/expenses/${rowId}/items`, { method: 'GET' });
  if (!response.ok) {
    throw new Error('Failed to fetch expense items');
  }
  return response.json();
}

/** Replaces an already-saved itemized personal expense's line items. */
export async function updateExpenseItems(rowId: number | string, payload: ItemsUpdatePayload): Promise<ItemsResponse> {
  const response = await apiFetch(`/api/v1/expenses/${rowId}/items`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await receiptError(response, 'Failed to update expense items');
  }
  return response.json();
}

/**
 * Save an expense with itemized line items (receipt flow).
 * Backend: POST /api/v1/expenses/with_items
 */
export async function addExpenseWithItems(payload: {
  user_email: string;
  header: Record<string, any>;
  items: Record<string, any>[];
  card_id?: string | null;
  // TS-TAG-104 — same top-level (sibling to header/items) field the backend's
  // ExpenseWithItemsRequest declares; applied inline on create, same as the plain addExpense().
  tag_names?: string[];
}, capture?: ExpenseCapture): Promise<{ expense_id: string; item_ids: string[] }> {
  return expenseCreation(async () => {
    const response = await apiFetch(`/api/v1/expenses/with_items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw await receiptError(response, 'Failed to save expense with items');
    }

    return response.json();
  }, capture, 'personal', (result) => !!result?.expense_id);
}
