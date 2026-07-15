import { computeMyExpensesTotal, computeIPaidTotal, computeNetWithPeople, AnalysisGroupSummary } from './dashboardTotals';

const GROUPS: AnalysisGroupSummary[] = [
  { group_id: 'g1', name: 'Roommates', my_share: 56.8, i_paid: 174.6, group_total: 174.6, my_balance: 56.8 },
  { group_id: 'g2', name: 'Weekend Trip', my_share: 40.0, i_paid: 0, group_total: 220.0, my_balance: -27.5 },
];

describe('computeMyExpensesTotal', () => {
  it('sums personal spend + every group my_share', () => {
    expect(computeMyExpensesTotal(1180.4, GROUPS)).toBeCloseTo(1180.4 + 56.8 + 40.0);
  });

  it('returns just the personal amount with no groups', () => {
    expect(computeMyExpensesTotal(100, [])).toBe(100);
  });
});

describe('computeIPaidTotal', () => {
  it('sums personal spend + every group i_paid', () => {
    expect(computeIPaidTotal(1180.4, GROUPS)).toBeCloseTo(1180.4 + 174.6 + 0);
  });
});

describe('computeNetWithPeople', () => {
  it('sums my_balance across every group, signed', () => {
    expect(computeNetWithPeople(GROUPS)).toBeCloseTo(56.8 - 27.5);
  });

  it('returns 0 with no groups', () => {
    expect(computeNetWithPeople([])).toBe(0);
  });
});
