import React, { useState, useEffect } from 'react';
import {
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, Send, ArrowUpRight, ArrowDownRight, Check,
} from 'lucide-react';

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
  Entertainment: '#8E7AA3',
};

function formatMoney(n) {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/* ---------- Overview data (My Expenses basis, matches Dashboard exactly for July) ---------- */

const julyCategories = [
  { name: 'Food & Drink', amount: 780.40, txns: [
    { merchant: "Trader Joe's", amount: -42.10 },
    { merchant: 'Starbucks', amount: -6.75 },
  ]},
  { name: 'Home', amount: 540.00, txns: [{ merchant: 'Amazon', amount: -18.42 }] },
  { name: 'Transportation', amount: 410.00, txns: [
    { merchant: 'Shell', amount: -21.30 },
    { merchant: 'Uber', amount: -14.30 },
  ]},
  { name: 'Utilities', amount: 286.00, txns: [{ merchant: 'Con Edison', amount: -84.20 }] },
  { name: 'Life', amount: 173.70, txns: [{ merchant: 'Walgreens', amount: -22.50 }] },
];
const julyTotal = julyCategories.reduce((s, c) => s + c.amount, 0); // 2190.10 — matches Dashboard's "My Expenses"

const monthsData = [
  { key: '2026-02', short: 'Feb', total: 1796.73 },
  { key: '2026-03', short: 'Mar', total: 1934.94 },
  { key: '2026-04', short: 'Apr', total: 1585.35 },
  { key: '2026-05', short: 'May', total: 2065.02 },
  { key: '2026-06', short: 'Jun', total: 1791.04 },
  { key: '2026-07', short: 'Jul', total: julyTotal },
];
const JAN_TOTAL = 1900.00; // included in YTD sum but not shown as a 7th bar — keeps the trend chart unchanged
const YTD_TOTAL = JAN_TOTAL + monthsData.reduce((s, m) => s + m.total, 0);

function deriveCategories(monthTotal) {
  const ratio = monthTotal / julyTotal;
  return julyCategories.map((c) => ({
    ...c,
    amount: +(c.amount * ratio).toFixed(2),
    txns: c.txns.map((t) => ({ ...t, amount: +(t.amount * ratio).toFixed(2) })),
  }));
}
const categoriesByMonth = Object.fromEntries(
  monthsData.map((m) => [m.key, m.key === '2026-07' ? julyCategories : deriveCategories(m.total)])
);
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// Two lenses only — Group Total dropped.
const LENSES = ['My Expenses', 'I Paid'];
const LENS_JULY_TOTALS = { 'My Expenses': julyTotal, 'I Paid': 1992.10 };
function lensRatio(lensIndex) {
  return LENS_JULY_TOTALS[LENSES[lensIndex]] / julyTotal;
}

const insights = [
  {
    id: 'i1', headline: 'Dining is up 32% vs last month', trend: [3, 4, 4, 5, 6, 9],
    action: 'Ask why', question: 'Why is my dining spend up 32% this month?',
    answer: "Dining jumped mostly from three nights out over the July 4th weekend — about $95 of the $110 increase. Everyday coffee and lunch spend stayed flat.",
  },
  {
    id: 'i2', headline: 'New merchant: Sephora — $94', sub: 'First time here this month', trend: null,
    action: 'Ask about it', question: 'Tell me about the Sephora purchase — what was it for?',
    answer: "It's a one-off — your first purchase at Sephora this year, filed under Life · Other. Want me to move it to a different category?",
  },
  {
    id: 'i3', headline: 'Eggs cost 18% more than usual', trend: [2, 2, 3, 3, 4],
    action: 'See why', question: 'Why did egg prices go up 18%?',
    answer: "Egg prices at Trader Joe's rose from $3.80 to $4.49 a dozen since your last trip — a broader grocery trend, not specific to one store.",
  },
];

/* ---------- Items data ---------- */

const MONTH_LABELS = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
const STORE_PAIR = ["Trader Joe's", 'Whole Foods'];
const PATTERN_UP = [-0.08, -0.04, -0.01, 0.02, 0.05, 0.09];
const PATTERN_DOWN = [0.06, 0.03, 0.01, -0.02, -0.04, -0.05];
function genericHistory(avg, p = 0) {
  const pattern = p % 2 === 0 ? PATTERN_UP : PATTERN_DOWN;
  return pattern.map((v, i) => ({ date: `${MONTH_LABELS[i]} 2026`, store: STORE_PAIR[i % 2], price: +(avg * (1 + v)).toFixed(2) }));
}
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
  eggs: { name: 'Eggs, dozen', history: EGGS_HISTORY, cat: 'Food & Drink' },
  bananas: { name: 'Bananas', history: genericHistory(1.95, 0), cat: 'Food & Drink' },
  oatmilk: { name: 'Oat Milk', history: genericHistory(4.85, 1), cat: 'Food & Drink' },
  chicken: { name: 'Chicken Breast', history: genericHistory(9.20, 0), cat: 'Food & Drink' },
  coffee: { name: 'Coffee Beans', history: genericHistory(12.50, 1), cat: 'Food & Drink' },
  papertowels: { name: 'Paper Towels', history: genericHistory(8.75, 0), cat: 'Home' },
};
function statsFor(history) {
  const prices = history.map((h) => h.price);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  return { avg, min: Math.min(...prices), max: Math.max(...prices), total: prices.reduce((a, b) => a + b, 0), count: history.length };
}
function storeStats(history) {
  const map = {};
  history.forEach((h) => { (map[h.store] = map[h.store] || []).push(h.price); });
  return Object.entries(map).map(([store, prices]) => ({ store, avg: prices.reduce((a, b) => a + b, 0) / prices.length, count: prices.length })).sort((a, b) => a.avg - b.avg);
}

