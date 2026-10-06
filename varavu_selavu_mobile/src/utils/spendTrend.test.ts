import { lastMonthsTrend, barFractions, percentChange, previousMonthToDateRange } from './spendTrend';

const NOW = new Date(2026, 8, 19); // 19 Sep 2026

describe('lastMonthsTrend', () => {
  it('returns the six months ending at the current one, oldest first', () => {
    const pts = lastMonthsTrend([], NOW);
    expect(pts.map((p) => p.label)).toEqual(['APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP']);
    expect(pts[5].isCurrent).toBe(true);
    expect(pts.slice(0, 5).every((p) => !p.isCurrent)).toBe(true);
  });

  it('spans a year boundary', () => {
    const pts = lastMonthsTrend([{ month: '2025-12', total: 10 }, { month: '2026-01', total: 20 }], new Date(2026, 1, 3));
    expect(pts.map((p) => p.key)).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
    expect(pts[3].total).toBe(10);
    expect(pts[4].total).toBe(20);
    expect(pts[5].total).toBe(0);
  });

  it('treats missing months as zero', () => {
    const pts = lastMonthsTrend([{ month: '2026-09', total: 100 }], NOW);
    expect(pts.map((p) => p.total)).toEqual([0, 0, 0, 0, 0, 100]);
  });
});

describe('barFractions', () => {
  it('scales to the tallest month', () => {
    const pts = lastMonthsTrend([{ month: '2026-08', total: 50 }, { month: '2026-09', total: 100 }], NOW);
    const f = barFractions(pts);
    expect(f[5]).toBe(1);
    expect(f[4]).toBe(0.5);
  });

  it('keeps a floor for empty months and an all-zero series', () => {
    expect(barFractions(lastMonthsTrend([], NOW), 0.1)).toEqual([0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    const f = barFractions(lastMonthsTrend([{ month: '2026-09', total: 100 }], NOW), 0.1);
    expect(f[0]).toBe(0.1);
  });
});

describe('percentChange', () => {
  it('rounds to a whole percent, negative when spend fell', () => {
    expect(percentChange(176, 200)).toBe(-12);
  });

  it('is null with no baseline', () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(100, undefined)).toBeNull();
  });
});

describe('previousMonthToDateRange', () => {
  it('covers the same days of last month', () => {
    expect(previousMonthToDateRange(new Date(2026, 9, 5))).toEqual({ start_date: '2026-09-01', end_date: '2026-09-05' });
  });

  it('clamps to the end of a shorter previous month', () => {
    expect(previousMonthToDateRange(new Date(2026, 2, 31))).toEqual({ start_date: '2026-02-01', end_date: '2026-02-28' });
  });

  it('crosses the year boundary in January', () => {
    expect(previousMonthToDateRange(new Date(2027, 0, 10))).toEqual({ start_date: '2026-12-01', end_date: '2026-12-10' });
  });
});
