import React, { useState, useRef, useEffect } from 'react';
import { Search, SlidersHorizontal, X, Pencil, Trash2, Plus, Play, Check } from 'lucide-react';

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

const categoryOptions = [
  'Food & Drink · Groceries', 'Food & Drink · Dining out', 'Transportation · Gas/fuel',
  'Transportation · Taxi', 'Home · Household supplies', 'Utilities · Electricity',
  'Entertainment · Other', 'Life · Other',
];

const initialExpenses = [
  { id: 'e1', date: '2026-07-05', merchant: "Trader Joe's", main: 'Food & Drink', sub: 'Groceries', amount: -42.10 },
  { id: 'e2', date: '2026-07-05', merchant: 'Shell', main: 'Transportation', sub: 'Gas/fuel', amount: -21.30 },
  { id: 'e3', date: '2026-07-04', merchant: 'Fourth of July Dinner', main: 'Food & Drink', sub: 'Dining out', amount: -29.50, isGroup: true, groupLabel: 'Split 4 · Weekend Trip' },
  { id: 'e4', date: '2026-07-04', merchant: 'Netflix', main: 'Entertainment', sub: 'Other', amount: -15.99 },
  { id: 'e5', date: '2026-07-02', merchant: 'Amazon', main: 'Home', sub: 'Household supplies', amount: -18.42 },
  { id: 'e6', date: '2026-07-02', merchant: 'Starbucks', main: 'Food & Drink', sub: 'Dining out', amount: -6.75 },
  { id: 'e7', date: '2026-06-29', merchant: 'Con Edison', main: 'Utilities', sub: 'Electricity', amount: -84.20 },
  { id: 'e8', date: '2026-06-28', merchant: 'Uber', main: 'Transportation', sub: 'Taxi', amount: -14.30 },
];
const TODAY = new Date('2026-07-05T12:00:00');

function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const diffDays = Math.round((TODAY - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}
function formatMoney(n) {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}
function groupByDay(expenses) {
  const sorted = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
  const map = new Map();
  for (const e of sorted) { if (!map.has(e.date)) map.set(e.date, []); map.get(e.date).push(e); }
  return Array.from(map.entries()).map(([date, items]) => ({ date, label: dayLabel(date), items, subtotal: items.reduce((s, e) => s + e.amount, 0) }));
}

const SCOPES = ['Personal', 'Groups', 'Combined'];
const ACTION_WIDTH = 144;

function SubTabBar({ tab, onChange }) {
  const tabs = ['Transactions', 'Recurring'];
  const idx = tabs.findIndex((t) => t.toLowerCase() === tab);
  return (
    <div className="relative flex w-full" style={{ backgroundColor: colors.border, borderRadius: 10, padding: 3, height: 34 }}>
      <div className="absolute transition-transform duration-300 ease-out" style={{ top: 3, bottom: 3, left: 3, width: 'calc(50% - 3px)', backgroundColor: colors.surface, borderRadius: 8, transform: `translateX(${idx * 100}%)`, boxShadow: '0 1px 2px rgba(24,24,27,0.10)' }} />
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t.toLowerCase())} className="relative flex-1 z-10" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: t.toLowerCase() === tab ? colors.ink : colors.inkMuted }}>{t}</button>
      ))}
    </div>
  );
}

function ScopeFilter({ index, onChange }) {
  return (
    <div className="relative flex w-full" style={{ backgroundColor: colors.border, borderRadius: 999, padding: 3, height: 30 }}>
      <div className="absolute transition-transform duration-300 ease-out" style={{ top: 3, bottom: 3, left: 3, width: `calc(${100 / 3}% - 2px)`, backgroundColor: colors.surface, borderRadius: 999, transform: `translateX(${index * 100}%)`, boxShadow: '0 1px 2px rgba(24,24,27,0.10)' }} />
      {SCOPES.map((s, i) => (
        <button key={s} onClick={() => onChange(i)} className="relative flex-1 z-10" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: index === i ? colors.ink : colors.inkMuted }}>{s}</button>
      ))}
    </div>
  );
}