/* ---------- Merchants data ---------- */

const merchantsData = {
  traderjoes: { name: "Trader Joe's", category: 'Food & Drink', visits: 14, lifetimeSpent: 612.40, monthly: [78.20, 84.50, 71.00, 92.30, 88.10, 96.40], items: [{ name: 'Eggs, dozen', spent: 20.14, trend: 'up' }, { name: 'Bananas', spent: 21.45, trend: 'flat' }], whatChanged: 'You visited 2 more times than last month.' },
  wholefoods: { name: 'Whole Foods', category: 'Food & Drink', visits: 6, lifetimeSpent: 284.90, monthly: [52.00, 40.00, 38.00, 61.00, 45.60, 48.30], items: [{ name: 'Eggs, dozen', spent: 8.55, trend: 'up' }], whatChanged: 'Your average spend per visit is steady.' },
  starbucks: { name: 'Starbucks', category: 'Food & Drink', visits: 22, lifetimeSpent: 148.75, monthly: [18.20, 22.40, 19.00, 25.10, 27.30, 36.75], items: [], whatChanged: 'Spend here is up 35% vs your 6-month average.' },
  shell: { name: 'Shell', category: 'Transportation', visits: 9, lifetimeSpent: 312.60, monthly: [48.00, 52.30, 45.00, 58.20, 51.00, 58.10], items: [], whatChanged: 'Roughly flat over the last 6 months.' },
};
function trendMeta(trend) {
  if (trend === 'up') return { Icon: ArrowUpRight, color: colors.negative };
  if (trend === 'down') return { Icon: ArrowDownRight, color: colors.positive };
  return { Icon: null, color: colors.inkMuted };
}

/* ---------- Shared small components ---------- */

function MiniSpark({ values, color }) {
  if (!values || !values.length) return null;
  const max = Math.max(...values);
  return (
    <div className="flex items-end gap-0.5" style={{ height: 20 }}>
      {values.map((v, i) => (
        <div key={i} style={{ width: 3, height: Math.max(2, (v / max) * 20), borderRadius: 1, backgroundColor: color || colors.inkMuted, opacity: i === values.length - 1 ? 1 : 0.45 }} />
      ))}
    </div>
  );
}

