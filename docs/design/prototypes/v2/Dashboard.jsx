import React, { useState } from 'react';
import { Check, ChevronRight, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

const colors = {
  canvas: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#E4E4E7',
  ink: '#18181B',
  inkMuted: '#71717A',
  accent: '#3F3F9E',
  positive: '#15803D',
  negative: '#B91C1C',
  caution: '#B45309',
};

const categoryColors = {
  'Food & Drink': '#B4694A',
  Home: '#6B7A99',
  Transportation: '#5C8C82',
  Utilities: '#9C9166',
  Life: '#A5738A',
};

const personalTotal = 1842.10;

const initialGroups = [
  { id: 'g1', name: 'Weekend Trip', total: 312.00, yourShare: 78.00, youPaid: 150.00, settled: false, members: 4 },
  { id: 'g2', name: 'Roommates', total: 540.00, yourShare: 270.00, youPaid: 0, settled: true, members: 2 },
];

// Sums to exactly the "My Expenses" total (personalTotal + sum of yourShare = 2190.10).
const categories = [
  { name: 'Food & Drink', amount: 780.40 },
  { name: 'Home', amount: 540.00 },
  { name: 'Transportation', amount: 410.00 },
  { name: 'Utilities', amount: 286.00 },
  { name: 'Life', amount: 173.70 },
];

const recentFeed = [
  { id: 'r1', label: 'TODAY', merchant: "Trader Joe's", meta: 'Groceries', amount: -42.10 },
  { id: 'r2', label: 'TODAY', merchant: 'Shell', meta: 'Gas/fuel', amount: -21.30 },
  { id: 'r3', label: 'YESTERDAY', merchant: 'Weekend Trip dinner', meta: 'Split 4 · your share', amount: -29.50 },
];

// Only two lenses now — Group Total dropped (see redesign proposal §2): it mixed other
// people's money into a personal spend figure and didn't correspond to anything real once
// more than one group was involved.
const LENSES = ['My Expenses', 'I Paid'];

function formatMoney(n) {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function computeLensTotal(lensIndex, groups) {
  if (lensIndex === 0) return personalTotal + groups.reduce((s, g) => s + g.yourShare, 0);
  return personalTotal + groups.reduce((s, g) => s + g.youPaid, 0);
}

function LensSwitch({ index, onChange }) {
  return (
    <div className="relative flex w-full" style={{ backgroundColor: colors.border, borderRadius: 999, padding: 3, height: 34 }}>
      <div
        className="absolute transition-transform duration-300 ease-out"
        style={{
          top: 3, bottom: 3, left: 3,
          width: 'calc(50% - 3px)',
          backgroundColor: colors.surface,
          borderRadius: 999,
          transform: `translateX(${index * 100}%)`,
          boxShadow: '0 1px 2px rgba(24,24,27,0.10)',
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

function InsightOfTheDay() {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      onClick={() => setExpanded((e) => !e)}
      className="w-full text-left"
      style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '12px 14px' }}
    >
      <div className="flex items-start gap-2">
        <TrendingUp size={15} style={{ color: colors.accent, flexShrink: 0, marginTop: 1 }} />
        <div className="flex-1 min-w-0">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.ink }}>
            Dining is up 32% vs last month
          </span>
          {expanded && (
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
              Mostly three nights out over the July 4th weekend — about $95 of the $110 increase.
              Everyday coffee and lunch spend stayed flat.
            </div>
          )}
        </div>
        {expanded ? <ChevronUp size={14} style={{ color: colors.inkMuted, flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: colors.inkMuted, flexShrink: 0 }} />}
      </div>
    </button>
  );
}

export default function Dashboard() {
  const [lens, setLens] = useState(0);
  const [groups, setGroups] = useState(initialGroups);

  const total = computeLensTotal(lens, groups);
  const allSettled = groups.every((g) => g.settled);
  const pendingCount = groups.filter((g) => !g.settled).length;
  const catTotal = categories.reduce((s, c) => s + c.amount, 0);

  function toggleDemoSettle() {
    setGroups((prev) => prev.map((g) => (g.id === 'g1' ? { ...g, settled: !g.settled } : g)));
  }

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#E4E4E7' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 800, backgroundColor: colors.canvas }}>
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
              July 2026
            </div>
          </div>

          <div className="flex flex-col items-center px-5 pb-4">
            <span
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
                fontSize: 46,
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
                  <Check size={14} style={{ color: colors.positive }} />
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: colors.positive, letterSpacing: '0.03em' }}>
                    RECONCILED
                  </span>
                </>
              ) : (
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>
                  {pendingCount} group{pendingCount > 1 ? 's' : ''} still settling
                </span>
              )}
            </div>

            <div className="w-full mt-4">
              <LensSwitch index={lens} onChange={setLens} />
            </div>
          </div>

          <div className="px-5 pb-4">
            <InsightOfTheDay />
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
            <div className="flex w-full mb-3" style={{ height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.border }}>
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
                  style={{ width: 160, backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12 }}
                >
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: colors.ink, marginBottom: 2 }}>
                    {g.name}
                  </div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, marginBottom: 8 }}>
                    {g.members} people · {formatMoney(g.total)} total
                  </div>
                  <div className="flex items-center gap-1">
                    {g.settled ? (
                      <>
                        <Check size={13} style={{ color: colors.positive }} />
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: colors.positive }}>Settled</span>
                      </>
                    ) : (
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: colors.caution }}>
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
            <div style={{ backgroundColor: colors.surface, borderRadius: 10, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
              {recentFeed.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-3 py-3"
                  style={{ borderBottom: i < recentFeed.length - 1 ? `1px solid ${colors.border}` : 'none' }}
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

        <div className="px-5 py-3" style={{ borderTop: `1px solid ${colors.border}` }}>
          <button
            onClick={toggleDemoSettle}
            className="w-full"
            style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, textAlign: 'center' }}
          >
            Demo only — tap to {groups.find((g) => g.id === 'g1').settled ? 'reopen' : 'settle'} Weekend Trip
          </button>
        </div>
      </div>
    </div>
  );
}
