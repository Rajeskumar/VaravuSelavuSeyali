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


// TS-QA-101: a deleted/archived/left group is missing from group_summaries but still spending.
describe('totals from the server spend_breakdown', () => {
  const breakdown = { personal: 1180.4, group_share: 161.8, i_paid_share: 239.6 };

  it('My expenses uses group_share, which includes groups the summaries omit', () => {
    expect(computeMyExpensesTotal(1180.4, GROUPS, breakdown)).toBe(1342.2);
  });

  it('I paid uses i_paid_share', () => {
    expect(computeIPaidTotal(1180.4, GROUPS, breakdown)).toBe(1420);
  });

  it('I paid falls back to the summaries when an older server omits i_paid_share', () => {
    expect(computeIPaidTotal(1180.4, GROUPS, { personal: 1180.4, group_share: 96.8 })).toBeCloseTo(1180.4 + 174.6);
  });
});