function SubTabBar({ tab, onChange }) {
  const tabs = ['Overview', 'Items', 'Merchants'];
  const idx = tabs.findIndex((t) => t.toLowerCase() === tab);
  return (
    <div className="relative flex w-full" style={{ backgroundColor: colors.border, borderRadius: 10, padding: 3, height: 34 }}>
      <div
        className="absolute transition-transform duration-300 ease-out"
        style={{ top: 3, bottom: 3, left: 3, width: `calc(${100 / 3}% - 2px)`, backgroundColor: colors.surface, borderRadius: 8, transform: `translateX(${idx * 100}%)`, boxShadow: '0 1px 2px rgba(24,24,27,0.10)' }}
      />
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t.toLowerCase())}
          className="relative flex-1 z-10"
          style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: t.toLowerCase() === tab ? colors.ink : colors.inkMuted }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function BottomSheet({ open, onClose, children }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let t;
    if (open) { setMounted(true); requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true))); }
    else { setVisible(false); t = setTimeout(() => setMounted(false), 300); }
    return () => clearTimeout(t);
  }, [open]);
  if (!mounted) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div onClick={onClose} className="absolute inset-0 transition-opacity duration-300" style={{ backgroundColor: 'rgba(24,24,27,0.45)', opacity: visible ? 1 : 0 }} />
      <div className="relative w-full rounded-t-2xl transition-transform duration-300 ease-out flex flex-col" style={{ maxWidth: 384, backgroundColor: colors.surface, transform: visible ? 'translateY(0)' : 'translateY(100%)', height: 460 }}>
        {children}
      </div>
    </div>
  );
}

function AskSheet({ ask, onClose }) {
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState('');
  const [seededFor, setSeededFor] = useState(null);
  useEffect(() => {
    if (ask && seededFor !== ask.id) {
      setMessages([{ role: 'user', text: ask.question }]);
      setThinking(true);
      setSeededFor(ask.id);
      const t = setTimeout(() => { setThinking(false); setMessages((p) => [...p, { role: 'assistant', text: ask.answer }]); }, 800);
      return () => clearTimeout(t);
    }
  }, [ask, seededFor]);
  function submitFollowUp() {
    if (!draft.trim()) return;
    setMessages((p) => [...p, { role: 'user', text: draft }]);
    setDraft('');
    setThinking(true);
    setTimeout(() => { setThinking(false); setMessages((p) => [...p, { role: 'assistant', text: "I can dig into that further from your data — the trend above holds." }]); }, 800);
  }
  if (!ask) return null;
  return (
    <>
      <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: colors.ink }}>Ask</span>
        <button onClick={onClose} style={{ color: colors.inkMuted }}><X size={20} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {messages.map((m, i) => (
          <div key={i} className="flex" style={{ justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '80%', backgroundColor: m.role === 'user' ? colors.ink : colors.canvas, color: m.role === 'user' ? '#fff' : colors.ink, borderRadius: 12, padding: '8px 12px', fontFamily: "'Inter', sans-serif", fontSize: 14, lineHeight: 1.4 }}>
              {m.text}
            </div>
          </div>
        ))}
        {thinking && <div style={{ backgroundColor: colors.canvas, borderRadius: 12, padding: '8px 12px', fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.inkMuted, alignSelf: 'flex-start' }}>Thinking…</div>}
      </div>
      <div className="flex items-center gap-2 px-5 py-3" style={{ borderTop: `1px solid ${colors.border}` }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitFollowUp(); }} placeholder="Ask a follow-up…"
          style={{ flex: 1, fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink, backgroundColor: colors.canvas, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '9px 14px' }} />
        <button onClick={submitFollowUp} style={{ color: colors.accent }}><Send size={17} /></button>
      </div>
    </>
  );
}

/* ---------- Overview tab ---------- */

