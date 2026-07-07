import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, X, Send, ArrowUpRight } from 'lucide-react';

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
  Entertainment: '#B98CC2',
  Other: '#9AA0A6',
};

// Base month (July 2026) — the fully detailed dataset already validated in the earlier prototype.
const julyCategories = [
  { name: 'Food & Drink', amount: 1080.40, txns: [
    { merchant: "Trader Joe's", amount: -42.10 },
    { merchant: 'Starbucks', amount: -6.75 },
    { merchant: 'Whole Foods · your share', amount: -31.59 },
  ]},
  { name: 'Home', amount: 540.00, txns: [
    { merchant: 'Amazon', amount: -18.42 },
  ]},
  { name: 'Transportation', amount: 410.00, txns: [
    { merchant: 'Shell', amount: -21.30 },
    { merchant: 'Uber', amount: -14.30 },
  ]},
  { name: 'Utilities', amount: 286.00, txns: [
    { merchant: 'Con Edison', amount: -84.20 },
  ]},
  { name: 'Life', amount: 189.70, txns: [
    { merchant: 'Walgreens', amount: -22.50 },
  ]},
  { name: 'Entertainment', amount: 108.00, txns: [
    { merchant: 'Netflix', amount: -15.99 },
  ]},
  { name: 'Other', amount: 80.00, txns: [
    { merchant: 'Misc', amount: -80.00 },
  ]},
];
const julyTotal = julyCategories.reduce((s, c) => s + c.amount, 0);

// Six months of totals for the trend/navigator. Other months' category mixes are derived
// (scaled proportionally from July) purely so every month has plausible drill-down data —
// real data will simply vary naturally once this is wired to the API.
const monthsData = [
  { key: '2026-02', short: 'Feb', total: 2210.00 },
  { key: '2026-03', short: 'Mar', total: 2380.00 },
  { key: '2026-04', short: 'Apr', total: 1950.00 },
  { key: '2026-05', short: 'May', total: 2540.00 },
  { key: '2026-06', short: 'Jun', total: 2203.00 },
  { key: '2026-07', short: 'Jul', total: julyTotal },
];

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

const insights = [
  {
    id: 'i1',
    headline: 'Dining is up 32% vs last month',
    trend: [3, 4, 4, 5, 6, 9],
    action: 'Ask why',
    question: 'Why is my dining spend up 32% this month?',
    answer:
      "Dining jumped mostly from three nights out over the July 4th weekend — about $95 of the $110 increase. Everyday coffee and lunch spend stayed flat.",
  },
  {
    id: 'i2',
    headline: 'New merchant: Sephora — $94',
    sub: 'First time here this month',
    trend: null,
    action: 'Ask about it',
    question: 'Tell me about the Sephora purchase — what was it for?',
    answer:
      "It's a one-off — your first purchase at Sephora this year, filed under Life · Other. Want me to move it to a different category?",
  },
  {
    id: 'i3',
    headline: 'Eggs cost 18% more than usual',
    trend: [2, 2, 3, 3, 4],
    action: 'See why',
    question: 'Why did egg prices go up 18%?',
    answer:
      "Egg prices at Trader Joe's rose from $3.80 to $4.49 a dozen since your last trip — a broader grocery trend, not specific to one store.",
  },
];

function formatMoney(n) {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function Sparkline({ values }) {
  if (!values) return <div style={{ height: 28 }} />;
  const max = Math.max(...values);
  return (
    <div className="flex items-end gap-1" style={{ height: 28 }}>
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            width: 5,
            height: Math.max(3, (v / max) * 28),
            borderRadius: 2,
            backgroundColor: i === values.length - 1 ? colors.ink : colors.hairline,
          }}
        />
      ))}
    </div>
  );
}

