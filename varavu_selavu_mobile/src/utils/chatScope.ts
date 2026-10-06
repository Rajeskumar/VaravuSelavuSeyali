import type { ChatResolvedPeriod, ChatResolvedScope } from '../api/chat';

/**
 * The mono "LOOKED AT" line above an answer, built only from what the backend says it resolved —
 * e.g. "LOOKED AT · JULY 2026 · MY SPENDING". Returns null when there's nothing real to show,
 * so an answer never carries an invented provenance line.
 *
 * A `default` period is left out: when the question names no period the backend still reports
 * the current month, but the agent's tools may look across all time (item prices, balances), so
 * "This month" on those answers was wrong. A plain personal scope alone says nothing, so it only
 * appears next to a period the user actually asked about.
 */
export function scopeLine(period?: ChatResolvedPeriod, scope?: ChatResolvedScope): string | null {
  const parts: string[] = [];
  if (period?.label && period.source !== 'default') parts.push(period.label);
  if (scope?.kind === 'group') parts.push(scope.group_name || 'A group');
  else if (scope && parts.length > 0) parts.push('My spending');
  if (parts.length === 0) return null;
  return ['Looked at', ...parts].join(' · ').toUpperCase();
}
