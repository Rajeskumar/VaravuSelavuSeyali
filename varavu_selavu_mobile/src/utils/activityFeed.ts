/**
 * V2 Activity (bell) — one dated stream assembled client-side from data the app already has:
 * per-group activity logs, recurring items coming due, budgets that need attention and the top
 * month-over-month change. There is no server-side notification inbox, so nothing here is
 * "unread" state — it is a recent-history view, newest first.
 */
import type { GroupActivityDTO } from '../api/groups';

export type FeedTone = 'cyan' | 'green' | 'amber' | 'violet' | 'muted';

export interface FeedItem {
  id: string;
  title: string;
  body?: string;
  at: Date;
  tone: FeedTone;
}

const money = (n: unknown) => `$${(Number(n) || 0).toFixed(2)}`;

/** '2m' / '1h' / '3d' / 'now' — mono-column friendly. Future dates (a due date) read as 'in 3d'. */
export function relativeShort(at: Date, now: Date): string {
  const diffMs = now.getTime() - at.getTime();
  const abs = Math.abs(diffMs);
  const min = Math.floor(abs / 60000);
  const hr = Math.floor(abs / 3600000);
  const day = Math.floor(abs / 86400000);
  const core = min < 1 ? 'now' : min < 60 ? `${min}m` : hr < 24 ? `${hr}h` : `${day}d`;
  if (core === 'now') return core;
  return diffMs < 0 ? `in ${core}` : core;
}

/** Group activity actions worth surfacing → feed copy. Returns null for noise (settings edits etc.). */
export function describeGroupActivity(
  item: GroupActivityDTO,
  groupName: string,
  nameFor: (memberId: string | null) => string,
): FeedItem | null {
  const p = item.payload || {};
  const actor = nameFor(item.actor_member_id);
  const at = new Date(item.created_at);
  const base = { id: `g-${item.id}`, at };

  switch (item.action) {
    case 'expense_created':
    case 'itemized_expense_created':
      return { ...base, tone: 'cyan', title: `${actor} added “${p.description ?? 'an expense'}” to ${groupName}`, body: money(p.amount) };
    case 'expense_updated':
      return { ...base, tone: 'amber', title: `${actor} edited “${p.description ?? 'an expense'}” in ${groupName}` };
    case 'expense_deleted':
      return { ...base, tone: 'muted', title: `${actor} deleted “${p.description ?? 'an expense'}” from ${groupName}` };
    case 'settlement_created':
      if (p.from_member_id && p.to_member_id) {
        const to = nameFor(p.to_member_id);
        return { ...base, tone: 'green', title: `${nameFor(p.from_member_id)} paid ${to === 'You' ? 'you' : to} in ${groupName}`, body: money(p.amount) };
      }
      return { ...base, tone: 'green', title: `${actor} recorded a payment in ${groupName}`, body: money(p.amount) };
    // A name-only seat never "joined" — someone added it. Only an accepted invite is a join.
    case 'member_added':
      return { ...base, tone: 'violet', title: `${actor} added ${p.display_name ?? 'someone'} to ${groupName}` };
    case 'member_joined':
      return { ...base, tone: 'violet', title: `${p.display_name ?? 'Someone'} joined ${groupName}` };
    default:
      return null;
  }
}

/** Merge sources, newest first. Stable for equal timestamps so the list doesn't jitter on refetch. */
export function mergeFeed(...sources: FeedItem[][]): FeedItem[] {
  return sources
    .flat()
    .map((item, i) => ({ item, i }))
    .sort((a, b) => b.item.at.getTime() - a.item.at.getTime() || a.i - b.i)
    .map(({ item }) => item);
}
