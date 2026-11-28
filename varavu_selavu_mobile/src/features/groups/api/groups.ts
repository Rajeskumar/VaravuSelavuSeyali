/**
 * groups.ts — Mobile API client for group-related endpoints.
 *
 * Follows the same pattern as expenses.ts / analysis.ts:
 * - Uses `apiFetch` (from apiFetch.ts) so the JWT is attached automatically.
 * - Throws `ApiError` on non-2xx responses so callers can check `err.status`.
 */
import { apiFetch } from '../../../core/api/apiFetch';
import { withSettlementRequestId } from './settlementRequestId';
import { getConfig } from '../../shared/featureFlags';
import { confirmed, expenseCreation, ExpenseCapture } from '../../shared/analytics/operations';
import { TagRefDTO } from '../../tags/api/tags';
import { CardRefDTO } from '../../cards/api/cards';

// ---------------------------------------------------------------------------
// Error type (mirrors the web client's ApiError for consistency)
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  let detail: any;
  try {
    const body = await res.json();
    detail = (body as any)?.detail ?? res.statusText;
  } catch {
    detail = res.statusText;
  }
  // A structured refusal ({code, message}, e.g. TS-FIX-102's split_required / app_update_required)
  // shows its message; the object stays on `body` for callers that branch on the code.
  const message = typeof detail === 'string' ? detail : detail?.message || res.statusText;
  throw new ApiError(message, res.status, typeof detail === 'object' ? detail : null);
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
export interface GroupSummary {
  group_id: string;
  name: string;
  group_type: string;
  member_count: number;
  my_balance: number;
  status: string;
  archived_at: string | null;
  deleted_at: string | null;
}

export interface MemberDTO {
  member_id: string;
  display_name: string;
  role: string;
  status: string;
  user_email?: string | null;
  /** An email invite was sent for this name-only seat and hasn't been accepted yet. */
  invite_pending?: boolean;
}

