import { useQueryClient } from '@tanstack/react-query';
import { addExpense, addExpenseWithItems, AddExpensePayload } from '../api/expenses';
import { applyTagsToExpense } from '../api/tags';
import {
  createGroupExpense,
  createGroupExpenseWithItems,
  getGroup,
  GroupExpensePayload,
  GroupExpenseWithItemsPayload,
  GroupExpenseItemEntry,
  PayerSummaryItem,
} from '../api/groups';
import { findMainCategory } from '../components/expenses/AddExpenseForm';
import { SplitEditorValue } from '../components/groups/SplitEditor';
import { notifyExpenseChanged } from '../utils/expenseEvents';
import { isoToMMDDYYYY } from '../utils/date';

export interface QuickLogInput {
  description: string;
  category: string;
  /** Total amount — for a group log, this is the whole expense; split equally among every
   * member (with this user as sole payer) unless `payers`/`split` override that default. */
  amount: number;
  merchantName?: string;
  /** ISO yyyy-mm-dd; defaults to today. */
  date?: string;
  /** Overrides the default "I paid the full amount" — QuickCaptureSheet's PaidBySplitSummary
   * editor. Omitted by other callers (e.g. useQuickLogBar.ts), which keep today's default. */
  payers?: PayerSummaryItem[];
  /** Overrides the default "split equally among every member". */
  split?: SplitEditorValue;
  /** TS-TAG-107 — tag names to apply on save. Personal expenses get these write-through
   * (PRD §10.2); group expenses apply them in a follow-up call after creation, since the
   * group-expense create endpoint doesn't carry a tag_names field (TS-TAG-104 is personal-only
   * by design). */
  tagNames?: string[];
  /** TS-CARD-114 — optional "which held card did I use" attribution. Unlike tags, both the
   * personal and group create endpoints carry `card_id` directly, so no create-then-apply
   * follow-up call is needed for the group path. */
  cardId?: string | null;
}

export interface QuickLogItemInput {
  item_name: string;
  line_total: number;
  quantity?: number | null;
  unit_price?: number | null;
  normalized_name?: string;
}

export interface QuickLogWithItemsInput extends QuickLogInput {
  items: QuickLogItemInput[];
  tax?: number;
  discount?: number;
  /** ISO 8601 timestamp from the scan header, e.g. "2026-07-16T10:30:00". Only consumed
   * by the personal path — postgres_repo.append_expense parses header.purchased_at with
   * datetime.fromisoformat, unlike the group path's `date` (MM/DD/YYYY via strptime). */
  purchasedAtIso?: string;
  /** Dedupes against a previously-saved receipt with the same fingerprint. */
  fingerprint?: string;
  /** The itemized endpoint has no `split` concept (each item carries its own member_ratios,
   * not a whole-expense split type) — customizing "who's involved" for an itemized group
   * expense is expressed as this member subset instead of a full `split` value. Every item
   * gets an equal member_ratios map over just these members. Omitted = every group member. */
  participantMemberIds?: string[];
}

export interface QuickLogGroupResult {
  memberCount: number;
  myShare: number;
}

/**
 * Shared "save a quick-logged expense" path for QuickCaptureSheet and the Home
 * type-to-log bar — wraps addExpense/createGroupExpense with the same cache
 * invalidation MainLayout's FAB dialog already does (TS-DES-111's
 * `notifyExpenseChanged`, since not every page fetches via react-query) so
 * Home's recent feed/total refresh immediately regardless of entry point.
 */
