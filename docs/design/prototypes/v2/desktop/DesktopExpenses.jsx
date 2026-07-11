import React, { useState } from 'react';
import {
  Home, Receipt, BarChart3, Users, Sun, Moon,
  Search, SlidersHorizontal, Plus, Pencil, Trash2, Play, Check, X,
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

const categoryColors = { 'Food & Drink': '#B4694A', Home: '#6B7A99', Transportation: '#5C8C82', Utilities: '#9C9166', Life: '#A5738A', Entertainment: '#8E7AA3' };
const categoryOptions = ['Food & Drink · Groceries', 'Food & Drink · Dining out', 'Transportation · Gas/fuel', 'Home · Household supplies', 'Utilities · Electricity', 'Entertainment · Other'];
const NAV_ITEMS = [
  { label: 'Dashboard', Icon: Home }, { label: 'Expenses', Icon: Receipt, active: true },
  { label: 'Analysis', Icon: BarChart3 }, { label: 'Groups', Icon: Users },
];
const SCOPES = ['Personal', 'Groups', 'Combined'];

const initialExpenses = [
  { id: 'e1', date: '2026-07-05', merchant: "Trader Joe's", main: 'Food & Drink', sub: 'Groceries', amount: -42.10 },
  { id: 'e2', date: '2026-07-05', merchant: 'Shell', main: 'Transportation', sub: 'Gas/fuel', amount: -21.30 },
  { id: 'e3', date: '2026-07-04', merchant: 'Fourth of July Dinner', main: 'Food & Drink', sub: 'Dining out', amount: -29.50, isGroup: true, groupLabel: 'Split 4 · Weekend Trip' },
  { id: 'e4', date: '2026-07-04', merchant: 'Netflix', main: 'Entertainment', sub: 'Other', amount: -15.99 },
  { id: 'e5', date: '2026-07-02', merchant: 'Amazon', main: 'Home', sub: 'Household supplies', amount: -18.42 },
];
const initialTemplates = [
  { id: 'r1', name: 'Netflix', category: 'Entertainment · Other', cost: 15.99, dayOfMonth: 15, status: 'Active', nextDue: 'Jul 15' },
  { id: 'r2', name: 'Gym Membership', category: 'Life · Other', cost: 42.00, dayOfMonth: 1, status: 'Active', nextDue: 'Aug 1' },
  { id: 'r3', name: 'Spotify', category: 'Entertainment · Other', cost: 10.99, dayOfMonth: 22, status: 'Paused', nextDue: '—' },
];
const TODAY = new Date('2026-07-05T12:00:00');

function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const diff = Math.round((TODAY - d) / 86400000);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'YESTERDAY';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}
function formatMoney(n) { return `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`; }
function groupByDay(list) {
  const sorted = [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
  const map = new Map();
  for (const e of sorted) { if (!map.has(e.date)) map.set(e.date, []); map.get(e.date).push(e); }
  return [...map.entries()].map(([date, items]) => ({ date, label: dayLabel(date), items, subtotal: items.reduce((s, e) => s + e.amount, 0) }));
}
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

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
  const tabs = ['Transactions', 'Recurring'];
  const idx = tabs.findIndex((t) => t.toLowerCase() === tab);
  return (
    <div className="relative flex" style={{ width: 260, backgroundColor: c.border, borderRadius: 10, padding: 3, height: 34 }}>
      <div className="absolute transition-transform duration-300 ease-out" style={{ top: 3, bottom: 3, left: 3, width: 'calc(50% - 3px)', backgroundColor: c.surface, borderRadius: 8, transform: `translateX(${idx * 100}%)`, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }} />
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t.toLowerCase())} className="relative flex-1 z-10" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: t.toLowerCase() === tab ? c.ink : c.inkMuted }}>{t}</button>
      ))}
    </div>
  );
}
function ScopeFilter({ c, index, onChange }) {
  return (
    <div className="relative flex" style={{ width: 240, backgroundColor: c.border, borderRadius: 999, padding: 3, height: 30 }}>
      <div className="absolute transition-transform duration-300 ease-out" style={{ top: 3, bottom: 3, left: 3, width: `calc(${100 / 3}% - 2px)`, backgroundColor: c.surface, borderRadius: 999, transform: `translateX(${index * 100}%)`, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }} />
      {SCOPES.map((s, i) => (
        <button key={s} onClick={() => onChange(i)} className="relative flex-1 z-10" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: index === i ? c.ink : c.inkMuted }}>{s}</button>
      ))}
    </div>
  );
}

