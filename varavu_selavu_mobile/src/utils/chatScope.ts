import type { ChatResolvedPeriod, ChatResolvedScope } from '../api/chat';

/**
 * The mono "LOOKED AT" line above an answer, built only from what the backend says it resolved —
 * e.g. "LOOKED AT · JULY 2026 · MY SPENDING". Returns null when there's nothing real to show,
 * so an answer never carries an invented provenance line.
 */
export function scopeLine(period?: ChatResolvedPeriod, scope?: ChatResolvedScope): string | null {
  const parts: string[] = [];
  if (period?.label) parts.push(period.label);
  if (scope) parts.push(scope.kind === 'group' ? (scope.group_name || 'A group') : 'My spending');
  if (parts.length === 0) return null;
  return ['Looked at', ...parts].join(' · ').toUpperCase();
}
