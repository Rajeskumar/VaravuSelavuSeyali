import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';

const colors = {
  ink: '#191A1E',
  inkMuted: '#6B6D74',
  paper: '#F7F7F4',
  surface: '#FFFFFF',
  hairline: '#E4E4DF',
  jade: '#0FA37F',
  jadeText: '#0B8A6B',
  ember: '#DE5B4B',
  gold: '#C9973F',
};

const MONTH_LABELS = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
const STORE_PAIR = ["Trader Joe's", 'Whole Foods'];
const PATTERN_UP = [-0.08, -0.04, -0.01, 0.02, 0.05, 0.09];
const PATTERN_DOWN = [0.06, 0.03, 0.01, -0.02, -0.04, -0.05];

function genericHistory(avg, patternIndex = 0) {
  const pattern = patternIndex % 2 === 0 ? PATTERN_UP : PATTERN_DOWN;
  return pattern.map((v, i) => ({
    date: `${MONTH_LABELS[i]} 2026`,
    store: STORE_PAIR[i % 2],
    price: +(avg * (1 + v)).toFixed(2),
  }));
}

// Hand-tuned so it matches the "eggs cost 18% more" insight already surfaced on the Analysis page.
const EGGS_HISTORY = [
  { date: 'Feb 3', store: "Trader Joe's", price: 3.80 },
  { date: 'Mar 1', store: 'Whole Foods', price: 4.20 },
  { date: 'Mar 29', store: "Trader Joe's", price: 3.80 },
  { date: 'Apr 26', store: "Trader Joe's", price: 3.95 },
  { date: 'May 24', store: 'Whole Foods', price: 4.35 },
  { date: 'Jun 21', store: "Trader Joe's", price: 4.10 },
  { date: 'Jul 5', store: "Trader Joe's", price: 4.49 },
];

const itemsData = {
  eggs: { name: 'Eggs, dozen', history: EGGS_HISTORY },
  bananas: { name: 'Bananas', history: genericHistory(1.95, 0) },
  oatmilk: { name: 'Oat Milk', history: genericHistory(4.85, 1) },
  chicken: { name: 'Chicken Breast', history: genericHistory(9.20, 0) },
  coffee: { name: 'Coffee Beans', history: genericHistory(12.50, 1) },
  papertowels: { name: 'Paper Towels', history: genericHistory(8.75, 0) },
};

function statsFor(history) {
  const prices = history.map((h) => h.price);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const total = prices.reduce((a, b) => a + b, 0);
  return { avg, min, max, total, count: history.length };
}

function storeStats(history) {
  const map = {};
  history.forEach((h) => {
    if (!map[h.store]) map[h.store] = [];
    map[h.store].push(h.price);
  });
  return Object.entries(map)
    .map(([store, prices]) => ({ store, avg: prices.reduce((a, b) => a + b, 0) / prices.length, count: prices.length }))
    .sort((a, b) => a.avg - b.avg);
}

function formatMoney(n) {
  return `$${Math.abs(n).toFixed(2)}`;
}

function PriceLine({ history }) {
  const prices = history.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 300, h = 70, padX = 16, padTop = 10, padBottom = 10;
  const usableW = w - padX * 2;
  const usableH = h - padTop - padBottom;

  const points = history.map((pt, i) => ({
    x: padX + (i * usableW) / (history.length - 1),
    y: padTop + usableH - ((pt.price - min) / range) * usableH,
    ...pt,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const lastDelta = points[points.length - 1].price - points[points.length - 2].price;
  const lastColor = lastDelta > 0 ? colors.ember : lastDelta < 0 ? colors.jadeText : colors.ink;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 70, display: 'block' }} preserveAspectRatio="none">
        <path d={pathD} fill="none" stroke={colors.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 3.5 : 2.5} fill={i === points.length - 1 ? lastColor : colors.ink} />
        ))}
      </svg>
      <div className="flex justify-between px-4" style={{ marginTop: 2 }}>
        {history.map((pt, i) => (
          <span key={i} style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: colors.inkMuted }}>
            {pt.date.split(' ')[0]}
          </span>
        ))}
      </div>
    </div>
  );
}