function OverviewTab({ lensIndex, setLensIndex, selectedMonthKey, setSelectedMonthKey, expandedCat, setExpandedCat, ask, setAsk }) {
  const ratio = lensRatio(lensIndex);
  const monthCategories = categoriesByMonth[selectedMonthKey];
  const currentCategories = monthCategories.map((c) => ({ ...c, amount: +(c.amount * ratio).toFixed(2), txns: c.txns.map((t) => ({ ...t, amount: +(t.amount * ratio).toFixed(2) })) }));
  const total = currentCategories.reduce((s, c) => s + c.amount, 0);
  const displayedMonths = monthsData.map((m) => ({ ...m, total: m.total * ratio }));
  const ytd = YTD_TOTAL * ratio;
  const showInsights = selectedMonthKey === '2026-07';

  return (
    <>
      <div className="px-5 pt-4">
        <CompactLensSwitch index={lensIndex} onChange={setLensIndex} />
      </div>

      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>2026 YEAR TO DATE</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{formatMoney(ytd)}</div>
        </div>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>Jan–Jul</span>
      </div>

      <TrendLine months={displayedMonths} />
      <TrendBars months={displayedMonths} selectedKey={selectedMonthKey} onSelect={setSelectedMonthKey} />

      {showInsights ? (
        <div className="pb-2">
          <div className="px-5 mb-2" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>WHAT CHANGED</div>
          <div className="flex gap-3 overflow-x-auto px-5 pb-2">
            {insights.map((item) => <InsightTile key={item.id} item={item} onAsk={setAsk} />)}
          </div>
        </div>
      ) : (
        <div className="px-5 pb-2" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>What-changed insights are generated for the current month.</div>
      )}

      <div className="px-5 py-4">
        <div className="flex items-baseline justify-between mb-3">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>CATEGORY BREAKDOWN</span>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 22, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total)}</span>
        </div>
        <div className="flex w-full mb-1" style={{ height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.border }}>
          {currentCategories.map((c) => <div key={c.name} style={{ width: `${(c.amount / total) * 100}%`, backgroundColor: categoryColors[c.name] }} />)}
        </div>
      </div>

      <div className="px-5">
        {currentCategories.map((c) => (
          <CategoryRow key={c.name} cat={c} total={total} expanded={expandedCat === c.name} onToggle={() => setExpandedCat(expandedCat === c.name ? null : c.name)} />
        ))}
      </div>
      <div className="py-6 text-center" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>Tap a category to see its transactions</div>
    </>
  );
}

function CompactLensSwitch({ index, onChange }) {
  return (
    <div className="relative flex w-full" style={{ backgroundColor: colors.border, borderRadius: 999, padding: 3, height: 30 }}>
      <div className="absolute transition-transform duration-300 ease-out" style={{ top: 3, bottom: 3, left: 3, width: 'calc(50% - 3px)', backgroundColor: colors.surface, borderRadius: 999, transform: `translateX(${index * 100}%)`, boxShadow: '0 1px 2px rgba(24,24,27,0.10)' }} />
      {LENSES.map((l, i) => (
        <button key={l} onClick={() => onChange(i)} className="relative flex-1 z-10" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: index === i ? colors.ink : colors.inkMuted }}>{l}</button>
      ))}
    </div>
  );
}

