import { scopeLine } from './chatScope';

describe('scopeLine', () => {
  const period = { start_date: '2026-07-01', end_date: '2026-07-31', label: 'July 2026', source: 'default' as const };

  it('joins the resolved period and personal scope', () => {
    expect(scopeLine(period, { kind: 'personal' })).toBe('LOOKED AT · JULY 2026 · MY SPENDING');
  });

  it('names the group when the scope is a group', () => {
    expect(scopeLine(period, { kind: 'group', group_name: 'IndiaTrip' })).toBe('LOOKED AT · JULY 2026 · INDIATRIP');
    expect(scopeLine(period, { kind: 'group' })).toBe('LOOKED AT · JULY 2026 · A GROUP');
  });

  it('works with only one half present', () => {
    expect(scopeLine(period, undefined)).toBe('LOOKED AT · JULY 2026');
    expect(scopeLine(undefined, { kind: 'personal' })).toBe('LOOKED AT · MY SPENDING');
  });

  it('is null when the backend resolved nothing', () => {
    expect(scopeLine(undefined, undefined)).toBeNull();
  });
});