function ExpenseRow({ expense, isOpen, onOpen, onClose, onSelect, onDelete }) {
  const [dragX, setDragX] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const moved = useRef(false);
  const translateX = isOpen ? -ACTION_WIDTH : dragX;

  function handlePointerDown(e) { dragging.current = true; moved.current = false; startX.current = e.clientX; e.target.setPointerCapture(e.pointerId); }
  function handlePointerMove(e) {
    if (!dragging.current) return;
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 4) moved.current = true;
    const base = isOpen ? -ACTION_WIDTH : 0;
    setDragX(Math.max(-ACTION_WIDTH, Math.min(0, base + delta)));
  }
  function handlePointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragX < -ACTION_WIDTH / 2) onOpen(expense.id); else onClose();
    setDragX(0);
  }
  function handleRowClick() {
    if (moved.current) { moved.current = false; return; }
    if (isOpen) { onClose(); return; }
    onSelect(expense);
  }
  const dotColor = categoryColors[expense.main] || colors.inkMuted;

  return (
    <div className="relative overflow-hidden" style={{ borderBottom: `1px solid ${colors.border}` }}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTION_WIDTH }}>
        <button onClick={() => { onSelect(expense); onClose(); }} className="flex flex-col items-center justify-center gap-1" style={{ width: ACTION_WIDTH / 2, backgroundColor: colors.accent, color: '#fff' }}>
          <Pencil size={17} /><span style={{ fontSize: 11, fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>Edit</span>
        </button>
        <button onClick={() => { onDelete(expense.id); onClose(); }} className="flex flex-col items-center justify-center gap-1" style={{ width: ACTION_WIDTH / 2, backgroundColor: colors.negative, color: '#fff' }}>
          <Trash2 size={17} /><span style={{ fontSize: 11, fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>Delete</span>
        </button>
      </div>
      <div onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onClick={handleRowClick}
        className="relative flex items-center gap-3 px-4 py-3 transition-transform duration-200 ease-out select-none cursor-pointer"
        style={{ backgroundColor: colors.surface, transform: `translateX(${translateX}px)`, touchAction: 'pan-y' }}>
        <div className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, backgroundColor: dotColor }} />
        <div className="flex-1 min-w-0">
          <div className="truncate" style={{ color: colors.ink, fontWeight: 600, fontSize: 15, fontFamily: "'Inter', sans-serif" }}>{expense.merchant}</div>
          <div className="truncate" style={{ color: colors.inkMuted, fontSize: 13, fontFamily: "'Inter', sans-serif" }}>{expense.isGroup ? expense.groupLabel : expense.sub}</div>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <span style={{ color: colors.ink, fontWeight: 600, fontSize: 15, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums' }}>{formatMoney(expense.amount)}</span>
          {expense.isGroup && <span className="flex items-center gap-1" style={{ color: colors.inkMuted, fontSize: 11, fontFamily: "'Inter', sans-serif" }}><span>◐</span> your share</span>}
        </div>
      </div>
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
      <div className="relative w-full rounded-t-2xl transition-transform duration-300 ease-out" style={{ maxWidth: 384, backgroundColor: colors.surface, transform: visible ? 'translateY(0)' : 'translateY(100%)', maxHeight: '88%', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function ExpenseDetailSheet({ expense, onClose, onSave, onDelete }) {
  const isEdit = !!expense;
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (expense) {
      setForm({ merchant: expense.merchant, category: `${expense.main} · ${expense.sub}`, amount: Math.abs(expense.amount).toFixed(2), notes: expense.notes || '' });
    } else {
      setForm({ merchant: '', category: categoryOptions[0], amount: '', notes: '' });
    }
    setSaved(false);
  }, [expense]);
  if (!form) return null;
  function handleSave() {
    const [main, sub] = form.category.split(' · ');
    const amount = -Math.abs(parseFloat(form.amount) || 0);
    if (!form.merchant.trim() || amount === 0) return;
    onSave(isEdit ? expense.id : null, { merchant: form.merchant, main, sub, amount, notes: form.notes });
    setSaved(true);
    setTimeout(() => onClose(), 700);
  }
  const inputStyle = { fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink, backgroundColor: colors.canvas, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 12px', width: '100%' };
  const labelStyle = { fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' };
  return (
    <div className="px-5 pt-3 pb-6">
      <div className="mx-auto mb-4 rounded-full" style={{ width: 36, height: 4, backgroundColor: colors.border }} />
      <div className="flex items-start justify-between mb-4">
        <div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>
            {isEdit ? new Date(expense.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'New expense'}
          </div>
          {isEdit && <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 28, color: colors.ink, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{formatMoney(expense.amount)}</div>}
        </div>
        <button onClick={onClose} style={{ color: colors.inkMuted }}><X size={20} /></button>
      </div>
      <div className="flex flex-col gap-4">
        <div><label style={labelStyle}>Merchant</label><input style={inputStyle} value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} placeholder="e.g. Trader Joe's" autoFocus={!isEdit} /></div>
        <div><label style={labelStyle}>Category</label>
          <select style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div><label style={labelStyle}>Amount</label><input style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums' }} type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></div>
        <div><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, minHeight: 60, resize: 'none' }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Add a note" /></div>
      </div>
      <div className="flex flex-col gap-2 mt-6">
        <button onClick={handleSave} className="w-full rounded-full font-semibold" style={{ height: 40, backgroundColor: colors.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 14 }}>
          {saved ? 'Saved ✓' : isEdit ? 'Save changes' : 'Add expense'}
        </button>
        {isEdit && (
          <button onClick={() => { onDelete(expense.id); onClose(); }} className="w-full rounded-full font-medium" style={{ height: 40, color: colors.negative, fontFamily: "'Inter', sans-serif", fontSize: 14 }}>Delete expense</button>
        )}
      </div>
    </div>
  );
}

/* ---------- Recurring ---------- */

const initialTemplates = [
  { id: 'r1', name: 'Netflix', category: 'Entertainment · Other', cost: 15.99, dayOfMonth: 15, status: 'Active', nextDue: 'Jul 15' },
  { id: 'r2', name: 'Gym Membership', category: 'Life · Other', cost: 42.00, dayOfMonth: 1, status: 'Active', nextDue: 'Aug 1' },
  { id: 'r3', name: 'Spotify', category: 'Entertainment · Other', cost: 10.99, dayOfMonth: 22, status: 'Paused', nextDue: '—' },
  { id: 'r4', name: 'Rent', category: 'Home · Rent', cost: 1800.00, dayOfMonth: 1, status: 'Active', nextDue: 'Aug 1' },
];
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

function ToggleSwitch({ active, onChange }) {
  return (
    <button onClick={onChange} style={{ width: 38, height: 22, borderRadius: 999, backgroundColor: active ? colors.accent : colors.border, position: 'relative', transition: 'background-color 200ms ease-out', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, left: active ? 18 : 2, width: 18, height: 18, borderRadius: 999, backgroundColor: '#fff', transition: 'left 200ms ease-out', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
    </button>
  );
}

function RecurringCard({ item, onToggle, onRunNow, justRun }) {
  const isActive = item.status === 'Active';
  return (
    <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div className="flex items-start justify-between mb-1">
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink }}>{item.name}</span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(item.cost)}/mo</span>
      </div>
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>{item.category}</span>
        <div className="flex items-center gap-2">
          {isActive && (
            <button onClick={() => onRunNow(item.id)} disabled={justRun} className="flex items-center gap-1"
              style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: justRun ? colors.positive : colors.ink, border: `1px solid ${justRun ? colors.positive : colors.border}`, backgroundColor: justRun ? 'rgba(21,128,61,0.08)' : colors.surface, padding: '3px 8px', borderRadius: 999 }}>
              {justRun ? <Check size={11} /> : <Play size={11} />}{justRun ? 'Logged' : 'Run now'}
            </button>
          )}
          {isActive ? (
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.accent, backgroundColor: 'rgba(63,63,158,0.08)', padding: '3px 8px', borderRadius: 999 }}>Due {item.nextDue}</span>
          ) : (
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.inkMuted, backgroundColor: colors.border, padding: '3px 8px', borderRadius: 999 }}>Paused</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3" style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>Charges on the {ordinal(item.dayOfMonth)}</span>
        <ToggleSwitch active={isActive} onChange={() => onToggle(item.id)} />
      </div>
    </div>
  );
}

