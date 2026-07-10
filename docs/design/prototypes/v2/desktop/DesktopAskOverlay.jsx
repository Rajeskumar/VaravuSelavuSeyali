import React, { useState } from 'react';
import {
  Home, Receipt, BarChart3, Users, Sun, Moon,
  MessageCircle, X, Send,
} from 'lucide-react';

const LIGHT = {
  canvas: '#FAFAFA', surface: '#FFFFFF', border: '#E4E4E7',
  ink: '#18181B', inkMuted: '#71717A', accent: '#3F3F9E', positive: '#15803D',
};
const DARK = {
  canvas: '#09090B', surface: '#18181B', border: '#27272A',
  ink: '#FAFAFA', inkMuted: '#A1A1AA', accent: '#6D6DC7', positive: '#4ADE80',
};
const NAV_ITEMS = [
  { label: 'Dashboard', Icon: Home, active: true }, { label: 'Expenses', Icon: Receipt },
  { label: 'Analysis', Icon: BarChart3 }, { label: 'Groups', Icon: Users },
];
const categoryColors = { 'Food & Drink': '#B4694A', Home: '#6B7A99', Transportation: '#5C8C82', Utilities: '#9C9166', Life: '#A5738A' };
const categories = [{ name: 'Food & Drink', amount: 780.40 }, { name: 'Home', amount: 540.00 }, { name: 'Transportation', amount: 410.00 }, { name: 'Utilities', amount: 286.00 }, { name: 'Life', amount: 173.70 }];
const catTotal = categories.reduce((s, c) => s + c.amount, 0);

const suggestedPrompts = [
  { id: 'p1', text: 'How much did I spend on dining this month?', scope: 'July 2026 · My Expenses', answer: "You've spent $142.30 on dining out this month across 9 visits — about 32% more than your typical month." },
  { id: 'p2', text: "What's my biggest category?", scope: 'July 2026 · My Expenses', answer: 'Food & Drink is your largest category this month at $780.40, about 36% of total spend.' },
  { id: 'p3', text: 'How much do I still owe in Weekend Trip?', scope: 'Weekend Trip · Group', answer: "You owe $12.00 to Priya. Ana and Marco still owe you a combined $46.20 — you're net up $34.20 in that group." },
];
const MODELS = [{ id: 'fast', label: 'Fast' }, { id: 'deep', label: 'Deep' }];

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

function BasePageContent({ c }) {
  return (
    <div className="px-8 py-6">
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: c.inkMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>July 2026</div>
      <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 44, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>$2,190.10</span>
      <div className="flex w-full my-4" style={{ height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: c.border, maxWidth: 500 }}>
        {categories.map((cat) => <div key={cat.name} style={{ width: `${(cat.amount / catTotal) * 100}%`, backgroundColor: categoryColors[cat.name] }} />)}
      </div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: c.inkMuted, maxWidth: 420 }}>
        This is any of the 4 main pages — Dashboard shown here as a stand-in. Notice the sidebar and header stay fully visible and usable while Ask is open; it's a layer on top, not a place you've navigated away to.
      </div>
    </div>
  );
}