function TrendLine({ months }) {
  const values = months.map((m) => m.total);
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const w = 300, h = 56, padX = 16, padTop = 8, padBottom = 8;
  const usableW = w - padX * 2, usableH = h - padTop - padBottom;
  const points = months.map((m, i) => ({ x: padX + (i * usableW) / (months.length - 1), y: padTop + usableH - ((m.total - min) / range) * usableH }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${h - padBottom} L ${points[0].x.toFixed(1)} ${h - padBottom} Z`;
  const deltaPct = ((months[months.length - 1].total - months[0].total) / months[0].total) * 100;
  const isUp = deltaPct >= 0;
  return (
    <div className="px-5 pb-3">
      <div className="flex items-center justify-between mb-1">
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>6-MONTH TREND</span>
        <span className="flex items-center gap-1" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: isUp ? colors.negative : colors.positive }}>
          {isUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(deltaPct).toFixed(0)}% since {months[0].short}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 56, display: 'block' }} preserveAspectRatio="none">
        <path d={areaD} fill={colors.accent} opacity={0.07} stroke="none" />
        <path d={pathD} fill="none" stroke={colors.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 3.5 : 2.5} fill={colors.ink} />)}
      </svg>
    </div>
  );
}

function TrendBars({ months, selectedKey, onSelect }) {
  const max = Math.max(...months.map((m) => m.total));
  return (
    <div className="px-5 pb-4">
      <div className="mb-2" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>SPEND OVER TIME · tap a month</div>
      <div className="flex items-end gap-2" style={{ height: 96 }}>
        {months.map((m) => {
          const isSel = m.key === selectedKey;
          const barH = Math.max(6, (m.total / max) * 64);
          return (
            <button key={m.key} onClick={() => onSelect(m.key)} className="flex-1 flex flex-col items-center justify-end" style={{ height: '100%' }}>
              <div style={{ height: 16, display: 'flex', alignItems: 'flex-end' }}>
                {isSel && <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(m.total)}</span>}
              </div>
              <div style={{ width: '100%', maxWidth: 28, height: barH, borderRadius: 4, backgroundColor: isSel ? colors.accent : colors.border, transition: 'height 200ms ease-out, background-color 200ms ease-out' }} />
              <span style={{ marginTop: 6, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: isSel ? 600 : 400, color: isSel ? colors.ink : colors.inkMuted }}>{m.short}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InsightTile({ item, onAsk }) {
  return (
    <div className="flex-shrink-0 flex flex-col justify-between" style={{ width: 190, height: 128, backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14 }}>
      <div>
        <div className="flex items-start gap-1">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: colors.ink, lineHeight: 1.3 }}>{item.headline}</span>
          {item.trend && <ArrowUpRight size={14} style={{ color: colors.negative, flexShrink: 0, marginTop: 2 }} />}
        </div>
        {item.sub && <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, marginTop: 2 }}>{item.sub}</div>}
      </div>
      <MiniSpark values={item.trend} color={colors.ink} />
      <button onClick={() => onAsk(item)} style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.accent, textAlign: 'left' }}>{item.action} →</button>
    </div>
  );
}

function CategoryRow({ cat, total, expanded, onToggle }) {
  const pct = total > 0 ? Math.round((cat.amount / total) * 100) : 0;
  return (
    <div style={{ borderBottom: `1px solid ${colors.border}` }}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 py-3">
        <div className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, backgroundColor: categoryColors[cat.name] }} />
        <span className="flex-1 text-left truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink }}>{cat.name}</span>
        <div style={{ width: 60, height: 6, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: categoryColors[cat.name] }} />
        </div>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums', width: 64, textAlign: 'right' }}>{formatMoney(cat.amount)}</span>
        {expanded ? <ChevronUp size={16} style={{ color: colors.inkMuted }} /> : <ChevronDown size={16} style={{ color: colors.inkMuted }} />}
      </button>
      {expanded && (
        <div className="pl-5 pb-3 flex flex-col gap-2">
          {cat.txns.map((t, i) => (
            <div key={i} className="flex items-center justify-between">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>{t.merchant}</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(t.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Items tab — leaderboard grid, not rows ---------- */

function ItemsTab({ selectedId, setSelectedId }) {
  const rows = Object.entries(itemsData).map(([id, d]) => ({ id, ...d, ...statsFor(d.history) })).sort((a, b) => b.total - a.total);
  const selected = selectedId ? itemsData[selectedId] : null;
  const selectedStats = selected ? statsFor(selected.history) : null;

  if (selected) {
    return (
      <>
        <div className="px-5 pt-4 pb-1 flex items-center gap-2">
          <button onClick={() => setSelectedId(null)} style={{ color: colors.ink }}><ChevronLeft size={20} /></button>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>Items</span>
        </div>
        <div className="px-5 pb-4"><div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 21, fontWeight: 600, color: colors.ink }}>{selected.name}</div></div>
        <div className="px-5 pb-5 flex gap-3">
          <StatBlock label="Avg" value={formatMoney(selectedStats.avg)} />
          <StatBlock label="Lowest" value={formatMoney(selectedStats.min)} color={colors.positive} />
          <StatBlock label="Highest" value={formatMoney(selectedStats.max)} color={colors.negative} />
          <StatBlock label="Total" value={formatMoney(selectedStats.total)} />
        </div>
        <div className="px-5 pb-5">
          <div className="mb-2" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>PRICE HISTORY</div>
          <PriceLine history={selected.history} />
        </div>
        <div className="px-5 pb-5">
          <div className="mb-2" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>WHERE YOU'VE BOUGHT THIS</div>
          <StoreChips history={selected.history} />
        </div>
        <div className="px-5 pb-6">
          <div className="mb-2" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>PURCHASE HISTORY</div>
          <PurchaseTape history={selected.history} />
        </div>
      </>
    );
  }

  const [hero, ...rest] = rows;
  return (
    <div className="px-5 pt-4 pb-6">
      <div className="mb-3" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>What you buy, ranked by spend</div>
      <button onClick={() => setSelectedId(hero.id)} className="w-full text-left mb-3" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16, borderLeft: `4px solid ${categoryColors[hero.cat] || colors.accent}` }}>
        <div className="flex items-start justify-between">
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: colors.inkMuted, letterSpacing: '0.05em' }}>#1 · {hero.count} purchases</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 600, color: colors.ink, marginTop: 2 }}>{hero.name}</div>
          </div>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(hero.total)}</span>
        </div>
        <div className="flex items-end justify-between mt-2">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>avg {formatMoney(hero.avg)}</span>
          <MiniSpark values={hero.history.map((h) => h.price)} color={categoryColors[hero.cat]} />
        </div>
      </button>

      <div className="grid grid-cols-2 gap-3">
        {rest.map((row) => (
          <button key={row.id} onClick={() => setSelectedId(row.id)} className="text-left" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12 }}>
            <div className="flex items-center gap-1 mb-1">
              <div className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, backgroundColor: categoryColors[row.cat] || colors.inkMuted }} />
              <span className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.ink }}>{row.name}</span>
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(row.total)}</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: colors.inkMuted, marginTop: 1 }}>{row.count} purchase{row.count !== 1 ? 's' : ''}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatBlock({ label, value, color }) {
  return (
    <div className="flex-1">
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: colors.inkMuted, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: color || colors.ink, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function PriceLine({ history }) {
  const prices = history.map((h) => h.price);
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1;
  const w = 300, h = 70, padX = 16, padTop = 10, padBottom = 10;
  const usableW = w - padX * 2, usableH = h - padTop - padBottom;
  const points = history.map((pt, i) => ({ x: padX + (i * usableW) / (history.length - 1), y: padTop + usableH - ((pt.price - min) / range) * usableH, ...pt }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const lastDelta = points[points.length - 1].price - points[points.length - 2].price;
  const lastColor = lastDelta > 0 ? colors.negative : lastDelta < 0 ? colors.positive : colors.ink;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 70, display: 'block' }} preserveAspectRatio="none">
        <path d={pathD} fill="none" stroke={colors.ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 3.5 : 2.5} fill={i === points.length - 1 ? lastColor : colors.ink} />)}
      </svg>
      <div className="flex justify-between px-4" style={{ marginTop: 2 }}>
        {history.map((pt, i) => <span key={i} style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: colors.inkMuted }}>{pt.date.split(' ')[0]}</span>)}
      </div>
    </div>
  );
}

function StoreChips({ history }) {
  const stats = storeStats(history);
  return (
    <div className="flex gap-2 flex-wrap">
      {stats.map((s, i) => (
        <div key={s.store} className="flex items-center gap-1" style={{ padding: '6px 10px', borderRadius: 999, border: `1px solid ${i === 0 ? colors.accent : colors.border}`, backgroundColor: i === 0 ? 'rgba(63,63,158,0.06)' : colors.surface }}>
          {i === 0 && <Check size={12} style={{ color: colors.accent }} />}
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: colors.ink }}>{s.store}</span>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, fontVariantNumeric: 'tabular-nums' }}>avg {formatMoney(s.avg)}</span>
        </div>
      ))}
    </div>
  );
}

function PurchaseTape({ history }) {
  const sorted = [...history].reverse();
  return (
    <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, borderTop: `2px dashed ${colors.border}`, overflow: 'hidden' }}>
      {sorted.map((h, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: i < sorted.length - 1 ? `1px dashed ${colors.border}` : 'none' }}>
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.ink }}>{h.store}</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: colors.inkMuted }}>{h.date}</div>
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 500, color: colors.ink }}>{formatMoney(h.price)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Merchants tab — leaderboard grid ---------- */

function MerchantsTab({ selectedId, setSelectedId }) {
  const rows = Object.entries(merchantsData).map(([id, m]) => ({ id, ...m })).sort((a, b) => b.lifetimeSpent - a.lifetimeSpent);
  const selected = selectedId ? merchantsData[selectedId] : null;
  const avgPerVisit = selected ? selected.lifetimeSpent / selected.visits : 0;

  if (selected) {
    return (
      <>
        <div className="px-5 pt-4 pb-1 flex items-center gap-2">
          <button onClick={() => setSelectedId(null)} style={{ color: colors.ink }}><ChevronLeft size={20} /></button>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>Merchants</span>
        </div>
        <div className="px-5 pb-1">
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 21, fontWeight: 600, color: colors.ink }}>{selected.name}</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginTop: 2 }}>{selected.category}</div>
        </div>
        <div className="px-5 pt-4 pb-5 flex gap-3">
          <StatBlock label="Lifetime" value={formatMoney(selected.lifetimeSpent)} />
          <StatBlock label="Visits" value={selected.visits} />
          <StatBlock label="Avg / visit" value={formatMoney(avgPerVisit)} />
        </div>
        <div className="px-5 pb-5">
          <div className="mb-2" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>MONTHLY SPEND</div>
          <div className="flex items-end gap-1" style={{ height: 32 }}>
            {selected.monthly.map((v, i) => (
              <div key={i} className="flex-1" style={{ height: Math.max(4, (v / Math.max(...selected.monthly)) * 32), borderRadius: 2, backgroundColor: i === selected.monthly.length - 1 ? colors.accent : colors.border }} />
            ))}
          </div>
        </div>
        <div className="mx-5 mb-5 flex items-start gap-2" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12 }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.ink, lineHeight: 1.4 }}>{selected.whatChanged}</span>
        </div>
        {selected.items.length > 0 && (
          <div className="px-5 pb-6">
            <div className="mb-2" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>WHAT YOU BUY HERE</div>
            <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, overflow: 'hidden' }}>
              {selected.items.map((item, i) => {
                const { Icon, color } = trendMeta(item.trend);
                return (
                  <div key={item.name} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: i < selected.items.length - 1 ? `1px solid ${colors.border}` : 'none' }}>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink }}>{item.name}</span>
                    <div className="flex items-center gap-1">
                      {Icon && <Icon size={13} style={{ color }} />}
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.spent)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  }

  const [hero, ...rest] = rows;
  return (
    <div className="px-5 pt-4 pb-6">
      <div className="mb-3" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>Where your money goes, ranked</div>
      <button onClick={() => setSelectedId(hero.id)} className="w-full text-left mb-3" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16, borderLeft: `4px solid ${categoryColors[hero.category] || colors.accent}` }}>
        <div className="flex items-start justify-between">
          <div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, color: colors.inkMuted, letterSpacing: '0.05em' }}>#1 · {hero.visits} visits</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 600, color: colors.ink, marginTop: 2 }}>{hero.name}</div>
          </div>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(hero.lifetimeSpent)}</span>
        </div>
        <div className="flex items-end justify-between mt-2">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>{hero.category}</span>
          <MiniSpark values={hero.monthly} color={categoryColors[hero.category]} />
        </div>
      </button>
      <div className="grid grid-cols-2 gap-3">
        {rest.map((row) => (
          <button key={row.id} onClick={() => setSelectedId(row.id)} className="text-left" style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12 }}>
            <div className="flex items-center gap-1 mb-1">
              <div className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, backgroundColor: categoryColors[row.category] || colors.inkMuted }} />
              <span className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.ink }}>{row.name}</span>
            </div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(row.lifetimeSpent)}</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: colors.inkMuted, marginTop: 1 }}>{row.visits} visit{row.visits !== 1 ? 's' : ''}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Root ---------- */

export default function Analysis() {
  const [subTab, setSubTab] = useState('overview');
  const [lensIndex, setLensIndex] = useState(0);
  const [selectedMonthKey, setSelectedMonthKey] = useState('2026-07');
  const [expandedCat, setExpandedCat] = useState(null);
  const [ask, setAsk] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedMerchantId, setSelectedMerchantId] = useState(null);

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#E4E4E7' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 800, backgroundColor: colors.canvas }}>
        <div className="px-5 pt-6 pb-3">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: colors.ink }}>Analysis</span>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginTop: 2, marginBottom: 12 }}>
            {subTab === 'overview' ? monthLabel(selectedMonthKey) : 'What you buy and where'}
          </div>
          <SubTabBar tab={subTab} onChange={setSubTab} />
        </div>

        <div className="overflow-y-auto flex-1">
          {subTab === 'overview' && (
            <OverviewTab
              lensIndex={lensIndex} setLensIndex={setLensIndex}
              selectedMonthKey={selectedMonthKey} setSelectedMonthKey={setSelectedMonthKey}
              expandedCat={expandedCat} setExpandedCat={setExpandedCat}
              ask={ask} setAsk={setAsk}
            />
          )}
          {subTab === 'items' && <ItemsTab selectedId={selectedItemId} setSelectedId={setSelectedItemId} />}
          {subTab === 'merchants' && <MerchantsTab selectedId={selectedMerchantId} setSelectedId={setSelectedMerchantId} />}
        </div>

        <BottomSheet open={!!ask} onClose={() => setAsk(null)}>
          <AskSheet ask={ask} onClose={() => setAsk(null)} />
        </BottomSheet>
      </div>
    </div>
  );
}
