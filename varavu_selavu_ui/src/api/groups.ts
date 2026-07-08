import { fetchWithAuth } from './api';

/** Thrown by every function in this module on a non-2xx response. Preserves the
 * backend's JSON `detail` (which for split-validation failures carries per-field
 * data like `{message, total_percentage}` — see SplitEditor) instead of collapsing
 * it into a generic string, unlike the older api/expenses.ts /api/recurring.ts
 * clients this intentionally does not touch. */
export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(message: string, status: number, detail: any) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function throwApiError(res: Response, fallbackMessage: string): Promise<never> {
  let detail: any = null;
  try {
    const body = await res.json();
    detail = body?.detail ?? body;
  } catch {
    /* ignore — non-JSON error body */
  }
  const message = typeof detail === 'string' ? detail : detail?.message || fallbackMessage;
  throw new ApiError(message, res.status, detail);
}

// ---------------------------------------------------------------------------
// Groups & membership (TS-GRP-102)
// ---------------------------------------------------------------------------

export interface GroupSplitConfig {
  split_type: 'equal' | 'percentage' | 'shares' | 'adjustment';
  entries: { member_id: string; value?: number }[];
}

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

export interface GroupDetailResponse {
  group_id: string;
  name: string;
  group_type: string;
  cover?: string | null;
  currency: string;
  simplify_debts: boolean;
  default_split: GroupSplitConfig | null;
  status: string;
  archived_at: string | null;
  deleted_at: string | null;
  members: MemberDTO[];
}

export interface CreateGroupPayload {
  name: string;
  group_type?: string;
  cover?: string;
  currency?: string;
}

export async function createGroup(payload: CreateGroupPayload): Promise<GroupSummary> {
  const res = await fetchWithAuth('/api/v1/groups', { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) await throwApiError(res, 'Failed to create group');
  return res.json();
}

export async function listGroups(includeArchived = false, includeDeleted = false): Promise<GroupSummary[]> {
  const params = new URLSearchParams();
  if (includeArchived) params.set('include_archived', 'true');
  if (includeDeleted) params.set('include_deleted', 'true');
  
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetchWithAuth(`/api/v1/groups${qs}`);
  if (!res.ok) await throwApiError(res, 'Failed to list groups');
  return res.json();
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

export async function getGroupActivity(groupId: string, limit = 50, offset = 0): Promise<GroupActivityListResponse> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/activity?limit=${limit}&offset=${offset}`);
  if (!res.ok) await throwApiError(res, 'Failed to load group activity');
  return res.json();
}

export async function getGroup(groupId: string): Promise<GroupDetailResponse> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}`);
  if (!res.ok) await throwApiError(res, 'Failed to load group');
  return res.json();
}

export async function updateGroup(
  groupId: string,
  payload: { name?: string; group_type?: string; cover?: string; simplify_debts?: boolean; default_split?: any }
): Promise<GroupDetailResponse> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}`, { method: 'PUT', body: JSON.stringify(payload) });
  if (!res.ok) await throwApiError(res, 'Failed to update group');
  return res.json();
}

export async function deleteGroup(groupId: string, force = false): Promise<void> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}?force=${force}`, {
    method: 'DELETE',
  });
  if (!res.ok) await throwApiError(res, 'Failed to delete group');
}

export async function archiveGroup(groupId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/archive`, {
    method: 'POST',
  });
  if (!res.ok) await throwApiError(res, 'Failed to archive group');
}

export async function unarchiveGroup(groupId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/unarchive`, {
    method: 'POST',
  });
  if (!res.ok) await throwApiError(res, 'Failed to unarchive group');
}

export async function restoreGroup(groupId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/restore`, {
    method: 'POST',
  });
  if (!res.ok) await throwApiError(res, 'Failed to restore group');
}

export async function addMember(
  groupId: string,
  payload: { email?: string; display_name?: string }
): Promise<MemberDTO> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to add member');
  return res.json();
}

export async function removeMember(groupId: string, memberId: string, force = false): Promise<void> {
  const qs = force ? '?force=true' : '';
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/members/${memberId}${qs}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to remove member');
}

export async function leaveGroup(groupId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/leave`, { method: 'POST' });
  if (!res.ok) await throwApiError(res, 'Failed to leave group');
}

export interface CreateInviteResponse {
  token: string;
  url: string;
  expires_at: string;
}