function AskPanel({ c, open, onClose }) {
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState('');
  const [modelId, setModelId] = useState('fast');

  function ask(text, answer, scope) {
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setThinking(true);
    setTimeout(() => { setThinking(false); setMessages((prev) => [...prev, { role: 'assistant', text: answer, scope }]); }, 800);
  }
  function submitDraft() {
    if (!draft.trim()) return;
    const text = draft;
    setDraft('');
    ask(text, "I can look into that — try one of the starter questions for a live example, or ask again once this is wired up.", 'July 2026 · My Expenses (default)');
  }

  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{
        width: open ? 340 : 0, backgroundColor: c.surface, borderLeft: open ? `1px solid ${c.border}` : 'none',
        transition: 'width 250ms ease-out', overflow: 'hidden',
      }}
    >
      <div style={{ width: 340 }}>
        <div className="flex items-center justify-between px-5" style={{ height: 54, borderBottom: `1px solid ${c.border}` }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: c.ink }}>Ask</span>
          <div className="flex items-center gap-2">
            <div className="flex" style={{ backgroundColor: c.border, borderRadius: 999, padding: 2 }}>
              {MODELS.map((m) => (
                <button key={m.id} onClick={() => setModelId(m.id)} style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 999, backgroundColor: modelId === m.id ? c.surface : 'transparent', color: modelId === m.id ? c.ink : c.inkMuted }}>{m.label}</button>
              ))}
            </div>
            <button onClick={onClose} style={{ color: c.inkMuted }}><X size={18} /></button>
          </div>
        </div>

        <div style={{ height: 430, overflowY: 'auto' }} className="px-5 py-4 flex flex-col gap-3">
          {messages.length === 0 && (
            <>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: c.inkMuted, lineHeight: 1.5 }}>Ask anything about your spending — I'll figure out the period and scope from what you ask.</div>
              {suggestedPrompts.map((p) => (
                <button key={p.id} onClick={() => ask(p.text, p.answer, p.scope)} className="text-left" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: c.ink, backgroundColor: c.canvas, border: `1px solid ${c.border}`, borderRadius: 10, padding: '9px 12px' }}>{p.text}</button>
              ))}
            </>
          )}
          {messages.map((m, i) => (
            <div key={i} className="flex flex-col" style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '85%', backgroundColor: m.role === 'user' ? c.ink : c.canvas, color: m.role === 'user' ? '#fff' : c.ink, border: m.role === 'user' ? 'none' : `1px solid ${c.border}`, borderRadius: 10, padding: '8px 12px', fontFamily: "'Inter', sans-serif", fontSize: 13, lineHeight: 1.4 }}>{m.text}</div>
              {m.role === 'assistant' && m.scope && <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: c.inkMuted, marginTop: 3 }}>Looked at: {m.scope}</span>}
            </div>
          ))}
          {thinking && <div style={{ backgroundColor: c.canvas, border: `1px solid ${c.border}`, borderRadius: 10, padding: '8px 12px', fontFamily: "'Inter', sans-serif", fontSize: 13, color: c.inkMuted, alignSelf: 'flex-start' }}>Thinking…</div>}
        </div>

        <div className="flex items-center gap-2 px-5 py-3" style={{ borderTop: `1px solid ${c.border}` }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitDraft(); }} placeholder="Ask about your spending…" style={{ flex: 1, fontFamily: "'Inter', sans-serif", fontSize: 13, color: c.ink, backgroundColor: c.canvas, border: `1px solid ${c.border}`, borderRadius: 999, padding: '8px 14px' }} />
          <button onClick={submitDraft} style={{ backgroundColor: c.accent, color: '#fff', borderRadius: 999, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Send size={14} /></button>
        </div>
      </div>
    </div>
  );
}

export default function DesktopAskOverlay() {
  const [dark, setDark] = useState(false);
  const c = dark ? DARK : LIGHT;
  const [askOpen, setAskOpen] = useState(false);

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#E4E4E7' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col overflow-hidden rounded-2xl shadow-2xl" style={{ maxWidth: 1120, height: 700, backgroundColor: c.canvas, position: 'relative' }}>

        <div className="flex items-center justify-between px-6 flex-shrink-0" style={{ height: 58, borderBottom: `1px solid ${c.border}`, backgroundColor: c.surface }}>
          <div className="flex items-center gap-2">
            <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: c.accent }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: c.ink }}>TrackSpense</span>
          </div>
          <ThemeAndProfile c={c} dark={dark} onToggle={() => setDark((d) => !d)} />
        </div>

        <div className="flex flex-1" style={{ minHeight: 0 }}>
          <Sidebar c={c} />
          <div className="flex-1 overflow-y-auto">
            <BasePageContent c={c} />
          </div>
          <AskPanel c={c} open={askOpen} onClose={() => setAskOpen(false)} />
        </div>

        <Footer c={c} />

        {!askOpen && (
          <button
            onClick={() => setAskOpen(true)}
            style={{
              position: 'absolute', right: 24, bottom: 68, width: 52, height: 52, borderRadius: 999,
              backgroundColor: c.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(63,63,158,0.4)',
            }}
          >
            <MessageCircle size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