function StoreChips({ history }) {
  const stats = storeStats(history);
  return (
    <div className="flex gap-2 flex-wrap">
      {stats.map((s, i) => (
        <div
          key={s.store}
          className="flex items-center gap-1"
          style={{
            padding: '6px 10px',
            borderRadius: 999,
            border: `1px solid ${i === 0 ? colors.jade : colors.hairline}`,
            backgroundColor: i === 0 ? 'rgba(15,163,127,0.06)' : colors.surface,
          }}
        >
          {i === 0 && <Check size={12} style={{ color: colors.jadeText }} />}
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: colors.ink }}>{s.store}</span>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, fontVariantNumeric: 'tabular-nums' }}>
            avg {formatMoney(s.avg)}
          </span>
        </div>
      ))}
    </div>
  );
}

function PurchaseTape({ history }) {
  const sorted = [...history].reverse();
  return (
    <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.hairline}`, borderRadius: 10, borderTop: `2px dashed ${colors.hairline}`, overflow: 'hidden' }}>
      {sorted.map((h, i) => (
        <div
          key={i}
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: i < sorted.length - 1 ? `1px dashed ${colors.hairline}` : 'none' }}
        >
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.ink }}>{h.store}</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: colors.inkMuted }}>{h.date}</div>
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 500, color: colors.ink }}>
            {formatMoney(h.price)}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatBlock({ label, value, color }) {
  return (
    <div className="flex-1">
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: colors.inkMuted, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: color || colors.ink, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

export default function ItemInsights() {
  const [selectedId, setSelectedId] = useState(null);

  const listRows = Object.entries(itemsData)
    .map(([id, d]) => ({ id, name: d.name, ...statsFor(d.history) }))
    .sort((a, b) => b.total - a.total);

  const selected = selectedId ? itemsData[selectedId] : null;
  const selectedStats = selected ? statsFor(selected.history) : null;

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#DADAD5' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 780, backgroundColor: colors.paper }}>
        <div className="overflow-y-auto flex-1">
          {!selected ? (
            <>
              <div className="px-5 pt-6 pb-4">
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: colors.ink }}>Item Insights</span>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginTop: 2 }}>
                  What you buy, and what it costs over time
                </div>
              </div>
              <div className="px-5">
                {listRows.map((row) => (
                  <button
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className="w-full flex items-center gap-3 py-3"
                    style={{ borderBottom: `1px solid ${colors.hairline}` }}
                  >
                    <div className="flex-1 text-left min-w-0">
                      <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink }}>
                        {row.name}
                      </div>
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>
                        {row.count} purchases · avg {formatMoney(row.avg)}
                      </div>
                    </div>
                    <span
                      style={{
                        fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatMoney(row.total)}
                    </span>
                    <ChevronRight size={16} style={{ color: colors.inkMuted, flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="px-5 pt-6 pb-1 flex items-center gap-2">
                <button onClick={() => setSelectedId(null)} style={{ color: colors.ink }}>
                  <ChevronLeft size={22} />
                </button>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>Item Insights</span>
              </div>
              <div className="px-5 pb-4">
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 600, color: colors.ink }}>
                  {selected.name}
                </div>
              </div>

              <div className="px-5 pb-5 flex gap-3">
                <StatBlock label="Avg" value={formatMoney(selectedStats.avg)} />
                <StatBlock label="Lowest" value={formatMoney(selectedStats.min)} color={colors.jadeText} />
                <StatBlock label="Highest" value={formatMoney(selectedStats.max)} color={colors.ember} />
                <StatBlock label="Total spent" value={formatMoney(selectedStats.total)} />
              </div>

              <div className="px-5 pb-5">
                <div
                  className="mb-2"
                  style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}
                >
                  PRICE HISTORY
                </div>
                <PriceLine history={selected.history} />
              </div>

              <div className="px-5 pb-5">
                <div
                  className="mb-2"
                  style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}
                >
                  WHERE YOU'VE BOUGHT THIS
                </div>
                <StoreChips history={selected.history} />
              </div>

              <div className="px-5 pb-6">
                <div
                  className="mb-2"
                  style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}
                >
                  PURCHASE HISTORY
                </div>
                <PurchaseTape history={selected.history} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