export function useLogExpense() {
  const queryClient = useQueryClient();
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') || '' : '';

  const afterSave = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses', user] });
    notifyExpenseChanged();
  };

  const logPersonal = async (input: QuickLogInput) => {
    const payload: AddExpensePayload = {
      user_id: user,
      date: isoToMMDDYYYY(input.date || new Date().toISOString().split('T')[0]),
      description: input.description,
      category: input.category,
      cost: input.amount,
      merchant_name: input.merchantName || undefined,
      tag_names: input.tagNames?.length ? input.tagNames : undefined,
      card_id: input.cardId || undefined,
    };
    const result = await addExpense(payload);
    afterSave();
    return result;
  };

  const logToGroup = async (groupId: string, input: QuickLogInput): Promise<QuickLogGroupResult> => {
    const group = await getGroup(groupId);
    const myMember = group.members.find((m) => m.user_email === user);
    if (!myMember) throw new Error('You are not a member of this group.');

    const payload: GroupExpensePayload = {
      date: isoToMMDDYYYY(input.date || new Date().toISOString().split('T')[0]),
      description: input.description,
      category: input.category,
      amount: input.amount,
      merchant_name: input.merchantName || undefined,
      payers: input.payers ?? [{ member_id: myMember.member_id, amount_paid: input.amount }],
      split: input.split ?? { type: 'equal', entries: group.members.map((m) => ({ member_id: m.member_id })) },
      card_id: input.cardId || undefined,
    };
    const row = await createGroupExpense(groupId, payload);
    if (input.tagNames?.length) {
      await applyTagsToExpense(row.row_id, { tag_names: input.tagNames });
    }
    afterSave();
    // GroupsPage's own Add Expense flow invalidates these same two keys after
    // createGroupExpense — this entry point bypasses that page's handler, so it
    // has to invalidate them itself or a currently-open group detail view (and
    // the rail's balance figures) would show stale data until a manual refresh.
    queryClient.invalidateQueries({ queryKey: ['group-expenses', groupId] });
    queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    queryClient.invalidateQueries({ queryKey: ['friend-balances'] });
    // row.my_share reflects the actual resolved split (not just amount/memberCount) once a
    // custom payer/split is in play — a flat equal division would be wrong for e.g. a
    // percentage split or a split that excludes some members.
    return { memberCount: group.members.length, myShare: row.my_share };
  };

  const logPersonalWithItems = async (input: QuickLogWithItemsInput) => {
    const header = {
      merchant_name: input.merchantName,
      purchased_at: input.purchasedAtIso || new Date().toISOString(),
      amount: input.amount,
      tax: input.tax || 0,
      tip: 0,
      discount: input.discount || 0,
      description: input.description,
      main_category_name: findMainCategory(input.category),
      category_name: input.category,
      fingerprint: input.fingerprint || '',
    };
    const items = input.items.map((it, idx) => ({
      line_no: idx + 1,
      item_name: it.item_name,
      normalized_name: it.normalized_name,
      quantity: it.quantity ?? null,
      unit_price: it.unit_price ?? null,
      line_total: it.line_total,
    }));
    const result = await addExpenseWithItems({
      user_email: user, header, items,
      tag_names: input.tagNames?.length ? input.tagNames : undefined,
      card_id: input.cardId || undefined,
    });
    afterSave();
    return result;
  };

  const logToGroupWithItems = async (groupId: string, input: QuickLogWithItemsInput): Promise<QuickLogGroupResult> => {
    const group = await getGroup(groupId);
    const myMember = group.members.find((m) => m.user_email === user);
    if (!myMember) throw new Error('You are not a member of this group.');

    // The itemized endpoint has no per-item person-assignment UI in QuickCaptureSheet (that's
    // ItemSplitBoard's job, reachable only from the full editor) and no whole-expense `split`
    // concept either — split every item equally across `participantMemberIds` (defaulting to
    // every group member) so the line items themselves are preserved instead of silently
    // dropped, while still letting PaidBySplitSummary's participant-subset editing apply.
    const participants = input.participantMemberIds ?? group.members.map((m) => m.member_id);
    const ratio = participants.length > 0 ? 1 / participants.length : 1;
    const memberRatios = Object.fromEntries(participants.map((id) => [id, ratio]));
    const items: GroupExpenseItemEntry[] = input.items.map((it, idx) => ({
      line_no: idx + 1,
      item_name: it.item_name,
      normalized_name: it.normalized_name,
      quantity: it.quantity ?? null,
      unit_price: it.unit_price ?? null,
      line_total: it.line_total,
      // tax/discount are per-item fields server-side but resolve_itemized_split pools and
      // prorates them across every assigned member regardless of which item carries them —
      // attaching the header-level scan values to just the first item is equivalent to a
      // true header-level tax/discount.
      tax: idx === 0 ? input.tax || 0 : 0,
      discount: idx === 0 ? input.discount || 0 : 0,
      member_ratios: memberRatios,
    }));
    const payload: GroupExpenseWithItemsPayload = {
      date: isoToMMDDYYYY(input.date || new Date().toISOString().split('T')[0]),
      description: input.description,
      category: input.category,
      amount: input.amount,
      merchant_name: input.merchantName || undefined,
      payers: input.payers ?? [{ member_id: myMember.member_id, amount_paid: input.amount }],
      items,
      card_id: input.cardId || undefined,
    };
    const result = await createGroupExpenseWithItems(groupId, payload);
    if (input.tagNames?.length) {
      await applyTagsToExpense(result.row_id, { tag_names: input.tagNames });
    }
    afterSave();
    queryClient.invalidateQueries({ queryKey: ['group-expenses', groupId] });
    queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    queryClient.invalidateQueries({ queryKey: ['friend-balances'] });
    return { memberCount: group.members.length, myShare: result.my_share };
  };

  return { logPersonal, logToGroup, logPersonalWithItems, logToGroupWithItems };
}
