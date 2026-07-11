import React, { useState } from 'react';
import {
  Home, Receipt, BarChart3, Users, Sun, Moon,
  Check, ChevronRight, TrendingUp, ChevronDown, ChevronUp,
} from 'lucide-react';

const LIGHT = {
  canvas: '#FAFAFA', surface: '#FFFFFF', border: '#E4E4E7',
  ink: '#18181B', inkMuted: '#71717A', accent: '#3F3F9E',
  positive: '#15803D', negative: '#B91C1C', caution: '#B45309',
};
const DARK = {
  canvas: '#09090B', surface: '#18181B', border: '#27272A',
  ink: '#FAFAFA', inkMuted: '#A1A1AA', accent: '#6D6DC7',
  positive: '#4ADE80', negative: '#F87171', caution: '#FBBF24',
};

const categoryColors = { 'Food & Drink': '#B4694A', Home: '#6B7A99', Transportation: '#5C8C82', Utilities: '#9C9166', Life: '#A5738A' };
const personalTotal = 1842.10;
const initialGroups = [
  { id: 'g1', name: 'Weekend Trip', total: 312.00, yourShare: 78.00, youPaid: 150.00, settled: false, members: 4 },
  { id: 'g2', name: 'Roommates', total: 540.00, yourShare: 270.00, youPaid: 0, settled: true, members: 2 },
];
const categories = [
  { name: 'Food & Drink', amount: 780.40 }, { name: 'Home', amount: 540.00 },
  { name: 'Transportation', amount: 410.00 }, { name: 'Utilities', amount: 286.00 }, { name: 'Life', amount: 173.70 },
];
const recentFeed = [
  { id: 'r1', label: 'TODAY', merchant: "Trader Joe's", meta: 'Groceries', amount: -42.10 },
  { id: 'r2', label: 'TODAY', merchant: 'Shell', meta: 'Gas/fuel', amount: -21.30 },
  { id: 'r3', label: 'YESTERDAY', merchant: 'Weekend Trip dinner', meta: 'Split 4 · your share', amount: -29.50 },
];
const NAV_ITEMS = [
  { label: 'Dashboard', Icon: Home, active: true }, { label: 'Expenses', Icon: Receipt },
  { label: 'Analysis', Icon: BarChart3 }, { label: 'Groups', Icon: Users },
];
const LENSES = ['My Expenses', 'I Paid'];

function formatMoney(n) { return `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`; }
function computeLensTotal(i, groups) {
  if (i === 0) return personalTotal + groups.reduce((s, g) => s + g.yourShare, 0);
  return personalTotal + groups.reduce((s, g) => s + g.youPaid, 0);
}

function ThemeAndProfile({ c, dark, onToggle }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onToggle} style={{ width: 32, height: 32, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.inkMuted, border: `1px solid ${c.border}` }}>
        {dark ? <Sun size={15} /> : <Moon size={15} />}
      </button>
      <div style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: c.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600 }}>T</div>
    </div>
  );
}

