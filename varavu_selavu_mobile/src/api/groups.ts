/**
 * groups.ts — Mobile API client for group-related endpoints.
 *
 * Follows the same pattern as expenses.ts / analysis.ts:
 * - Uses `apiFetch` (from apiFetch.ts) so the JWT is attached automatically.
 * - Throws `ApiError` on non-2xx responses so callers can check `err.status`.
 */
import { apiFetch } from './apiFetch';
import { getConfig } from './config';

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
  let detail: string;
  try {
    const body = await res.json();
    detail = (body as any)?.detail ?? res.statusText;
  } catch {
    detail = res.statusText;
  }
  throw new ApiError(detail, res.status, null);
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
}

export async function updateGroup(
  groupId: string,
  payload: { name?: string; group_type?: string; cover?: string; simplify_debts?: boolean; default_split?: any }
): Promise<GroupDetail> {
  const res = await apiFetch(`/api/v1/groups/${groupId}`, { method: 'PUT', body: JSON.stringify(payload) });
  return handleResponse<GroupDetail>(res);
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

export interface GroupExpenseRow {
  row_id: string;
  date: string;
  description: string;
  category: string;
  cost: number;
  merchant_name?: string | null;
  my_share: number;
  payer_summary: PayerSummaryItem[];
}

export interface GroupExpenseListResponse {
  items: GroupExpenseRow[];
  next_offset?: number | null;
}

export interface MemberBalance {
  member_id: string;
  display_name: string;
  net: number;
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

export interface GroupExpenseItemEntry {
  line_no: number;
  item_name: string;
  line_total: number;
  quantity?: number | null;
  unit_price?: number | null;
  category_name?: string | null;
  member_ratios: Record<string, number>;
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
}

export interface GroupExpenseWithItemsPayload {
  date: string;
  description: string;
  category: string;
  amount: number;
  merchant_name?: string;
  payers: PayerSummaryItem[];
  items: GroupExpenseItemEntry[];
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

export async function createGroup(payload: CreateGroupPayload): Promise<GroupSummary> {
  const res = await apiFetch('/api/v1/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse<GroupSummary>(res);
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

export async function createInvite(groupId: string, memberId: string): Promise<CreateInviteResponse> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ member_id: memberId }),
  });
  return handleResponse<CreateInviteResponse>(res);
}

export async function acceptInvite(token: string): Promise<AcceptInviteResponse> {
  const res = await apiFetch('/api/v1/groups/invites/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return handleResponse<AcceptInviteResponse>(res);
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

export async function addGroupExpense(
  groupId: string,
  payload: AddGroupExpensePayload,
): Promise<GroupExpenseRow> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await handleResponse<{ success: boolean; expense: GroupExpenseRow }>(res);
  return data.expense;
}

export async function addGroupExpenseWithItems(
  groupId: string,
  payload: GroupExpenseWithItemsPayload,
): Promise<GroupExpenseRow> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/expenses/with_items`, {
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

export async function recordSettlement(
  groupId: string,
  payload: RecordSettlementPayload,
): Promise<void> {
  const res = await apiFetch(`/api/v1/groups/${groupId}/settlements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await handleResponse<unknown>(res);
}
