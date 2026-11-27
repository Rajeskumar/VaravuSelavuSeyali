/**
 * Receipt line format (TS-FIX-102), shared by every receipt screen.
 *
 * A line's `line_total` is the PAID price and is what every list shows. `discount` is money saved on
 * that line (a record only, never subtracted again) and `original_price` the price before it. Totals:
 * paid prices + tax + tip must equal the amount within 0.02, or the receipt cannot be saved. The
 * server enforces the same rule (`services/receipt_lines.py`); this mirrors web `src/utils/receiptLines.ts`.
 */

import { distributeCents } from '../../groups/utils/splitAmounts';

export const RECEIPT_TOLERANCE = 0.02;

/** Split types a receipt may use: it is split on its total, never item by item. */
export const RECEIPT_SPLIT_TYPES = ['equal', 'exact', 'shares'] as const;

export interface ReceiptLine {
  id?: string;
  line_no: number;
  item_name: string;
  line_total: number;
  discount?: number | null;
  original_price?: number | null;
  quantity?: number | null;
  unit_price?: number | null;
  normalized_name?: string | null;
}

/** A return or refund the scanner left out of the items for the person to review. */
export interface ReceiptReviewLine {
  item_name: string;
  amount: number;
  reason?: string;
}

const cents = (n: unknown) => Math.round((Number(n) || 0) * 100);

export function lineDiscount(line: Pick<ReceiptLine, 'line_total' | 'discount' | 'original_price'>): number {
  if (line.original_price != null) return Math.max(0, cents(line.original_price) - cents(line.line_total)) / 100;
  return Math.max(0, cents(line.discount)) / 100;
}

export function receiptTotals(lines: ReceiptLine[], tax: number, tip: number, amount: number) {
  const subtotalCents = lines.reduce((s, l) => s + cents(l.line_total), 0);
  const computedCents = subtotalCents + cents(tax) + cents(tip);
  const deltaCents = computedCents - cents(amount);
  return {
    subtotal: subtotalCents / 100,
    computed: computedCents / 100,
    delta: deltaCents / 100,
    savings: lines.reduce((s, l) => s + cents(lineDiscount(l)), 0) / 100,
    reconciled: Math.abs(deltaCents) <= cents(RECEIPT_TOLERANCE),
  };
}

/** Scan/GET result line → editable line (keeps the server's paid price and savings). */
export function fromServerLine(it: any, idx: number): ReceiptLine {
  const paid = Number(it.line_total) || 0;
  const discount = Number(it.discount) || 0;
  return {
    id: it.id || undefined,
    line_no: idx + 1,
    item_name: it.item_name || it.normalized_name || 'Item',
    line_total: paid,
    discount,
    original_price: it.original_price != null ? Number(it.original_price) : discount ? paid + discount : null,
    quantity: it.quantity != null ? Number(it.quantity) : null,
    unit_price: it.unit_price != null ? Number(it.unit_price) : null,
    normalized_name: it.normalized_name || undefined,
  };
}

/** Editable line → save payload line. No negative values; discount always derived from the prices. */
export function toSaveLine(line: ReceiptLine, idx: number, keepId = false) {
  const paid = Math.max(0, cents(line.line_total)) / 100;
  const discount = lineDiscount(line);
  return {
    ...(keepId && line.id ? { id: line.id } : {}),
    line_no: idx + 1,
    item_name: line.item_name,
    normalized_name: line.normalized_name || undefined,
    quantity: line.quantity ?? null,
    unit_price: line.unit_price ?? null,
    line_total: paid,
    discount,
    original_price: discount ? (cents(paid) + cents(discount)) / 100 : paid,
  };
}

/** The server's code for "this request uses the old format/flow; update the app". */
export const isUpdateRequired = (e: any) => (e?.detail ?? e?.body)?.code === 'app_update_required';
/** The server needs Equal, Exact or Shares because a receipt's amount changed. */
export const isSplitRequired = (e: any) => (e?.detail ?? e?.body)?.code === 'split_required';

/** The caller's share of a receipt split on its total (Equal/Exact/Shares), with the server's rounding.
 * Preview only: the server resolves the real shares. */
export function receiptShareFor(
  split: { type: string; entries: { member_id: string; value?: number }[] },
  amount: number,
  memberId: string | undefined,
): number {
  if (!memberId) return 0;
  const entries = split.entries;
  if (!entries.some((e) => e.member_id === memberId)) return 0;
  if (split.type === 'exact') return Number(entries.find((e) => e.member_id === memberId)?.value) || 0;
  const weights = entries.map((e) => (split.type === 'shares' ? Math.max(0, Number(e.value) || 0) : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const shares = distributeCents(amount, entries.map((e, i) => ({ id: e.member_id, raw: (amount * weights[i]) / total })));
  return shares[entries.findIndex((e) => e.member_id === memberId)] ?? 0;
}
