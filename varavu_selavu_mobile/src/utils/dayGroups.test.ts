import { parseFeedDate, dayLabel, groupRowsByDay } from './dayGroups';

const NOW = new Date(2026, 8, 20); // Sep 20, 2026 (local)

describe('parseFeedDate', () => {
  it('parses MM/DD/YYYY as a local date', () => {
    const d = parseFeedDate('09/19/2026')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(19);
  });
  it('parses an ISO date without a UTC day-shift', () => {
    const d = parseFeedDate('2026-09-19T00:00:00')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(19);
  });
  it('returns null for unparseable input', () => {
    expect(parseFeedDate('not a date')).toBeNull();
  });
});

describe('dayLabel', () => {
  it('labels today and yesterday specially', () => {
    expect(dayLabel(NOW, NOW)).toBe('Today');
    expect(dayLabel(new Date(2026, 8, 19), NOW)).toBe('Yesterday');
  });
  it('falls back to a short month/day label for anything older', () => {
    expect(dayLabel(new Date(2026, 8, 15), NOW)).toBe('Sep 15');
    expect(dayLabel(new Date(2025, 11, 25), NOW)).toBe('Dec 25');
  });
});

describe('groupRowsByDay', () => {
  const rows = [
    { date: '09/20/2026', amount: 10, key: 'a' },
    { date: '09/20/2026', amount: 5, key: 'b' },
    { date: '09/19/2026', amount: 20, key: 'c' },
    { date: '09/15/2026', amount: 7, key: 'd' },
  ];

  it('groups by calendar day, preserving input order (newest-first)', () => {
    const groups = groupRowsByDay(rows, NOW);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Sep 15']);
    expect(groups[0].items.map((r) => r.key)).toEqual(['a', 'b']);
  });

  it('sums a per-day subtotal', () => {
    const groups = groupRowsByDay(rows, NOW);
    expect(groups[0].subtotal).toBe(15);
    expect(groups[1].subtotal).toBe(20);
    expect(groups[2].subtotal).toBe(7);
  });

  it('buckets unparseable dates under Undated rather than dropping them', () => {
    const groups = groupRowsByDay([...rows, { date: 'garbage', amount: 1, key: 'e' }], NOW);
    const undated = groups.find((g) => g.label === 'Undated');
    expect(undated?.items.map((r) => r.key)).toEqual(['e']);
  });

  it('returns nothing for an empty feed', () => {
    expect(groupRowsByDay([], NOW)).toEqual([]);
  });
});
