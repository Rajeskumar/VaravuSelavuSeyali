import { recentMonths, changeRow, priceChange, confidenceBadge } from './insightsFormat';
import type { ChangeInsight } from '../api/analytics';

const ci = (o: Partial<ChangeInsight>): ChangeInsight => ({
  metric_name: 'x', previous_value: 0, current_value: 0, change_amount: 0, change_percent: 0, time_scope: 'month', ...o,
});

describe('recentMonths', () => {
  it('lists the last months newest first, across a year boundary', () => {
    const m = recentMonths(new Date(2026, 1, 10), 4);
    expect(m.map((x) => x.label)).toEqual(['Feb 2026', 'Jan 2026', 'Dec 2025', 'Nov 2025']);
    expect(m[0]).toMatchObject({ value: '2026-02', year: 2026, month: 2 });
  });
});

describe('changeRow', () => {
  it('shows a new merchant with its amount in the accent tone', () => {
    const r = changeRow(ci({ metric_name: 'New Merchant Detected', current_value: 240, entity_name: 'Tesla', time_scope: 'merchant' }), 'August');
    expect(r).toMatchObject({ title: 'New merchant · Tesla', meta: 'First charge this month', delta: '$240', tone: 'accent', link: { kind: 'merchant', name: 'Tesla' } });
  });

  it('colours an increase red once it passes 150%, amber below', () => {
    expect(changeRow(ci({ change_percent: 156, previous_value: 262.1, current_value: 671.2 }), 'August').tone).toBe('error');
    expect(changeRow(ci({ change_percent: 116, previous_value: 13.36, current_value: 28.91 }), 'August').tone).toBe('warning');
  });

  it('formats the comparison line and signed delta', () => {
    const r = changeRow(ci({ metric_name: 'Dining out Spend Increased', change_percent: 156, previous_value: 262.1, current_value: 671.2 }), 'August');
    expect(r.meta).toBe('$671.20 vs $262.10 in August');
    expect(r.delta).toBe('+156%');
  });

  it('treats a decrease as good news', () => {
    const r = changeRow(ci({ change_percent: -30, previous_value: 100, current_value: 70 }), 'August');
    expect(r).toMatchObject({ tone: 'success', delta: '−30%' });
  });

  it('links merchant- and item-scoped insights, and nothing else', () => {
    expect(changeRow(ci({ time_scope: 'merchant', entity_name: 'Target', change_percent: 10, previous_value: 1 }), 'A').link).toEqual({ kind: 'merchant', name: 'Target' });
    expect(changeRow(ci({ metric_name: 'Price increase for Milk', entity_name: 'Milk', change_percent: 10, previous_value: 1 }), 'A').link).toEqual({ kind: 'item', name: 'Milk' });
    expect(changeRow(ci({ metric_name: 'Dining out Spend Increased', entity_name: 'Dining out', change_percent: 10, previous_value: 1 }), 'A').link).toBeUndefined();
  });

  it('falls back to the entity name when there is no previous value', () => {
    expect(changeRow(ci({ change_percent: 20, previous_value: 0, entity_name: 'Rent' }), 'A').meta).toBe('Rent');
  });
});

describe('priceChange', () => {
  const now = new Date(2026, 8, 19);
  it('compares against ~6 months ago when the history is long enough', () => {
    const h = [
      { date: '2026-03-20', unit_price: 3.92 }, { date: '2026-06-01', unit_price: 4.2 }, { date: '2026-09-15', unit_price: 4.62 },
    ];
    expect(priceChange(h, now)).toEqual({ label: 'VS 6 MO AGO', percent: 18 });
  });

  it('falls back to the first purchase for a short history, and says so', () => {
    const h = [{ date: '2026-08-20', unit_price: 4 }, { date: '2026-09-15', unit_price: 5 }];
    expect(priceChange(h, now)).toEqual({ label: 'SINCE FIRST BUY', percent: 25 });
  });

  it('is null with fewer than two priced points', () => {
    expect(priceChange([{ date: '2026-09-15', unit_price: 4 }], now)).toBeNull();
    expect(priceChange([], now)).toBeNull();
  });
});

describe('confidenceBadge', () => {
  it('maps grades to label and tone', () => {
    expect(confidenceBadge('high')).toEqual({ label: 'HIGH', tone: 'success' });
    expect(confidenceBadge('MEDIUM')).toEqual({ label: 'MED', tone: 'warning' });
    expect(confidenceBadge(null)).toEqual({ label: 'LOW', tone: 'muted' });
  });
});
