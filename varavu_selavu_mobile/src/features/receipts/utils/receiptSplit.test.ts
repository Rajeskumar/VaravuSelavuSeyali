import { distributeCents, buildMemberRatios, effectiveAssignees, toggleAssignee, computeReceiptShares } from './receiptSplit';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('receiptSplit', () => {
  it('distributes cents so the parts add back up', () => {
    expect(distributeCents(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(sum(distributeCents(-333, [3, 2, 1]))).toBe(-333);
    expect(distributeCents(500, [0, 0])).toEqual([250, 250]);
    expect(distributeCents(100, [])).toEqual([]);
  });

  it('falls back to everyone when a line has no valid assignee', () => {
    expect(effectiveAssignees(undefined, ['a', 'b'])).toEqual(['a', 'b']);
    expect(effectiveAssignees([], ['a', 'b'])).toEqual(['a', 'b']);
    expect(effectiveAssignees(['gone'], ['a', 'b'])).toEqual(['a', 'b']);
    expect(effectiveAssignees(['b', 'gone'], ['a', 'b'])).toEqual(['b']);
  });

  it('builds equal member ratios over the assignees', () => {
    expect(buildMemberRatios(['a', 'b'], ['a', 'b', 'c'])).toEqual({ a: 0.5, b: 0.5 });
    expect(buildMemberRatios(undefined, ['a', 'b'])).toEqual({ a: 0.5, b: 0.5 });
  });

  it('toggles assignees immutably', () => {
    const a = toggleAssignee({}, 1, 'x');
    expect(a).toEqual({ 1: ['x'] });
    expect(toggleAssignee(a, 1, 'x')).toEqual({ 1: [] });
    expect(a).toEqual({ 1: ['x'] });
  });

  it('computes shares that add back up to lines + tax − discount', () => {
    const lines = [
      { line_no: 1, line_total: 10 },
      { line_no: 2, line_total: 20 },
      { line_no: 3, line_total: 5.01 },
    ];
    const r = computeReceiptShares(lines, { 1: ['a'], 2: ['b'] }, ['a', 'b', 'c'], 3, 1);
    expect(r.extras).toBe(2);
    // line 3 is unassigned → three-way split; totals must reconcile exactly
    expect(Math.round(sum(Object.values(r.perMember)) * 100)).toBe(Math.round((35.01 + 2) * 100));
    expect(r.perMember.b).toBeGreaterThan(r.perMember.a);
  });

  it('splits extras equally when nothing has a price', () => {
    const r = computeReceiptShares([], {}, ['a', 'b'], 2, 0);
    expect(r.perMember).toEqual({ a: 1, b: 1 });
  });
});
