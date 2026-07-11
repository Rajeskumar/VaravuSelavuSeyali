import React, { useState, useEffect } from 'react';
import { X, Check, Play } from 'lucide-react';

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

const initialTemplates = [
  { id: 'r1', name: 'Netflix', category: 'Entertainment · Other', cost: 15.99, dayOfMonth: 15, status: 'Active', nextDue: 'Jul 15' },
  { id: 'r2', name: 'Gym Membership', category: 'Life · Other', cost: 42.00, dayOfMonth: 1, status: 'Active', nextDue: 'Aug 1' },
  { id: 'r3', name: 'Spotify', category: 'Entertainment · Other', cost: 10.99, dayOfMonth: 22, status: 'Paused', nextDue: '—' },
  { id: 'r4', name: 'Rent', category: 'Home · Rent', cost: 1800.00, dayOfMonth: 1, status: 'Active', nextDue: 'Aug 1' },
];

function formatMoney(n) {
  return `$${Math.abs(n).toFixed(2)}`;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function ToggleSwitch({ active, onChange }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 40, height: 24, borderRadius: 999, backgroundColor: active ? colors.jade : colors.hairline,
        position: 'relative', transition: 'background-color 200ms ease-out', flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute', top: 2, left: active ? 18 : 2, width: 20, height: 20, borderRadius: 999,
          backgroundColor: '#fff', transition: 'left 200ms ease-out', boxShadow: '0 1px 2px rgba(25,26,30,0.2)',
        }}
      />
    </button>
  );
}

function RecurringCard({ item, onToggle, onRunNow, justRun }) {
  const isActive = item.status === 'Active';
  return (
    <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.hairline}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div className="flex items-start justify-between mb-1">
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink }}>{item.name}</span>
        <span
          style={{
            fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatMoney(item.cost)}/mo
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>{item.category}</span>
        <div className="flex items-center gap-2">
          {isActive && (
            <button
              onClick={() => onRunNow(item.id)}
              disabled={justRun}
              className="flex items-center gap-1"
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600,
                color: justRun ? colors.jadeText : colors.ink,
                border: `1px solid ${justRun ? colors.jade : colors.hairline}`,
                backgroundColor: justRun ? 'rgba(15,163,127,0.08)' : colors.surface,
                padding: '3px 8px', borderRadius: 999,
              }}
            >
              {justRun ? <Check size={11} /> : <Play size={11} />}
              {justRun ? 'Logged' : 'Run now'}
            </button>
          )}
          {isActive ? (
            <span
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.jadeText,
                backgroundColor: 'rgba(15,163,127,0.08)', padding: '3px 8px', borderRadius: 999,
              }}
            >
              Due {item.nextDue}
            </span>
          ) : (
            <span
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.inkMuted,
                backgroundColor: colors.hairline, padding: '3px 8px', borderRadius: 999,
              }}
            >
              Paused
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3" style={{ borderTop: `1px solid ${colors.hairline}`, paddingTop: 10 }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>
          Charges on the {ordinal(item.dayOfMonth)}
        </span>
        <ToggleSwitch active={isActive} onChange={() => onToggle(item.id)} />
      </div>
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
        className="relative w-full rounded-t-2xl transition-transform duration-300 ease-out"
        style={{ maxWidth: 384, backgroundColor: colors.surface, transform: visible ? 'translateY(0)' : 'translateY(100%)', maxHeight: '75%', overflowY: 'auto' }}
      >
        {children}
      </div>
    </div>
  );
}

export default function Recurring() {
  const [templates, setTemplates] = useState(initialTemplates);
  const [promptOpen, setPromptOpen] = useState(false);
  const [confirmedIds, setConfirmedIds] = useState([]);

  const [runNowIds, setRunNowIds] = useState([]);

  function toggleTemplate(id) {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, status: t.status === 'Active' ? 'Paused' : 'Active' } : t)));
  }

  function runNow(id) {
    setRunNowIds((prev) => [...prev, id]);
    setTimeout(() => setRunNowIds((prev) => prev.filter((x) => x !== id)), 1500);
  }

  const dueNow = templates.filter((t) => t.status === 'Active' && (t.id === 'r1' || t.id === 'r4'));

  function confirmOne(id) {
    setConfirmedIds((prev) => [...prev, id]);
  }
  function confirmAll() {
    setConfirmedIds(dueNow.map((t) => t.id));
  }
  function openPrompt() {
    setConfirmedIds([]);
    setPromptOpen(true);
  }

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#DADAD5' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 780, backgroundColor: colors.paper }}>
        <div className="overflow-y-auto flex-1">
          <div className="px-5 pt-6 pb-4">
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: colors.ink }}>Recurring</span>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginTop: 2 }}>
              {templates.filter((t) => t.status === 'Active').length} active · {formatMoney(templates.filter((t) => t.status === 'Active').reduce((s, t) => s + t.cost, 0))}/mo
            </div>
          </div>

          <div className="px-5">
            {templates.map((item) => (
              <RecurringCard key={item.id} item={item} onToggle={toggleTemplate} onRunNow={runNow} justRun={runNowIds.includes(item.id)} />
            ))}
          </div>
        </div>

        <div className="px-5 py-3" style={{ borderTop: `1px solid ${colors.hairline}` }}>
          <button
            onClick={openPrompt}
            className="w-full"
            style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, textAlign: 'center' }}
          >
            Demo only — simulate the login due-prompt
          </button>
        </div>

        <BottomSheet open={promptOpen} onClose={() => setPromptOpen(false)}>
          <div className="px-5 pt-3 pb-6">
            <div className="mx-auto mb-4 rounded-full" style={{ width: 36, height: 4, backgroundColor: colors.hairline }} />
            <div className="flex items-start justify-between mb-1">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: colors.ink }}>
                {dueNow.length} recurring expenses are due
              </span>
              <button onClick={() => setPromptOpen(false)} style={{ color: colors.inkMuted, flexShrink: 0 }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginBottom: 16 }}>
              Confirm to log them, or dismiss and handle them later — this won't block the app.
            </p>
            <div className="flex flex-col gap-1 mb-5">
              {dueNow.map((t) => {
                const done = confirmedIds.includes(t.id);
                return (
                  <div key={t.id} className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${colors.hairline}`, opacity: done ? 0.5 : 1 }}>
                    <div>
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: colors.ink }}>{t.name}</div>
                      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>{formatMoney(t.cost)} · {t.nextDue}</div>
                    </div>
                    {done ? (
                      <Check size={18} style={{ color: colors.jadeText }} />
                    ) : (
                      <button
                        onClick={() => confirmOne(t.id)}
                        style={{
                          fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: colors.jadeText,
                          border: `1px solid ${colors.jade}`, borderRadius: 999, padding: '5px 12px',
                        }}
                      >
                        Confirm
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={confirmAll}
              className="w-full rounded-full py-3 font-semibold"
              style={{ backgroundColor: colors.jade, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 15 }}
            >
              Confirm all
            </button>
          </div>
        </BottomSheet>
      </div>
    </div>
  );
}