function ExpenseRow({ c, expense, onEdit, onDelete }) {
  const [hover, setHover] = useState(false);
  const dotColor = categoryColors[expense.main] || c.inkMuted;
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="flex items-center gap-3 px-2" style={{ height: 52, borderBottom: `1px solid ${c.border}` }}>
      <div className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, backgroundColor: dotColor }} />
      <div className="flex-1 min-w-0">
        <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: c.ink }}>{expense.merchant}</div>
        <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>{expense.isGroup ? expense.groupLabel : expense.sub}</div>
      </div>
      {hover ? (
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(expense)} style={{ width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent }}><Pencil size={15} /></button>
          <button onClick={() => onDelete(expense.id)} style={{ width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.negative }}><Trash2 size={15} /></button>
        </div>
      ) : (
        <div className="flex flex-col items-end">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(expense.amount)}</span>
          {expense.isGroup && <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: c.inkMuted }}>◐ your share</span>}
        </div>
      )}
    </div>
  );
}

function ExpenseModal({ c, onClose, onSave, initialExpense }) {
  const isEdit = !!initialExpense;
  const [merchant, setMerchant] = useState(initialExpense?.merchant || '');
  const [category, setCategory] = useState(initialExpense ? `${initialExpense.main} · ${initialExpense.sub}` : categoryOptions[0]);
  const [amount, setAmount] = useState(initialExpense ? String(Math.abs(initialExpense.amount)) : '');
  const inputStyle = { fontFamily: "'Inter', sans-serif", fontSize: 14, color: c.ink, backgroundColor: c.canvas, border: `1px solid ${c.border}`, borderRadius: 8, padding: '9px 12px', width: '100%' };
  const labelStyle = { fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: c.inkMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' };
  function handleSave() {
    const amt = -Math.abs(parseFloat(amount) || 0);
    if (!merchant.trim() || amt === 0) return;
    const [main, sub] = category.split(' · ');
    onSave(isEdit ? initialExpense.id : null, { merchant, main, sub, amount: amt });
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div style={{ width: 400, backgroundColor: c.surface, borderRadius: 12, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.35)' }}>
        <div className="flex items-center justify-between mb-5">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 700, color: c.ink }}>{isEdit ? 'Edit expense' : 'Add expense'}</span>
          <button onClick={onClose} style={{ color: c.inkMuted }}><X size={20} /></button>
        </div>
        <div className="flex flex-col gap-4">
          <div><label style={labelStyle}>Merchant</label><input style={inputStyle} value={merchant} onChange={(e) => setMerchant(e.target.value)} autoFocus /></div>
          <div><label style={labelStyle}>Category</label>
            <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
              {categoryOptions.map((cOpt) => <option key={cOpt} value={cOpt}>{cOpt}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Amount</label><input style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums' }} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} style={{ height: 38, padding: '0 16px', fontFamily: "'Inter', sans-serif", fontSize: 14, color: c.ink }}>Cancel</button>
          <button onClick={handleSave} className="rounded-full font-semibold" style={{ height: 38, padding: '0 20px', backgroundColor: c.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 14 }}>
            {isEdit ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ c, active, onChange }) {
  return (
    <button onClick={onChange} style={{ width: 38, height: 22, borderRadius: 999, backgroundColor: active ? c.accent : c.border, position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 2, left: active ? 18 : 2, width: 18, height: 18, borderRadius: 999, backgroundColor: '#fff' }} />
    </button>
  );
}

function RecurringCard({ c, item, onToggle, onRunNow, justRun }) {
  const isActive = item.status === 'Active';
  return (
    <div style={{ backgroundColor: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
      <div className="flex items-start justify-between mb-1">
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: c.ink }}>{item.name}</span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(-item.cost)}/mo</span>
      </div>
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>{item.category}</span>
        <div className="flex items-center gap-2">
          {isActive && (
            <button onClick={() => onRunNow(item.id)} disabled={justRun} className="flex items-center gap-1" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: justRun ? c.positive : c.ink, border: `1px solid ${justRun ? c.positive : c.border}`, backgroundColor: justRun ? `${c.positive}10` : c.surface, padding: '3px 8px', borderRadius: 999 }}>
              {justRun ? <Check size={11} /> : <Play size={11} />}{justRun ? 'Logged' : 'Run now'}
            </button>
          )}
          {isActive ? (
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: c.accent, backgroundColor: `${c.accent}14`, padding: '3px 8px', borderRadius: 999 }}>Due {item.nextDue}</span>
          ) : (
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: c.inkMuted, backgroundColor: c.border, padding: '3px 8px', borderRadius: 999 }}>Paused</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3" style={{ borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>Charges on the {ordinal(item.dayOfMonth)}</span>
        <ToggleSwitch c={c} active={isActive} onChange={() => onToggle(item.id)} />
      </div>
    </div>
  );
}

