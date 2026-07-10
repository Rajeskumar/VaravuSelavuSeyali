import React, { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';

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

const categoryColors = {
  'Food & Drink': '#C97B4D',
  Home: '#7E8CA3',
  Transportation: '#5E9C8F',
  Utilities: '#A3A86B',
  Life: '#C77B9E',
};

const personalTotal = 1842.10;

const initialGroups = [
  { id: 'g1', name: 'Weekend Trip', total: 312.00, yourShare: 78.00, youPaid: 150.00, settled: false, members: 4 },
  { id: 'g2', name: 'Roommates', total: 540.00, yourShare: 270.00, youPaid: 0, settled: true, members: 2 },
];

const categories = [
  { name: 'Food & Drink', amount: 1080.40 },
  { name: 'Home', amount: 540.00 },
  { name: 'Transportation', amount: 410.00 },
  { name: 'Utilities', amount: 286.00 },
  { name: 'Life', amount: 189.70 },
];

const recentFeed = [
  { id: 'r1', label: 'TODAY', merchant: "Trader Joe's", meta: 'Groceries', amount: -42.10 },
  { id: 'r2', label: 'TODAY', merchant: 'Shell', meta: 'Gas/fuel', amount: -21.30 },
  { id: 'r3', label: 'YESTERDAY', merchant: 'Weekend Trip dinner', meta: 'Split 4 · your share', amount: -29.50 },
];

const LENSES = ['My Share', 'I Paid', 'Group Total'];

function formatMoney(n) {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function computeLensTotal(lensIndex, groups) {
  if (lensIndex === 0) return personalTotal + groups.reduce((s, g) => s + g.yourShare, 0);
  if (lensIndex === 1) return personalTotal + groups.reduce((s, g) => s + g.youPaid, 0);
  return personalTotal + groups.reduce((s, g) => s + g.total, 0);
}

function LensSwitch({ index, onChange }) {
  return (
    <div className="relative flex w-full" style={{ backgroundColor: '#ECECE7', borderRadius: 999, padding: 4, height: 40 }}>
      <div
        className="absolute transition-transform duration-300 ease-out"
        style={{
          top: 4,
          bottom: 4,
          left: 4,
          width: `calc(${100 / 3}% - ${8 / 3}px)`,
          backgroundColor: colors.surface,
          borderRadius: 999,
          transform: `translateX(${index * 100}%)`,
          boxShadow: '0 1px 2px rgba(25,26,30,0.08)',
        }}
      />
      {LENSES.map((l, i) => (
        <button
          key={l}
          onClick={() => onChange(i)}
          className="relative flex-1 z-10"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: index === i ? colors.ink : colors.inkMuted,
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [lens, setLens] = useState(0);
  const [groups, setGroups] = useState(initialGroups);

  const total = computeLensTotal(lens, groups);
  const allSettled = groups.every((g) => g.settled);
  const pendingCount = groups.filter((g) => !g.settled).length;
  const catTotal = categories.reduce((s, c) => s + c.amount, 0);
  const weekendTrip = groups.find((g) => g.id === 'g1');

  function toggleDemoSettle() {
    setGroups((prev) => prev.map((g) => (g.id === 'g1' ? { ...g, settled: !g.settled } : g)));
  }

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#DADAD5' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 780, backgroundColor: colors.paper }}>
        <div className="overflow-y-auto flex-1">
          <div className="px-5 pt-6 pb-2">
            <div
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: colors.inkMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              July 2026 · everything
            </div>
          </div>

          <div className="flex flex-col items-center px-5 pb-5">
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
                fontSize: 48,
                color: colors.ink,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
              }}
            >
              {formatMoney(total)}
            </span>

            <div className="flex items-center gap-1 mt-3" style={{ height: 20 }}>
              {allSettled ? (
                <>
                  <Check size={14} style={{ color: colors.gold }} />
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: colors.gold, letterSpacing: '0.03em' }}>
                    RECONCILED
                  </span>
                </>
              ) : (
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>
                  {pendingCount} group{pendingCount > 1 ? 's' : ''} still settling
                </span>
              )}
            </div>

            <div className="w-full mt-5">
              <LensSwitch index={lens} onChange={setLens} />
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>
                WHERE IT WENT
              </span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(catTotal)}
              </span>
            </div>
            <div className="flex w-full mb-3" style={{ height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.hairline }}>
              {categories.map((c) => (
                <div key={c.name} style={{ width: `${(c.amount / catTotal) * 100}%`, backgroundColor: categoryColors[c.name] }} />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              {categories.map((c) => (
                <div key={c.name} className="flex items-center gap-2">
                  <div className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, backgroundColor: categoryColors[c.name] }} />
                  <span className="flex-1 truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.ink }}>
                    {c.name}
                  </span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(c.amount)}
                  </span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, width: 34, textAlign: 'right' }}>
                    {Math.round((c.amount / catTotal) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>
                MY GROUPS
              </span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>{groups.length} active</span>
            </div>
            <div className="flex gap-3 overflow-x-auto">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="flex-shrink-0"
                  style={{ width: 160, backgroundColor: colors.surface, border: `1px solid ${colors.hairline}`, borderRadius: 10, padding: 12 }}
                >
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: colors.ink, marginBottom: 2 }}>
                    {g.name}
                  </div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, marginBottom: 8 }}>
                    {g.members} people
                  </div>
                  <div className="flex items-center gap-1">
                    {g.settled ? (
                      <>
                        <Check size={13} style={{ color: colors.jadeText }} />
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: colors.jadeText }}>Settled</span>
                      </>
                    ) : (
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: colors.ember }}>
                        {formatMoney(g.total - g.youPaid)} pending
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 pb-6">
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>
                RECENT
              </span>
              <span className="flex items-center gap-1" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>
                See all <ChevronRight size={14} />
              </span>
            </div>
            <div style={{ backgroundColor: colors.surface, borderRadius: 10, border: `1px solid ${colors.hairline}`, overflow: 'hidden' }}>
              {recentFeed.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-3 py-3"
                  style={{ borderBottom: i < recentFeed.length - 1 ? `1px solid ${colors.hairline}` : 'none' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: colors.ink }}>
                      {r.merchant}
                    </div>
                    <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>
                      {r.label} · {r.meta}
                    </div>
                  </div>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(r.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-3" style={{ borderTop: `1px solid ${colors.hairline}` }}>
          <button
            onClick={toggleDemoSettle}
            className="w-full"
            style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, textAlign: 'center' }}
          >
            Demo only — tap to {weekendTrip.settled ? 'reopen' : 'settle'} Weekend Trip
          </button>
        </div>
      </div>
    </div>
  );
}