function TrendBars({ months, selectedKey, onSelect }) {
  const max = Math.max(...months.map((m) => m.total));
  return (
    <div className="px-5 pb-4">
      <div
        className="mb-2"
        style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}
      >
        SPEND OVER TIME · tap a month
      </div>
      <div className="flex items-end gap-2" style={{ height: 96 }}>
        {months.map((m) => {
          const isSel = m.key === selectedKey;
          const barH = Math.max(6, (m.total / max) * 64);
          return (
            <button key={m.key} onClick={() => onSelect(m.key)} className="flex-1 flex flex-col items-center justify-end" style={{ height: '100%' }}>
              <div style={{ height: 16, display: 'flex', alignItems: 'flex-end' }}>
                {isSel && (
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(m.total)}
                  </span>
                )}
              </div>
              <div
                style={{
                  width: '100%',
                  maxWidth: 28,
                  height: barH,
                  borderRadius: 4,
                  backgroundColor: isSel ? colors.ink : colors.hairline,
                  transition: 'height 200ms ease-out, background-color 200ms ease-out',
                }}
              />
              <span
                style={{
                  marginTop: 6,
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11,
                  fontWeight: isSel ? 600 : 400,
                  color: isSel ? colors.ink : colors.inkMuted,
                }}
              >
                {m.short}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InsightTile({ item, onAsk }) {
  return (
    <div
      className="flex-shrink-0 flex flex-col justify-between"
      style={{ width: 190, height: 132, backgroundColor: colors.surface, border: `1px solid ${colors.hairline}`, borderRadius: 10, padding: 14 }}
    >
      <div>
        <div className="flex items-start gap-1">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: colors.ink, lineHeight: 1.3 }}>
            {item.headline}
          </span>
          {item.trend && <ArrowUpRight size={14} style={{ color: colors.ember, flexShrink: 0, marginTop: 2 }} />}
        </div>
        {item.sub && (
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, marginTop: 2 }}>{item.sub}</div>
        )}
      </div>
      <Sparkline values={item.trend} />
      <button
        onClick={() => onAsk(item)}
        style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.jadeText, textAlign: 'left' }}
      >
        {item.action} →
      </button>
    </div>
  );
}