export async function updateGroup(
  groupId: string,
  payload: { name?: string; group_type?: string; cover?: string; simplify_debts?: boolean; default_split?: any }
): Promise<GroupDetail> {
  // Same missing-header bug as updateGroupExpense below — see its comment.
  const res = await apiFetch(`/api/v1/groups/${groupId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<GroupDetail>(res);
}

/** Edit payload: omit `payers` and `split` together to keep the stored split (rescaled if the amount changed). */
export type UpdateGroupExpensePayload = Omit<AddGroupExpensePayload, 'payers' | 'split'> &
  Partial<Pick<AddGroupExpensePayload, 'payers' | 'split'>>;

export function updateGroupExpense(
  groupId: string,
  expenseId: string,
  payload: UpdateGroupExpensePayload
): Promise<GroupExpenseRow> {
  return confirmed(() => updateGroupExpenseRequest(groupId, expenseId, payload), 'group_expense_updated', { expense_scope: 'group' });
}

async function updateGroupExpenseRequest(
  groupId: string,
  expenseId: string,
  payload: UpdateGroupExpensePayload
): Promise<GroupExpenseRow> {
  // Missing `Content-Type: application/json` (present on every sibling call in this file, e.g.
  // addGroupExpense below) meant a plain-string fetch body defaults to `text/plain` — FastAPI
  // then received the JSON as a raw string instead of a parsed object and rejected every save
  // with a 422 "Input should be a valid dictionary" error. Also fixes the response shape: the
  // backend returns `{success, expense}` (`GroupExpenseCreatedResponse`), not a bare `GroupDetail`.
  const res = await apiFetch(`/api/v1/groups/${groupId}/expenses/${expenseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<{ success: boolean; expense: GroupExpenseRow }>(res);
  return data.expense;
}

export function deleteGroupExpense(groupId: string, expenseId: string): Promise<void> {
  return confirmed(async () => {
    const res = await apiFetch(`/api/v1/groups/${groupId}/expenses/${expenseId}`, { method: 'DELETE' });
    return handleResponse<void>(res);
  }, 'expense_deleted', { expense_scope: 'group' });
}

export interface GroupActivityDTO {
  id: string;
  action: string;
  actor_member_id: string | null;
  entity_id: string | null;
  payload: any | null;
  created_at: string;
}

export interface GroupActivityListResponse {
  items: GroupActivityDTO[];
  next_offset: number | null;
}

export interface GroupDetail {
  group_id: string;
  name: string;
  group_type: string;
  cover?: string | null;
  currency: string;
  simplify_debts: boolean;
  default_split?: any;
  status: string;
  archived_at: string | null;
  deleted_at: string | null;
  members: MemberDTO[];
}

export interface PayerSummaryItem {
  member_id: string;
  amount_paid: number;
}

export interface ExpenseSplitItem {
  member_id: string;
  share: number;
}

export interface GroupExpenseRow {
  row_id: string;
  date: string;
  description: string;
  category: string;
  cost: number;
  merchant_name?: string | null;
  my_share: number;
  payer_summary: PayerSummaryItem[];
  // Every member's actual current dollar share — lets Edit reconstruct the real current split
  // instead of resetting to an equal-split guess (matches the web app's `GroupExpenseRow`).
  splits: ExpenseSplitItem[];
  currency?: string | null;
  fx_rate_to_group_currency?: number | null;
  split_type?: string | null;
  /** TS-FIX-102: a receipt with saved lines (its split type is equal/exact/shares now). */
  has_items?: boolean;
  tags?: TagRefDTO[];
  card?: CardRefDTO | null;
}

export interface GroupExpenseListResponse {
  items: GroupExpenseRow[];
  next_offset?: number | null;
}

export interface GroupExpenseItemDTO {
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

export interface GroupItemsResponse {
  items: GroupExpenseItemDTO[];
  amount: number;
  tax: number;
  tip?: number;
  /** Always 0 since TS-FIX-102: discounts are already in the line prices. */
  discount: number;
  savings?: number;
  /** Saved in the old discount format; the lines shown were converted to paid prices for checking. */
  legacy_discount_format?: boolean;
}

export interface GroupItemsUpdatePayload {
  items: GroupExpenseItemEntry[];
  amount: number;
  tax?: number;
  tip?: number;
  /** Needed when the amount changes on an Exact or old item-split receipt (`split_required`). */
  split?: { type: string; entries: { member_id: string; value?: number }[] };
}

export async function getGroupExpenseItems(groupId: string, expenseId: string): Promise<GroupItemsResponse> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/expenses/${expenseId}/items`, { method: 'GET' });
  return handleResponse<GroupItemsResponse>(res);
}

export async function updateGroupExpenseItems(
  groupId: string,
  expenseId: string,
  payload: GroupItemsUpdatePayload
): Promise<GroupItemsResponse> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/expenses/${expenseId}/items`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<GroupItemsResponse>(res);
}

export interface MemberBalance {
  member_id: string;
  display_name: string;
  net: number;
  venmo_handle?: string | null;
  paypal_handle?: string | null;
  upi_id?: string | null;
}

export interface BalanceTransfer {
  from_member_id: string;
  to_member_id: string;
  amount: number;
}

export interface BalanceResponse {
  group_id: string;
  members: MemberBalance[];
  transfers: BalanceTransfer[];
  simplified: boolean;
}

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------
export interface CreateGroupPayload {
  name: string;
  group_type?: string;
  currency?: string;
}

export interface PayerSummaryItem {
  member_id: string;
  amount_paid: number;
}

/** A receipt line (TS-FIX-102): `line_total` is the paid price; discount and original price are a
 * record only. Lines never say who owes what — the receipt is split on its total. Matches web's
 * GroupExpenseItemEntry (varavu_selavu_ui/src/api/groups.ts). */
export interface GroupExpenseItemEntry {
  id?: string;
  line_no: number;
  item_name: string;
  normalized_name?: string | null;
  line_total: number;
  quantity?: number | null;
  unit_price?: number | null;
  category_name?: string | null;
  discount?: number | null;
  original_price?: number | null;
}

export interface AddGroupExpensePayload {
  date: string; // MM/DD/YYYY
  description: string;
  category: string;
  amount: number;
  merchant_name?: string;
  payers: PayerSummaryItem[];
  split: {
    type: 'equal' | 'exact' | 'percentage' | 'shares' | 'adjustment';
    entries?: { member_id: string; value?: number }[];
  };
  currency?: string;
  // TS-CARD-114 — always-replace, same as personal ExpensePayload.card_id.
  card_id?: string | null;
}

export interface GroupExpenseWithItemsPayload {
  date: string;
  description: string;
  category: string;
  amount: number;
  merchant_name?: string;
  payers: PayerSummaryItem[];
  /** A receipt is split on its total: equal, exact or shares. */
  split: { type: string; entries: { member_id: string; value?: number }[] };
  tax?: number;
  tip?: number;
  items: GroupExpenseItemEntry[];
  currency?: string;
  card_id?: string | null;
}

export interface RecordSettlementPayload {
  from_member_id: string;
  to_member_id: string;
  amount: number;
  method?: string;
  notes?: string;
}

export interface CreateInviteResponse {
  token: string;
  url: string;
  expires_at: string;
  invited_email?: string | null;
  email_sent?: boolean;
}

export interface AcceptInviteResponse {
  group_id: string;
  member_id: string;
  display_name: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Check if the Groups feature is enabled on the backend, via the dedicated
 * flag surface (TS-GRP-111's GET /config) rather than probing /groups for a
 * 404 — the endpoint never 404s and doesn't require auth, so this resolves
 * reliably even before the /groups query itself has run.
 */
export async function checkGroupsEnabled(): Promise<boolean> {
  try {
    const config = await getConfig();
    return config.groups_enabled;
  } catch {
    return false;
  }
}

export async function listGroups(includeArchived = false, includeDeleted = false): Promise<GroupSummary[]> {
  const params = new URLSearchParams();
  if (includeArchived) params.append('include_archived', 'true');
  if (includeDeleted) params.append('include_deleted', 'true');
  
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await apiFetch(`/api/v1/groups${qs}`);
  return handleResponse<GroupSummary[]>(res);
}

export function createGroup(payload: CreateGroupPayload): Promise<GroupSummary> {
  return confirmed(async () => {
    const res = await apiFetch('/api/v1/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<GroupSummary>(res);
  }, 'group_created', {});
}

export async function deleteGroup(groupId: string, force = false): Promise<void> {
  const res = await apiFetch(`/api/v1/groups/${groupId}?force=${force}`, { method: 'DELETE' });
  return handleResponse<void>(res);
}

export async function archiveGroup(groupId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/archive`, { method: 'POST' });
  return handleResponse<void>(res);
}

export async function unarchiveGroup(groupId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/unarchive`, { method: 'POST' });
  return handleResponse<void>(res);
}

export async function restoreGroup(groupId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/restore`, { method: 'POST' });
  return handleResponse<void>(res);
}

export async function getGroupDetail(groupId: string): Promise<GroupDetail> {
  const res = await apiFetch(`/api/v1/groups/${groupId}`);
  return handleResponse<GroupDetail>(res);
}

export async function addMember(
  groupId: string,
  email?: string,
  displayName?: string,
): Promise<MemberDTO> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, display_name: displayName }),
  });
  return handleResponse<MemberDTO>(res);
}

export async function getGroupActivity(groupId: string, limit = 50, offset = 0): Promise<GroupActivityListResponse> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/activity?limit=${limit}&offset=${offset}`);
  return handleResponse<GroupActivityListResponse>(res);
}

/** Mints a join link for a pending placeholder seat. With `email`, the backend also emails
 * the link to that address and pins the seat to it (only that address can redeem it). */
export function createInvite(groupId: string, memberId: string, email?: string): Promise<CreateInviteResponse> {
  return confirmed(async () => {
    const res = await apiFetch(`/api/v1/groups/${groupId}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(email ? { member_id: memberId, email } : { member_id: memberId }),
    });
    return handleResponse<CreateInviteResponse>(res);
  }, 'group_member_invited', {});
}

export async function removeMember(groupId: string, memberId: string, force = false): Promise<void> {
  const qs = force ? '?force=true' : '';
  const res = await apiFetch(`/api/v1/groups/${groupId}/members/${memberId}${qs}`, { method: 'DELETE' });
  return handleResponse<void>(res);
}

export async function leaveGroup(groupId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/leave`, { method: 'POST' });
  return handleResponse<void>(res);
}

export function acceptInvite(token: string): Promise<AcceptInviteResponse> {
  return confirmed(async () => {
    const res = await apiFetch('/api/v1/groups/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }), // the invite token is request data only; it is never an analytics value
    });
    return handleResponse<AcceptInviteResponse>(res);
  }, 'group_invitation_accepted', {});
}

export async function listGroupExpenses(
  groupId: string,
  offset = 0,
  limit = 30,
): Promise<GroupExpenseListResponse> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  const res = await apiFetch(`/api/v1/groups/${groupId}/expenses?${params}`);
  return handleResponse<GroupExpenseListResponse>(res);
}

export interface UnifiedGroupExpenseRow extends GroupExpenseRow {
  group_id: string;
  group_name: string;
}

export async function listAllMyGroupExpenses(): Promise<UnifiedGroupExpenseRow[]> {
  const groups = await listGroups();
  const perGroup = await Promise.all(
    groups.map(async (g) => {
      const res = await listGroupExpenses(g.group_id, 0, 200);
      return res.items.map((row) => ({ ...row, group_id: g.group_id, group_name: g.name }));
    })
  );
  return perGroup.flat();
}

export function addGroupExpense(
  groupId: string,
  payload: AddGroupExpensePayload,
  capture?: ExpenseCapture,
): Promise<GroupExpenseRow> {
  return expenseCreation(async () => {
    const res = await apiFetch(`/api/v1/groups/${groupId}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ success: boolean; expense: GroupExpenseRow }>(res);
    return data.expense;
  }, capture, 'group', (expense) => !!expense);
}

export function addGroupExpenseWithItems(
  groupId: string,
  payload: GroupExpenseWithItemsPayload,
  capture?: ExpenseCapture,
): Promise<GroupExpenseRow> {
  return expenseCreation(async () => {
    // Backend route is /expenses/itemized (see groups_routes.py) — not /with_items,
    // which only exists for the personal (non-group) receipt-scan endpoint.
    const res = await apiFetch(`/api/v1/groups/${groupId}/expenses/itemized`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ success: boolean; expense: GroupExpenseRow }>(res);
    return data.expense;
  }, capture, 'group', (expense) => !!expense);
}

export interface MoveToGroupPayload {
  group_id: string;
  split: {
    type: 'equal' | 'exact' | 'percentage' | 'shares' | 'adjustment';
    entries: { member_id: string; value?: number }[];
  };
}

/** TS-GRP-121: converts an existing personal expense into a group expense in
 * place (same expense id). The converter becomes sole payer server-side. */
export async function moveExpenseToGroup(
  expenseId: number | string,
  payload: MoveToGroupPayload,
): Promise<GroupExpenseRow> {
  const res = await apiFetch(`/api/v1/expenses/${expenseId}/move_to_group`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<{ success: boolean; expense: GroupExpenseRow }>(res);
  return data.expense;
}

export async function getGroupBalances(groupId: string): Promise<BalanceResponse> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/balances`);
  return handleResponse<BalanceResponse>(res);
}

export function recordSettlement(
  groupId: string,
  payload: RecordSettlementPayload,
): Promise<{ alreadyRecorded: boolean }> {
  // A recorded settlement, not proof that money moved through a payment provider.
  return confirmed(() => withSettlementRequestId(groupId, payload, async (request_id) => {
    const res = await apiFetch(`/api/v1/groups/${groupId}/settlements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, request_id }),
    });
    const saved = await handleResponse<{ already_recorded?: boolean } | undefined>(res);
    return { alreadyRecorded: !!saved?.already_recorded };
  }), 'settlement_completed', {});
}

export function settleExpenseShare(
  groupId: string,
  expenseId: string,
  payload: { member_id: string; payer_member_id?: string; method?: string; notes?: string },
): Promise<void> {
  return confirmed(async () => {
    const res = await apiFetch(`/api/v1/groups/${groupId}/expenses/${expenseId}/settle_share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await handleResponse<unknown>(res);
  }, 'settlement_completed', {});
}

// ---------------------------------------------------------------------------
// Expense comments (TS-GRP-126)
// ---------------------------------------------------------------------------

export interface ExpenseCommentDTO {
  id: string;
  expense_id: string;
  member_id: string;
  author_display_name: string;
  body: string;
  created_at: string;
  edited_at: string | null;
}

export async function listExpenseComments(groupId: string, expenseId: string): Promise<ExpenseCommentDTO[]> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/expenses/${expenseId}/comments`);
  const data = await handleResponse<{ items: ExpenseCommentDTO[] }>(res);
  return data.items;
}

export async function addExpenseComment(groupId: string, expenseId: string, body: string): Promise<ExpenseCommentDTO> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/expenses/${expenseId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  return handleResponse<ExpenseCommentDTO>(res);
}

export async function deleteExpenseComment(groupId: string, expenseId: string, commentId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/expenses/${expenseId}/comments/${commentId}`, {
    method: 'DELETE',
  });
  await handleResponse<unknown>(res);
}

// ---------------------------------------------------------------------------
// Expense edit history (TS-GRP-127)
// ---------------------------------------------------------------------------

export interface ExpenseHistoryEntry {
  action: string;
  actor_display_name: string;
  changed_fields: Record<string, { from: any; to: any } | any>;
  created_at: string;
}

export async function getExpenseHistory(groupId: string, expenseId: string): Promise<ExpenseHistoryEntry[]> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/expenses/${expenseId}/history`);
  const data = await handleResponse<{ items: ExpenseHistoryEntry[] }>(res);
  return data.items;
}

// ---------------------------------------------------------------------------
// Notification preferences (TS-GRP-125)
// ---------------------------------------------------------------------------

export interface GroupNotificationPreference {
  group_id: string;
  muted: boolean;
  muted_events: string[];
}

export async function getNotificationPreferences(groupId: string): Promise<GroupNotificationPreference> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/notification_preferences`);
  return handleResponse<GroupNotificationPreference>(res);
}

export async function updateNotificationPreferences(
  groupId: string,
  payload: { muted?: boolean; muted_events?: string[] },
): Promise<GroupNotificationPreference> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/notification_preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<GroupNotificationPreference>(res);
}

// ---------------------------------------------------------------------------
// Cross-group friend balances (TS-GRP-128)
// ---------------------------------------------------------------------------

export interface FriendBalanceGroupBreakdown {
  group_id: string;
  name: string;
  net: number;
}

export interface FriendBalanceDTO {
  counterparty_email: string | null;
  counterparty_display_name: string;
  net: number;
  groups: FriendBalanceGroupBreakdown[];
}

export async function getFriendBalances(): Promise<FriendBalanceDTO[]> {
  const res = await apiFetch('/api/v1/friends/balances');
  const data = await handleResponse<{ balances: FriendBalanceDTO[] }>(res);
  return data.balances;
}

// ---------------------------------------------------------------------------
// CSV export (TS-GRP-132)
// ---------------------------------------------------------------------------

export async function fetchGroupExportCsv(groupId: string): Promise<string> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/export.csv`);
  if (!res.ok) {
    throw new ApiError('Failed to export group', res.status, null);
  }
  return res.text();
}
