import React, { useState } from 'react';
import {
  Home, Receipt, BarChart3, Users, Sun, Moon,
  ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, ChevronLeft, Check,
} from 'lucide-react';

const LIGHT = {
  canvas: '#FAFAFA', surface: '#FFFFFF', border: '#E4E4E7',
  ink: '#18181B', inkMuted: '#71717A', accent: '#3F3F9E',
  positive: '#15803D', negative: '#B91C1C',
};
const DARK = {
  canvas: '#09090B', surface: '#18181B', border: '#27272A',
  ink: '#FAFAFA', inkMuted: '#A1A1AA', accent: '#6D6DC7',
  positive: '#4ADE80', negative: '#F87171',
};
const categoryColors = { 'Food & Drink': '#B4694A', Home: '#6B7A99', Transportation: '#5C8C82', Utilities: '#9C9166', Life: '#A5738A' };
const NAV_ITEMS = [
  { label: 'Dashboard', Icon: Home }, { label: 'Expenses', Icon: Receipt },
  { label: 'Analysis', Icon: BarChart3, active: true }, { label: 'Groups', Icon: Users },
];

const julyCategories = [
  { name: 'Food & Drink', amount: 780.40, txns: [{ merchant: "Trader Joe's", amount: -42.10 }, { merchant: 'Starbucks', amount: -6.75 }] },
  { name: 'Home', amount: 540.00, txns: [{ merchant: 'Amazon', amount: -18.42 }] },
  { name: 'Transportation', amount: 410.00, txns: [{ merchant: 'Shell', amount: -21.30 }] },
  { name: 'Utilities', amount: 286.00, txns: [{ merchant: 'Con Edison', amount: -84.20 }] },
  { name: 'Life', amount: 173.70, txns: [{ merchant: 'Walgreens', amount: -22.50 }] },
];
const julyTotal = julyCategories.reduce((s, c) => s + c.amount, 0);
const monthsData = [
  { key: '2026-02', short: 'Feb', total: 1796.73 }, { key: '2026-03', short: 'Mar', total: 1934.94 },
  { key: '2026-04', short: 'Apr', total: 1585.35 }, { key: '2026-05', short: 'May', total: 2065.02 },
  { key: '2026-06', short: 'Jun', total: 1791.04 }, { key: '2026-07', short: 'Jul', total: julyTotal },
];
const JAN_TOTAL = 1900.00;
const YTD_TOTAL = JAN_TOTAL + monthsData.reduce((s, m) => s + m.total, 0);
const LENSES = ['My Expenses', 'I Paid'];
const LENS_JULY_TOTALS = { 'My Expenses': julyTotal, 'I Paid': 1992.10 };
function lensRatio(i) { return LENS_JULY_TOTALS[LENSES[i]] / julyTotal; }
const insights = [
  { id: 'i1', headline: 'Dining is up 32% vs last month', trend: [3, 4, 4, 5, 6, 9], action: 'Ask why' },
  { id: 'i2', headline: 'New merchant: Sephora — $94', sub: 'First time here this month', trend: null, action: 'Categorize' },
  { id: 'i3', headline: 'Eggs cost 18% more than usual', trend: [2, 2, 3, 3, 4], action: 'See why' },
];

const itemsData = {
  eggs: { name: 'Eggs, dozen', total: 28.69, count: 7, avg: 4.10 },
  bananas: { name: 'Bananas', total: 20.15, count: 6, avg: 1.90 },
  oatmilk: { name: 'Oat Milk', total: 27.30, count: 6, avg: 4.55 },
};
const merchantsData = {
  traderjoes: { name: "Trader Joe's", visits: 14, lifetimeSpent: 612.40 },
  wholefoods: { name: 'Whole Foods', visits: 6, lifetimeSpent: 284.90 },
  starbucks: { name: 'Starbucks', visits: 22, lifetimeSpent: 148.75 },
};

