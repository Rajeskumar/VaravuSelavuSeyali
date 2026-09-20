import { splitTopSegments, donutDashes } from './segments';

const seg = (category: string, pct: number) => ({ category, total: pct * 10, pct });

describe('splitTopSegments', () => {
  it('keeps everything when there is at most one segment to fold', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((c) => seg(c, 10));
    expect(splitTopSegments(six, 5)).toMatchObject({ top: six, rest: [], restPct: 0, restTotal: 0 });
  });

  it('folds the tail into a rest bucket with summed pct and total', () => {
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((c, i) => seg(c, 20 - i));
    const r = splitTopSegments(eight, 5);
    expect(r.top.map((s) => s.category)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(r.rest.map((s) => s.category)).toEqual(['f', 'g', 'h']);
    expect(r.restPct).toBe(15 + 14 + 13);
    expect(r.restTotal).toBe((15 + 14 + 13) * 10);
  });
});

describe('donutDashes', () => {
  it('lays segments end to end around the circumference', () => {
    const d = donutDashes([25, 50, 25], 100);
    expect(d.map((x) => x.dash)).toEqual([25, 50, 25]);
    expect(d.map((x) => x.offset)).toEqual([-0, -25, -75]);
    expect(d[0].gap).toBe(75);
  });

  it('never returns negative geometry', () => {
    const d = donutDashes([120, -5], 100);
    expect(d.every((x) => x.dash >= 0 && x.gap >= 0)).toBe(true);
  });
});