function Sidebar({ c }) {
  return (
    <div className="flex flex-col flex-shrink-0" style={{ width: 220, backgroundColor: c.surface, borderRight: `1px solid ${c.border}` }}>
      <div className="flex-1 py-3 px-3">
        {NAV_ITEMS.map(({ label, Icon, active }) => (
          <div key={label} className="flex items-center gap-3 mb-1" style={{ padding: '9px 12px', borderRadius: 8, cursor: 'pointer', backgroundColor: active ? `${c.accent}14` : 'transparent' }}>
            <Icon size={18} style={{ color: active ? c.accent : c.inkMuted }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: active ? 600 : 500, color: active ? c.accent : c.ink }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Footer({ c }) {
  return (
    <div className="flex items-center justify-between px-6 flex-shrink-0" style={{ height: 44, borderTop: `1px solid ${c.border}`, backgroundColor: c.surface }}>
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>Privacy · Terms · Help · Submit an idea</span>
      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>© 2026 TrackSpense</span>
    </div>
  );
}

function LensSwitch({ c, index, onChange }) {
  return (
    <div className="relative flex" style={{ width: 220, backgroundColor: c.border, borderRadius: 999, padding: 3, height: 34 }}>
      <div className="absolute transition-transform duration-300 ease-out" style={{ top: 3, bottom: 3, left: 3, width: 'calc(50% - 3px)', backgroundColor: c.surface, borderRadius: 999, transform: `translateX(${index * 100}%)`, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }} />
      {LENSES.map((l, i) => (
        <button key={l} onClick={() => onChange(i)} className="relative flex-1 z-10" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: index === i ? c.ink : c.inkMuted }}>{l}</button>
      ))}
    </div>
  );
}

function InsightOfTheDay({ c }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button onClick={() => setExpanded((e) => !e)} className="w-full text-left" style={{ backgroundColor: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div className="flex items-start gap-2">
        <TrendingUp size={15} style={{ color: c.accent, flexShrink: 0, marginTop: 1 }} />
        <div className="flex-1 min-w-0">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: c.ink }}>Dining is up 32% vs last month</span>
          {expanded && (
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
              Mostly three nights out over the July 4th weekend — about $95 of the $110 increase. Everyday coffee and lunch spend stayed flat.
            </div>
          )}
        </div>
        {expanded ? <ChevronUp size={14} style={{ color: c.inkMuted }} /> : <ChevronDown size={14} style={{ color: c.inkMuted }} />}
      </div>
    </button>
  );
}

export default function DesktopDashboard() {
  const [dark, setDark] = useState(false);
  const c = dark ? DARK : LIGHT;
  const [lens, setLens] = useState(0);
  const [groups] = useState(initialGroups);

  const total = computeLensTotal(lens, groups);
  const allSettled = groups.every((g) => g.settled);
  const pendingCount = groups.filter((g) => !g.settled).length;
  const catTotal = categories.reduce((s, cat) => s + cat.amount, 0);

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#E4E4E7' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col overflow-hidden rounded-2xl shadow-2xl" style={{ maxWidth: 1120, height: 700, backgroundColor: c.canvas }}>

        <div className="flex items-center justify-between px-6 flex-shrink-0" style={{ height: 58, borderBottom: `1px solid ${c.border}`, backgroundColor: c.surface }}>
          <div className="flex items-center gap-2">
            <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: c.accent }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: c.ink }}>TrackSpense</span>
          </div>
          <ThemeAndProfile c={c} dark={dark} onToggle={() => setDark((d) => !d)} />
        </div>

        <div className="flex flex-1" style={{ minHeight: 0 }}>
          <Sidebar c={c} />

          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: c.inkMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
              July 2026
            </div>

            <div className="flex items-start justify-between mb-6">
              <div>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 44, color: c.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {formatMoney(total)}
                </span>
                <div className="flex items-center gap-1 mt-2">
                  {allSettled ? (
                    <>
                      <Check size={14} style={{ color: c.positive }} />
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: c.positive }}>RECONCILED</span>
                    </>
                  ) : (
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>{pendingCount} group{pendingCount > 1 ? 's' : ''} still settling</span>
                  )}
                </div>
              </div>
              <LensSwitch c={c} index={lens} onChange={setLens} />
            </div>

            <div className="mb-6" style={{ maxWidth: 420 }}>
              <InsightOfTheDay c={c} />
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: c.inkMuted }}>WHERE IT WENT</span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(catTotal)}</span>
                </div>
                <div className="flex w-full mb-3" style={{ height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: c.border }}>
                  {categories.map((cat) => <div key={cat.name} style={{ width: `${(cat.amount / catTotal) * 100}%`, backgroundColor: categoryColors[cat.name] }} />)}
                </div>
                <div className="flex flex-col gap-2">
                  {categories.map((cat) => (
                    <div key={cat.name} className="flex items-center gap-2">
                      <div className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, backgroundColor: categoryColors[cat.name] }} />
                      <span className="flex-1 truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: c.ink }}>{cat.name}</span>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(cat.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: c.inkMuted }}>MY GROUPS</span>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>{groups.length} active</span>
                </div>
                <div className="flex flex-col gap-2">
                  {groups.map((g) => (
                    <div key={g.id} style={{ backgroundColor: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 12 }}>
                      <div className="flex items-center justify-between">
                        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: c.ink }}>{g.name}</span>
                        {g.settled ? (
                          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: c.positive }}>Settled</span>
                        ) : (
                          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: c.caution }}>{formatMoney(g.total - g.youPaid)} pending</span>
                        )}
                      </div>
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted, marginTop: 2 }}>{g.members} people · {formatMoney(g.total)} total</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: c.inkMuted }}>RECENT</span>
                <span className="flex items-center gap-1" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>See all <ChevronRight size={14} /></span>
              </div>
              <div style={{ backgroundColor: c.surface, borderRadius: 10, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
                {recentFeed.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: i < recentFeed.length - 1 ? `1px solid ${c.border}` : 'none' }}>
                    <div className="flex-1 min-w-0">
                      <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: c.ink }}>{r.merchant}</div>
                      <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>{r.label} · {r.meta}</div>
                    </div>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <Footer c={c} />
      </div>
    </div>
  );
}