function formatMoney(n) { return `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`; }

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
function SubTabBar({ c, tab, onChange }) {
  const tabs = ['Overview', 'Items', 'Merchants'];
  const idx = tabs.findIndex((t) => t.toLowerCase() === tab);
  return (
    <div className="relative flex" style={{ width: 300, backgroundColor: c.border, borderRadius: 10, padding: 3, height: 34 }}>
      <div className="absolute transition-transform duration-300 ease-out" style={{ top: 3, bottom: 3, left: 3, width: `calc(${100 / 3}% - 2px)`, backgroundColor: c.surface, borderRadius: 8, transform: `translateX(${idx * 100}%)`, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }} />
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t.toLowerCase())} className="relative flex-1 z-10" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: t.toLowerCase() === tab ? c.ink : c.inkMuted }}>{t}</button>
      ))}
    </div>
  );
}
function LensSwitch({ c, index, onChange }) {
  return (
    <div className="relative flex" style={{ width: 200, backgroundColor: c.border, borderRadius: 999, padding: 3, height: 30 }}>
      <div className="absolute transition-transform duration-300 ease-out" style={{ top: 3, bottom: 3, left: 3, width: 'calc(50% - 3px)', backgroundColor: c.surface, borderRadius: 999, transform: `translateX(${index * 100}%)`, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }} />
      {LENSES.map((l, i) => (
        <button key={l} onClick={() => onChange(i)} className="relative flex-1 z-10" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: index === i ? c.ink : c.inkMuted }}>{l}</button>
      ))}
    </div>
  );
}

function OverviewTab({ c, lensIndex, setLensIndex }) {
  const ratio = lensRatio(lensIndex);
  const currentCategories = julyCategories.map((cat) => ({ ...cat, amount: +(cat.amount * ratio).toFixed(2) }));
  const total = currentCategories.reduce((s, cat) => s + cat.amount, 0);
  const ytd = YTD_TOTAL * ratio;
  const displayedMonths = monthsData.map((m) => ({ ...m, total: m.total * ratio }));
  const deltaPct = ((displayedMonths[5].total - displayedMonths[0].total) / displayedMonths[0].total) * 100;
  const isUp = deltaPct >= 0;
  const max = Math.max(...displayedMonths.map((m) => m.total));
  const [expandedCat, setExpandedCat] = useState(null);

  return (
    <div className="grid grid-cols-2 gap-8">
      <div>
        <div className="flex items-center justify-between mb-4">
          <LensSwitch c={c} index={lensIndex} onChange={setLensIndex} />
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: c.inkMuted, textAlign: 'right' }}>2026 YTD</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 600, color: c.ink, textAlign: 'right' }}>{formatMoney(ytd)}</div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: c.inkMuted }}>SPEND OVER TIME</span>
          <span className="flex items-center gap-1" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: isUp ? c.negative : c.positive }}>
            {isUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(deltaPct).toFixed(0)}% since Feb
          </span>
        </div>
        <div className="flex items-end gap-2 mb-6" style={{ height: 90 }}>
          {displayedMonths.map((m) => (
            <div key={m.key} className="flex-1 flex flex-col items-center justify-end" style={{ height: '100%' }}>
              <div style={{ width: '100%', maxWidth: 32, height: Math.max(6, (m.total / max) * 64), borderRadius: 4, backgroundColor: m.key === '2026-07' ? c.accent : c.border }} />
              <span style={{ marginTop: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, color: m.key === '2026-07' ? c.ink : c.inkMuted, fontWeight: m.key === '2026-07' ? 600 : 400 }}>{m.short}</span>
            </div>
          ))}
        </div>

        <div className="flex items-baseline justify-between mb-3">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: c.inkMuted }}>CATEGORY BREAKDOWN</span>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 20, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total)}</span>
        </div>
        <div className="flex w-full mb-3" style={{ height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: c.border }}>
          {currentCategories.map((cat) => <div key={cat.name} style={{ width: `${(cat.amount / total) * 100}%`, backgroundColor: categoryColors[cat.name] }} />)}
        </div>
        {currentCategories.map((cat) => {
          const pct = Math.round((cat.amount / total) * 100);
          const expanded = expandedCat === cat.name;
          return (
            <div key={cat.name} style={{ borderBottom: `1px solid ${c.border}` }}>
              <button onClick={() => setExpandedCat(expanded ? null : cat.name)} className="w-full flex items-center gap-2 py-2">
                <div className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, backgroundColor: categoryColors[cat.name] }} />
                <span className="flex-1 text-left" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: c.ink }}>{cat.name}</span>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(cat.amount)}</span>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted, width: 32, textAlign: 'right' }}>{pct}%</span>
                {expanded ? <ChevronUp size={14} style={{ color: c.inkMuted }} /> : <ChevronDown size={14} style={{ color: c.inkMuted }} />}
              </button>
              {expanded && (
                <div className="pl-4 pb-2 flex flex-col gap-1">
                  {cat.txns.map((t, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>{t.merchant}</span>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(t.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: c.inkMuted, marginBottom: 10 }}>WHAT CHANGED</div>
        <div className="flex flex-col gap-3">
          {insights.map((item) => (
            <div key={item.id} style={{ backgroundColor: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
              <div className="flex items-start gap-1 mb-1">
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: c.ink }}>{item.headline}</span>
                {item.trend && <ArrowUpRight size={14} style={{ color: c.negative, flexShrink: 0, marginTop: 2 }} />}
              </div>
              {item.sub && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted, marginBottom: 8 }}>{item.sub}</div>}
              <button style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: c.accent }}>{item.action} →</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ItemsTab({ c, selectedId, setSelectedId }) {
  const rows = Object.entries(itemsData).map(([id, d]) => ({ id, ...d })).sort((a, b) => b.total - a.total);
  const selected = selectedId ? itemsData[selectedId] : null;
  if (selected) {
    return (
      <div>
        <button onClick={() => setSelectedId(null)} className="flex items-center gap-1 mb-4" style={{ color: c.ink }}>
          <ChevronLeft size={18} /><span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Items</span>
        </button>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 600, color: c.ink, marginBottom: 16 }}>{selected.name}</div>
        <div className="flex gap-6">
          <div><div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: c.inkMuted, textTransform: 'uppercase' }}>Avg</div><div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: c.ink }}>{formatMoney(selected.avg)}</div></div>
          <div><div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: c.inkMuted, textTransform: 'uppercase' }}>Purchases</div><div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: c.ink }}>{selected.count}</div></div>
          <div><div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: c.inkMuted, textTransform: 'uppercase' }}>Total</div><div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: c.ink }}>{formatMoney(selected.total)}</div></div>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-4">
      {rows.map((row) => (
        <button key={row.id} onClick={() => setSelectedId(row.id)} className="text-left" style={{ backgroundColor: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: c.ink, marginBottom: 4 }}>{row.name}</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 600, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(row.total)}</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: c.inkMuted, marginTop: 2 }}>{row.count} purchases · avg {formatMoney(row.avg)}</div>
        </button>
      ))}
    </div>
  );
}

