/** Splits ranked category segments into the top N plus a folded "rest" for the donut legend. */
export interface Segment {
  category: string;
  total: number;
  pct: number;
}

export function splitTopSegments<T extends Segment>(segments: T[], topN = 5): { top: T[]; rest: T[]; restPct: number; restTotal: number } {
  // Only fold when there's more than one segment to fold — a lone "Others" row hiding a single
  // category would be strictly worse than just showing it.
  if (segments.length <= topN + 1) return { top: segments, rest: [], restPct: 0, restTotal: 0 };
  const top = segments.slice(0, topN);
  const rest = segments.slice(topN);
  return {
    top,
    rest,
    restPct: rest.reduce((s, x) => s + x.pct, 0),
    restTotal: rest.reduce((s, x) => s + x.total, 0),
  };
}

/** Stroke-dash geometry for a donut drawn as stacked circle strokes: [dash, gap, offset] per segment. */
export function donutDashes(pcts: number[], circumference: number): { dash: number; gap: number; offset: number }[] {
  let acc = 0;
  return pcts.map((p) => {
    const dash = Math.max((p / 100) * circumference, 0);
    const out = { dash, gap: Math.max(circumference - dash, 0), offset: -acc };
    acc += dash;
    return out;
  });
}