function CategoryRow({ cat, total, expanded, onToggle }) {
  const pct = total > 0 ? Math.round((cat.amount / total) * 100) : 0;
  return (
    <div style={{ borderBottom: `1px solid ${colors.hairline}` }}>
      <button onClick={onToggle} className="w-full flex items-center gap-2 py-3">
        <div className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, backgroundColor: categoryColors[cat.name] }} />
        <span className="flex-1 text-left truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink }}>
          {cat.name}
        </span>
        <div style={{ width: 60, height: 6, borderRadius: 999, backgroundColor: colors.hairline, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: categoryColors[cat.name] }} />
        </div>
        <span
          style={{
            fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: colors.ink,
            fontVariantNumeric: 'tabular-nums', width: 64, textAlign: 'right',
          }}
        >
          {formatMoney(cat.amount)}
        </span>
        {expanded ? <ChevronUp size={16} style={{ color: colors.inkMuted }} /> : <ChevronDown size={16} style={{ color: colors.inkMuted }} />}
      </button>
      {expanded && (
        <div className="pl-5 pb-3 flex flex-col gap-2">
          {cat.txns.map((t, i) => (
            <div key={i} className="flex items-center justify-between">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>{t.merchant}</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(t.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BottomSheet({ open, onClose, children }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let t;
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      t = setTimeout(() => setMounted(false), 300);
    }
    return () => clearTimeout(t);
  }, [open]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        onClick={onClose}
        className="absolute inset-0 transition-opacity duration-300"
        style={{ backgroundColor: 'rgba(25,26,30,0.45)', opacity: visible ? 1 : 0 }}
      />
      <div
        className="relative w-full rounded-t-2xl transition-transform duration-300 ease-out flex flex-col"
        style={{ maxWidth: 384, backgroundColor: colors.surface, transform: visible ? 'translateY(0)' : 'translateY(100%)', height: 460 }}
      >
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
      const t = setTimeout(() => {
        setThinking(false);
        setMessages((prev) => [...prev, { role: 'assistant', text: ask.answer }]);
      }, 800);
      return () => clearTimeout(t);
    }
  }, [ask, seededFor]);

  function submitFollowUp() {
    if (!draft.trim()) return;
    setMessages((prev) => [...prev, { role: 'user', text: draft }]);
    setDraft('');
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: "I can dig into that further from your data — the trend above holds across the categories you're asking about." },
      ]);
    }, 800);
  }

  if (!ask) return null;

  return (
    <>
      <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${colors.hairline}` }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 700, color: colors.ink }}>Ask</span>
        <button onClick={onClose} style={{ color: colors.inkMuted }}>
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        {messages.map((m, i) => (
          <div key={i} className="flex" style={{ justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div
              style={{
                maxWidth: '80%',
                backgroundColor: m.role === 'user' ? colors.ink : colors.paper,
                color: m.role === 'user' ? '#fff' : colors.ink,
                borderRadius: 12,
                padding: '8px 12px',
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                lineHeight: 1.4,
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex" style={{ justifyContent: 'flex-start' }}>
            <div
              style={{
                backgroundColor: colors.paper, borderRadius: 12, padding: '8px 12px',
                fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.inkMuted,
              }}
            >
              Thinking…
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-5 py-3" style={{ borderTop: `1px solid ${colors.hairline}` }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitFollowUp(); }}
          placeholder="Ask a follow-up…"
          style={{
            flex: 1, fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink,
            backgroundColor: colors.paper, border: `1px solid ${colors.hairline}`, borderRadius: 999,
            padding: '8px 14px',
          }}
        />
        <button onClick={submitFollowUp} style={{ color: colors.jade }}>
          <Send size={18} />
        </button>
      </div>
    </>
  );
}

export default function ExpenseAnalysis() {
  const [selectedMonthKey, setSelectedMonthKey] = useState('2026-07');
  const [expandedCat, setExpandedCat] = useState(null);
  const [ask, setAsk] = useState(null);

  const currentCategories = categoriesByMonth[selectedMonthKey];
  const total = currentCategories.reduce((s, c) => s + c.amount, 0);
  const showInsights = selectedMonthKey === '2026-07';

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#DADAD5' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 780, backgroundColor: colors.paper }}>
        <div className="overflow-y-auto flex-1">
          <div className="px-5 pt-6 pb-4">
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: colors.ink }}>Analysis</span>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginTop: 2 }}>
              {monthLabel(selectedMonthKey)}
            </div>
          </div>

          <TrendBars months={monthsData} selectedKey={selectedMonthKey} onSelect={setSelectedMonthKey} />

          {showInsights ? (
            <div className="pb-2">
              <div
                className="px-5 mb-2"
                style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}
              >
                WHAT CHANGED
              </div>
              <div className="flex gap-3 overflow-x-auto px-5 pb-2">
                {insights.map((item) => (
                  <InsightTile key={item.id} item={item} onAsk={setAsk} />
                ))}
              </div>
            </div>
          ) : (
            <div className="px-5 pb-2" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>
              What-changed insights are generated for the current month.
            </div>
          )}

          <div className="px-5 py-4">
            <div className="flex items-baseline justify-between mb-3">
              <span
                style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}
              >
                CATEGORY BREAKDOWN
              </span>
              <span
                style={{
                  fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 22,
                  color: colors.ink, fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatMoney(total)}
              </span>
            </div>
            <div className="flex w-full mb-1" style={{ height: 10, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.hairline }}>
              {currentCategories.map((c) => (
                <div key={c.name} style={{ width: `${(c.amount / total) * 100}%`, backgroundColor: categoryColors[c.name] }} />
              ))}
            </div>
          </div>

          <div className="px-5">
            {currentCategories.map((c) => (
              <CategoryRow
                key={c.name}
                cat={c}
                total={total}
                expanded={expandedCat === c.name}
                onToggle={() => setExpandedCat(expandedCat === c.name ? null : c.name)}
              />
            ))}
          </div>

          <div className="py-6 text-center" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>
            Tap a category to see its transactions
          </div>
        </div>

        <BottomSheet open={!!ask} onClose={() => setAsk(null)}>
          <AskSheet ask={ask} onClose={() => setAsk(null)} />
        </BottomSheet>
      </div>
    </div>
  );
}