function MerchantsTab({ c, selectedId, setSelectedId }) {
  const rows = Object.entries(merchantsData).map(([id, m]) => ({ id, ...m })).sort((a, b) => b.lifetimeSpent - a.lifetimeSpent);
  const selected = selectedId ? merchantsData[selectedId] : null;
  if (selected) {
    return (
      <div>
        <button onClick={() => setSelectedId(null)} className="flex items-center gap-1 mb-4" style={{ color: c.ink }}>
          <ChevronLeft size={18} /><span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Merchants</span>
        </button>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 600, color: c.ink, marginBottom: 16 }}>{selected.name}</div>
        <div className="flex gap-6">
          <div><div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: c.inkMuted, textTransform: 'uppercase' }}>Lifetime</div><div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: c.ink }}>{formatMoney(selected.lifetimeSpent)}</div></div>
          <div><div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: c.inkMuted, textTransform: 'uppercase' }}>Visits</div><div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: c.ink }}>{selected.visits}</div></div>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-4">
      {rows.map((row) => (
        <button key={row.id} onClick={() => setSelectedId(row.id)} className="text-left" style={{ backgroundColor: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: c.ink, marginBottom: 4 }}>{row.name}</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 600, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(row.lifetimeSpent)}</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: c.inkMuted, marginTop: 2 }}>{row.visits} visits</div>
        </button>
      ))}
    </div>
  );
}

export default function DesktopAnalysis() {
  const [dark, setDark] = useState(false);
  const c = dark ? DARK : LIGHT;
  const [subTab, setSubTab] = useState('overview');
  const [lensIndex, setLensIndex] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedMerchantId, setSelectedMerchantId] = useState(null);

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
            <div className="flex items-center justify-between mb-5">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: c.ink }}>Analysis</span>
              <SubTabBar c={c} tab={subTab} onChange={setSubTab} />
            </div>

            {subTab === 'overview' && <OverviewTab c={c} lensIndex={lensIndex} setLensIndex={setLensIndex} />}
            {subTab === 'items' && <ItemsTab c={c} selectedId={selectedItemId} setSelectedId={setSelectedItemId} />}
            {subTab === 'merchants' && <MerchantsTab c={c} selectedId={selectedMerchantId} setSelectedId={setSelectedMerchantId} />}
          </div>
        </div>

        <Footer c={c} />
      </div>
    </div>
  );
}