export async function createInvite(groupId: string, memberId: string): Promise<CreateInviteResponse> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/invites`, {
    method: 'POST',
    body: JSON.stringify({ member_id: memberId }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create invite');
  return res.json();
}

export interface AcceptInviteResponse {
  group_id: string;
  member_id: string;
  display_name: string;
}

export async function acceptInvite(token: string): Promise<AcceptInviteResponse> {
  const res = await fetchWithAuth('/api/v1/groups/invites/accept', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to accept invite');
  return res.json();
}

// ---------------------------------------------------------------------------
// Group expenses + balances (TS-GRP-104)
// ---------------------------------------------------------------------------

export interface SplitEntryPayload {
  member_id: string;
  value?: number;
}

export interface GroupExpenseItemEntry {
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
  attributes_json?: string | null;
  member_ratios: Record<string, number>;
}

export interface GroupExpenseWithItemsPayload {
  date: string;
  description: string;
  category: string;
  amount: number;
  merchant_name?: string;
  payers: { member_id: string; amount_paid: number }[];
  items: GroupExpenseItemEntry[];
}

export interface GroupExpenseWithItemsResponse {
  expense_id: string;
  item_ids: string[];
  my_share: number;
}

export interface GroupExpensePayload {
  date: string; // MM/DD/YYYY
  description: string;
  category: string;
  amount: number;
  merchant_name?: string;
  payers: { member_id: string; amount_paid: number }[];
  split: { type: 'equal' | 'exact' | 'percentage' | 'shares' | 'adjustment'; entries: SplitEntryPayload[] };
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

export async function createGroupExpense(
  groupId: string,
  payload: GroupExpensePayload
): Promise<GroupExpenseRow> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/expenses`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to add group expense');
  const body = await res.json();
  return body.expense;
}

export async function createGroupExpenseWithItems(
  groupId: string,
  payload: GroupExpenseWithItemsPayload
): Promise<GroupExpenseWithItemsResponse> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/expenses/itemized`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to add itemized group expense');
  return res.json();
}

export async function listGroupExpenses(
  groupId: string,
  offset = 0,
  limit = 30
): Promise<GroupExpenseListResponse> {
  const params = new URLSearchParams({ offset: offset.toString(), limit: limit.toString() });
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/expenses?${params.toString()}`);
  if (!res.ok) await throwApiError(res, 'Failed to load group expenses');
  return res.json();
}

export interface UnifiedGroupExpenseRow extends GroupExpenseRow {
  group_id: string;
  group_name: string;
}

/** All of the user's group expenses across every group they belong to, for the
 * "Groups"/"Combined" scope views (there is no unified backend list endpoint —
 * §13.3 of the spec floats one as a future `/expenses?scope=combined` addition,
 * but it isn't built; Phase 1 group volumes are expected to be small per §6.5,
 * so an unpaginated per-group fetch is an acceptable simplification here). */
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

export async function updateGroupExpense(
  groupId: string,
  expenseId: string,
  payload: GroupExpensePayload
): Promise<GroupExpenseRow> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/expenses/${expenseId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update group expense');
  const body = await res.json();
  return body.expense;
}

export async function deleteGroupExpense(groupId: string, expenseId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/expenses/${expenseId}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete group expense');
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

export async function getBalances(groupId: string): Promise<BalanceResponse> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/balances`);
  if (!res.ok) await throwApiError(res, 'Failed to load balances');
  return res.json();
}

// ---------------------------------------------------------------------------
// Settlements (TS-GRP-105)
// ---------------------------------------------------------------------------

export interface SettlementDTO {
  id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  method?: string | null;
  settled_at: string;
  notes?: string | null;
  created_by?: string | null;
}

export interface RecordSettlementPayload {
  from_member_id: string;
  to_member_id: string;
  amount: number;
  method?: string;
  settled_at?: string;
  notes?: string;
}

export async function createSettlement(
  groupId: string,
  payload: RecordSettlementPayload
): Promise<SettlementDTO> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/settlements`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to record settlement');
  return res.json();
}

export async function listSettlements(groupId: string): Promise<SettlementDTO[]> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/settlements`);
  if (!res.ok) await throwApiError(res, 'Failed to load settlements');
  return res.json();
}

export async function deleteSettlement(groupId: string, settlementId: string): Promise<void> {
  const res = await fetchWithAuth(`/api/v1/groups/${groupId}/settlements/${settlementId}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to undo settlement');
}
