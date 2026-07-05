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
}

export interface MemberDTO {
  member_id: string;
  display_name: string;
  role: string;
  status: string;
  user_email?: string | null;
}

export interface GroupDetail {
  group_id: string;
  name: string;
  group_type: string;
  cover?: string | null;
  currency: string;
  simplify_debts: boolean;
  status: string;
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

export interface AddGroupExpensePayload {
  date: string; // MM/DD/YYYY
  description: string;
  category: string;
  amount: number;
  merchant_name?: string;
  payers: { member_id: string; amount_paid: number }[];
  split: {
    type: 'equal' | 'exact' | 'percentage';
    entries?: { member_id: string; value?: number }[];
  };
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

export async function listGroups(): Promise<GroupSummary[]> {
  const res = await apiFetch('/api/v1/groups');
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
