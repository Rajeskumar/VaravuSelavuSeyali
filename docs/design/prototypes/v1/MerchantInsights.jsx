import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, ArrowUpRight, ArrowDownRight } from 'lucide-react';

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

const merchantsData = {
  traderjoes: {
    name: "Trader Joe's",
    category: 'Food & Drink · Groceries',
    visits: 14,
    lifetimeSpent: 612.40,
    monthly: [78.20, 84.50, 71.00, 92.30, 88.10, 96.40],
    items: [
      { name: 'Eggs, dozen', spent: 20.14, trend: 'up' },
      { name: 'Bananas', spent: 21.45, trend: 'flat' },
      { name: 'Oat Milk', spent: 15.96, trend: 'down' },
    ],
    whatChanged: 'You visited 2 more times than last month.',
  },
  wholefoods: {
    name: 'Whole Foods',
    category: 'Food & Drink · Groceries',
    visits: 6,
    lifetimeSpent: 284.90,
    monthly: [52.00, 40.00, 38.00, 61.00, 45.60, 48.30],
    items: [
      { name: 'Eggs, dozen', spent: 8.55, trend: 'up' },
      { name: 'Coffee Beans', spent: 37.50, trend: 'flat' },
    ],
    whatChanged: 'Your average spend per visit is steady.',
  },
  starbucks: {
    name: 'Starbucks',
    category: 'Food & Drink · Dining out',
    visits: 22,
    lifetimeSpent: 148.75,
    monthly: [18.20, 22.40, 19.00, 25.10, 27.30, 36.75],
    items: [],
    whatChanged: 'Spend here is up 35% vs your 6-month average.',
  },
  shell: {
    name: 'Shell',
    category: 'Transportation · Gas/fuel',
    visits: 9,
    lifetimeSpent: 312.60,
    monthly: [48.00, 52.30, 45.00, 58.20, 51.00, 58.10],
    items: [],
    whatChanged: 'Roughly flat over the last 6 months.',
  },
};

function formatMoney(n) {
  return `$${Math.abs(n).toFixed(2)}`;
}

function trendMeta(trend) {
  if (trend === 'up') return { Icon: ArrowUpRight, color: colors.ember };
  if (trend === 'down') return { Icon: ArrowDownRight, color: colors.jadeText };
  return { Icon: null, color: colors.inkMuted };
}

function MonthlySpark({ values }) {
  const max = Math.max(...values);
  return (
    <div className="flex items-end gap-1" style={{ height: 32 }}>
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1"
          style={{
            height: Math.max(4, (v / max) * 32),
            borderRadius: 2,
            backgroundColor: i === values.length - 1 ? colors.ink : colors.hairline,
          }}
        />
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

export default function MerchantInsights() {
  const [selectedId, setSelectedId] = useState(null);

  const listRows = Object.entries(merchantsData)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => b.lifetimeSpent - a.lifetimeSpent);

  const selected = selectedId ? merchantsData[selectedId] : null;
  const avgPerVisit = selected ? selected.lifetimeSpent / selected.visits : 0;

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#DADAD5' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 780, backgroundColor: colors.paper }}>
        <div className="overflow-y-auto flex-1">
          {!selected ? (
            <>
              <div className="px-5 pt-6 pb-4">
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: colors.ink }}>Merchant Insights</span>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginTop: 2 }}>
                  Where your money goes, by place
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
                      <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>
                        {row.visits} visits · {row.category}
                      </div>
                    </div>
                    <span
                      style={{
                        fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatMoney(row.lifetimeSpent)}
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
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>Merchant Insights</span>
              </div>
              <div className="px-5 pb-1">
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 600, color: colors.ink }}>
                  {selected.name}
                </div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginTop: 2 }}>
                  {selected.category}
                </div>
              </div>

              <div className="px-5 pt-4 pb-5 flex gap-3">
                <StatBlock label="Lifetime spent" value={formatMoney(selected.lifetimeSpent)} />
                <StatBlock label="Visits" value={selected.visits} />
                <StatBlock label="Avg / visit" value={formatMoney(avgPerVisit)} />
              </div>

              <div className="px-5 pb-5">
                <div
                  className="mb-2"
                  style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}
                >
                  MONTHLY SPEND
                </div>
                <MonthlySpark values={selected.monthly} />
                <div className="flex justify-between px-0" style={{ marginTop: 6 }}>
                  {['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'].map((m) => (
                    <span key={m} style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: colors.inkMuted, flex: 1, textAlign: 'center' }}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              <div
                className="mx-5 mb-5 flex items-start gap-2"
                style={{ backgroundColor: colors.surface, border: `1px solid ${colors.hairline}`, borderRadius: 10, padding: 12 }}
              >
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.ink, lineHeight: 1.4 }}>
                  {selected.whatChanged}
                </span>
              </div>

              {selected.items.length > 0 && (
                <div className="px-5 pb-6">
                  <div
                    className="mb-2"
                    style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}
                  >
                    WHAT YOU BUY HERE
                  </div>
                  <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.hairline}`, borderRadius: 10, overflow: 'hidden' }}>
                    {selected.items.map((item, i) => {
                      const { Icon, color } = trendMeta(item.trend);
                      return (
                        <div
                          key={item.name}
                          className="flex items-center justify-between px-4 py-3"
                          style={{ borderBottom: i < selected.items.length - 1 ? `1px solid ${colors.hairline}` : 'none' }}
                        >
                          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink }}>{item.name}</span>
                          <div className="flex items-center gap-1">
                            {Icon && <Icon size={13} style={{ color }} />}
                            <span
                              style={{
                                fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: colors.ink,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {formatMoney(item.spent)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
