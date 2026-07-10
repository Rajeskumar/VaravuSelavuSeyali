import React, { useState } from 'react';
import { Send, ChevronLeft } from 'lucide-react';

const colors = {
  canvas: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#E4E4E7',
  ink: '#18181B',
  inkMuted: '#71717A',
  accent: '#3F3F9E',
};

const suggestedPrompts = [
  { id: 'p1', text: 'How much did I spend on dining this month?', scope: 'July 2026 · My Expenses', answer: "You've spent $142.30 on dining out this month across 9 visits — about 32% more than your typical month." },
  { id: 'p2', text: "What's my biggest category?", scope: 'July 2026 · My Expenses', answer: 'Food & Drink is your largest category this month at $780.40, about 36% of total spend.' },
  { id: 'p3', text: 'Compare this month to last month', scope: 'Jun–Jul 2026 · My Expenses', answer: "You're up about $22 vs last month ($2,190 vs $1,791) — mostly from three extra dining occasions and one new merchant, Sephora." },
  { id: 'p4', text: 'How much do I still owe in Weekend Trip?', scope: 'Weekend Trip · Group', answer: "You owe $12.00 to Priya. Ana and Marco still owe you a combined $46.20 — you're net up $34.20 in that group." },
  { id: 'p5', text: "What's my spending trend over the last few months?", scope: 'Feb–Jul 2026 · My Expenses', answer: "You're trending up about 22% since February — mostly driven by dining and one larger one-off purchase." },
  { id: 'p6', text: 'Any subscriptions I should reconsider?', scope: 'Recurring · Ongoing', answer: "You have 4 active recurring charges totaling $63.97/month. Netflix and a gym membership haven't had much related activity lately — worth a look." },
];

const MODELS = [{ id: 'fast', label: 'Fast' }, { id: 'deep', label: 'Deep' }];

export default function Ask() {
  const [modelId, setModelId] = useState('fast');
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState('');

  function ask(text, answer, scope) {
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setThinking(true);
    setTimeout(() => { setThinking(false); setMessages((prev) => [...prev, { role: 'assistant', text: answer, scope }]); }, 800);
  }

  function submitDraft() {
    if (!draft.trim()) return;
    const text = draft;
    setDraft('');
    ask(text, "I can look into that — this is a prototype, so try one of the starter questions for a live example, or ask again once this is wired up to your real data.", 'July 2026 · My Expenses (default)');
  }

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#E4E4E7' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 800, backgroundColor: colors.canvas }}>
        <div className="px-5 pt-6 pb-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChevronLeft size={20} style={{ color: colors.ink }} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: colors.ink }}>AI Analyst</span>
            </div>
            <div className="flex" style={{ backgroundColor: colors.border, borderRadius: 999, padding: 3 }}>
              {MODELS.map((m) => (
                <button key={m.id} onClick={() => setModelId(m.id)}
                  style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, backgroundColor: modelId === m.id ? colors.surface : 'transparent', color: modelId === m.id ? colors.ink : colors.inkMuted, boxShadow: modelId === m.id ? '0 1px 2px rgba(24,24,27,0.08)' : 'none' }}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: colors.inkMuted, marginTop: 6 }}>
            Reached from "Ask" anywhere in the app — not a tab of its own
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex flex-col gap-3">
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.inkMuted, lineHeight: 1.5 }}>
                Ask anything about your spending — I'll figure out the right period, and whether to include group expenses, from what you ask.
              </div>
              <div className="flex flex-col gap-2">
                {suggestedPrompts.map((p) => (
                  <button key={p.id} onClick={() => ask(p.text, p.answer, p.scope)} className="text-left"
                    style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink, backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '10px 14px' }}>
                    {p.text}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className="flex flex-col" style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth: '82%', backgroundColor: m.role === 'user' ? colors.ink : colors.surface, color: m.role === 'user' ? '#fff' : colors.ink, border: m.role === 'user' ? 'none' : `1px solid ${colors.border}`, borderRadius: 12, padding: '10px 14px', fontFamily: "'Inter', sans-serif", fontSize: 14, lineHeight: 1.45 }}>
                {m.text}
              </div>
              {m.role === 'assistant' && m.scope && (
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: colors.inkMuted, marginTop: 4, marginLeft: 2 }}>Looked at: {m.scope}</span>
              )}
            </div>
          ))}
          {thinking && (
            <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: '10px 14px', fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.inkMuted, alignSelf: 'flex-start' }}>
              Thinking…
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-3" style={{ borderTop: `1px solid ${colors.border}` }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitDraft(); }} placeholder="Ask about your spending…"
            style={{ flex: 1, fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink, backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '9px 16px' }} />
          <button onClick={submitDraft} style={{ backgroundColor: colors.accent, color: '#fff', borderRadius: 999, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