export default function DesktopExpenses() {
  const [dark, setDark] = useState(false);
  const c = dark ? DARK : LIGHT;
  const [subTab, setSubTab] = useState('transactions');
  const [scopeIndex, setScopeIndex] = useState(0);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [templates, setTemplates] = useState(initialTemplates);
  const [runNowIds, setRunNowIds] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const groups = groupByDay(expenses);
  const monthTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const activeCount = templates.filter((t) => t.status === 'Active').length;
  const activeTotal = templates.filter((t) => t.status === 'Active').reduce((s, t) => s + t.cost, 0);

  function openAdd() { setEditing(null); setModalOpen(true); }
  function openEdit(e) { setEditing(e); setModalOpen(true); }
  function handleSave(id, patch) {
    if (id) setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    else setExpenses((prev) => [{ id: `e${prev.length + 1}`, date: '2026-07-05', ...patch }, ...prev]);
  }
  function handleDelete(id) { setExpenses((prev) => prev.filter((e) => e.id !== id)); }
  function toggleTemplate(id) { setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, status: t.status === 'Active' ? 'Paused' : 'Active' } : t))); }
  function runNow(id) { setRunNowIds((p) => [...p, id]); setTimeout(() => setRunNowIds((p) => p.filter((x) => x !== id)), 1500); }

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#E4E4E7' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>
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

          <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
            <div className="flex items-center justify-between px-6 pt-5 flex-shrink-0">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: c.ink }}>Expenses</span>
              {subTab === 'transactions' && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3" style={{ color: c.ink }}><Search size={18} /><SlidersHorizontal size={18} /></div>
                  <button onClick={openAdd} className="flex items-center gap-2 rounded-full font-semibold" style={{ height: 34, padding: '0 14px', backgroundColor: c.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 13 }}>
                    <Plus size={14} /> Add expense
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 pt-4 flex items-center gap-4 flex-shrink-0">
              <SubTabBar c={c} tab={subTab} onChange={setSubTab} />
              {subTab === 'transactions' && <ScopeFilter c={c} index={scopeIndex} onChange={setScopeIndex} />}
              {subTab === 'transactions' && (
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: c.inkMuted }}>
                  July 2026 · <span style={{ fontWeight: 600, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(monthTotal)}</span> so far
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 pt-4">
              {subTab === 'transactions' ? (
                groups.map((g) => (
                  <div key={g.date} className="mb-2">
                    <div className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${c.border}` }}>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: c.inkMuted }}>{g.label}</span>
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: c.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(g.subtotal)}</span>
                    </div>
                    {g.items.map((e) => <ExpenseRow key={e.id} c={c} expense={e} onEdit={openEdit} onDelete={handleDelete} />)}
                  </div>
                ))
              ) : (
                <div style={{ maxWidth: 500 }}>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: c.inkMuted }}>{activeCount} active · {formatMoney(-activeTotal)}/mo</span>
                    <button style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: c.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={16} /></button>
                  </div>
                  {templates.map((t) => <RecurringCard key={t.id} c={c} item={t} onToggle={toggleTemplate} onRunNow={runNow} justRun={runNowIds.includes(t.id)} />)}
                </div>
              )}
            </div>
          </div>
        </div>

        <Footer c={c} />
      </div>

      {modalOpen && <ExpenseModal c={c} onClose={() => setModalOpen(false)} onSave={handleSave} initialExpense={editing} />}
    </div>
  );
}