function RecurringTab({ templates, setTemplates }) {
  const [runNowIds, setRunNowIds] = useState([]);
  function toggleTemplate(id) { setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, status: t.status === 'Active' ? 'Paused' : 'Active' } : t))); }
  function runNow(id) { setRunNowIds((p) => [...p, id]); setTimeout(() => setRunNowIds((p) => p.filter((x) => x !== id)), 1500); }
  const activeCount = templates.filter((t) => t.status === 'Active').length;
  const activeTotal = templates.filter((t) => t.status === 'Active').reduce((s, t) => s + t.cost, 0);

  return (
    <div className="px-5 pt-4">
      <div className="flex items-center justify-between mb-4">
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>{activeCount} active · {formatMoney(activeTotal)}/mo</span>
        <button style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: colors.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={16} />
        </button>
      </div>
      {templates.map((item) => (
        <RecurringCard key={item.id} item={item} onToggle={toggleTemplate} onRunNow={runNow} justRun={runNowIds.includes(item.id)} />
      ))}
    </div>
  );
}

/* ---------- Root ---------- */

export default function Expenses() {
  const [subTab, setSubTab] = useState('transactions');
  const [scopeIndex, setScopeIndex] = useState(0);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [templates, setTemplates] = useState(initialTemplates);
  const [openRowId, setOpenRowId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const groups = groupByDay(expenses);
  const monthTotal = expenses.reduce((s, e) => s + e.amount, 0);

  function handleSelect(expense) { setSelected(expense); setSheetOpen(true); }
  function handleSave(id, patch) {
    if (id) {
      setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    } else {
      setExpenses((prev) => [{ id: `e${prev.length + 1}`, date: '2026-07-05', ...patch }, ...prev]);
    }
  }
  function handleDelete(id) { setExpenses((prev) => prev.filter((e) => e.id !== id)); if (selected && selected.id === id) setSheetOpen(false); }

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#E4E4E7' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 800, backgroundColor: colors.canvas, position: 'relative' }}>
        <div className="px-5 pt-6 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: colors.ink }}>Expenses</span>
            {subTab === 'transactions' && (
              <div className="flex items-center gap-3" style={{ color: colors.ink }}><Search size={19} /><SlidersHorizontal size={19} /></div>
            )}
          </div>
          {subTab === 'transactions' && (
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginBottom: 12 }}>
              July 2026 · <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: colors.ink }}>{formatMoney(monthTotal)}</span> so far
            </div>
          )}
          <SubTabBar tab={subTab} onChange={setSubTab} />
          {subTab === 'transactions' && <div className="mt-3"><ScopeFilter index={scopeIndex} onChange={setScopeIndex} /></div>}
        </div>

        <div className="flex-1 overflow-y-auto">
          {subTab === 'transactions' ? (
            <>
              {groups.map((g) => (
                <div key={g.date}>
                  <div className="flex items-center justify-between px-5 py-2 sticky top-0" style={{ backgroundColor: '#F1F1F3', zIndex: 5 }}>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>{g.label}</span>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(g.subtotal)}</span>
                  </div>
                  {g.items.map((expense) => (
                    <ExpenseRow key={expense.id} expense={expense} isOpen={openRowId === expense.id} onOpen={setOpenRowId} onClose={() => setOpenRowId(null)} onSelect={handleSelect} onDelete={handleDelete} />
                  ))}
                </div>
              ))}
              <div className="py-6 text-center" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>Swipe a row for quick actions · tap to open</div>
            </>
          ) : (
            <RecurringTab templates={templates} setTemplates={setTemplates} />
          )}
        </div>

        {subTab === 'transactions' && (
          <button onClick={() => { setSelected(null); setSheetOpen(true); }}
            style={{ position: 'absolute', right: 20, bottom: 24, width: 52, height: 52, borderRadius: 999, backgroundColor: colors.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(63,63,158,0.35)' }}>
            <Plus size={24} />
          </button>
        )}

        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
          <ExpenseDetailSheet expense={selected} onClose={() => setSheetOpen(false)} onSave={handleSave} onDelete={handleDelete} />
        </BottomSheet>
      </div>
    </div>
  );
}
