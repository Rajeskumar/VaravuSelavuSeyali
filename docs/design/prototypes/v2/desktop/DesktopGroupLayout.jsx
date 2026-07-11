import React, { useState } from 'react';
import {
  Home, Receipt, BarChart3, Users, Sun, Moon,
  Plus, Pencil, Trash2, X,
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

const MEMBER_COLORS = { Ana: '#6B7A99', Marco: '#A5738A', Priya: '#9C9166' };
const GROUP = {
  name: 'Weekend Trip', emoji: '✈️',
  members: [
    { name: 'Ana', balance: 28.00 },
    { name: 'Marco', balance: 18.20 },
    { name: 'Priya', balance: -12.00 },
  ],
};
const ALL_NAMES = ['You', ...GROUP.members.map((m) => m.name)];
const net = GROUP.members.reduce((s, m) => s + m.balance, 0);

const initialExpenses = [
  { id: 'ge1', date: 'Jul 4', description: 'Fourth of July Dinner', paidBy: 'You', amount: 118.00, yourShare: 29.50 },
  { id: 'ge2', date: 'Jul 3', description: 'Airbnb', paidBy: 'Ana', amount: 400.00, yourShare: 100.00 },
  { id: 'ge3', date: 'Jul 3', description: 'Groceries for the house', paidBy: 'Marco', amount: 62.40, yourShare: 15.60 },
];

const NAV_ITEMS = [
  { label: 'Dashboard', Icon: Home },
  { label: 'Expenses', Icon: Receipt },
  { label: 'Analysis', Icon: BarChart3 },
  { label: 'Groups', Icon: Users, active: true },
];

function formatMoney(n) { return `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`; }
function formatSigned(n) { return `${n < 0 ? '−' : '+'}$${Math.abs(n).toFixed(2)}`; }

function Avatar({ name, size = 32, c }) {
  const color = name === 'You' ? c.ink : MEMBER_COLORS[name] || c.inkMuted;
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, backgroundColor: color, color: c.canvas, fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: size * 0.4 }}>
      {name[0]}
    </div>
  );
}

function ThemeAndProfile({ c, dark, onToggle }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onToggle} style={{ width: 32, height: 32, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.inkMuted, border: `1px solid ${c.border}` }}>
        {dark ? <Sun size={15} /> : <Moon size={15} />}
      </button>
      <div style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: c.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600 }}>
        T
      </div>
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

function ExpenseRow({ expense, c, onEdit, onDelete }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="flex items-center gap-3 px-2" style={{ height: 56, borderBottom: `1px solid ${c.border}` }}>
      <Avatar name={expense.paidBy} size={32} c={c} />
      <div className="flex-1 min-w-0">
        <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: c.ink }}>{expense.description}</div>
        <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>{expense.date} · {expense.paidBy} paid {formatMoney(expense.amount)}</div>
      </div>
      {hover ? (
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(expense)} style={{ width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.accent }}><Pencil size={15} /></button>
          <button onClick={() => onDelete(expense.id)} style={{ width: 30, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.negative }}><Trash2 size={15} /></button>
        </div>
      ) : (
        <div className="flex flex-col items-end">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: c.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(expense.yourShare)}</span>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: c.inkMuted }}>your share</span>
        </div>
      )}
    </div>
  );
}

function AddExpenseModal({ c, onClose, onSave, initialExpense }) {
  const isEdit = !!initialExpense;
  const [description, setDescription] = useState(initialExpense?.description || '');
  const [amount, setAmount] = useState(initialExpense ? String(initialExpense.amount) : '');
  const [paidBy, setPaidBy] = useState(initialExpense?.paidBy || 'You');
  const amountNum = parseFloat(amount) || 0;
  const equalShare = amountNum / ALL_NAMES.length;

  function handleSave() {
    if (!description.trim() || amountNum <= 0) return;
    onSave({ id: initialExpense?.id, description, amount: amountNum, paidBy, yourShare: equalShare });
    onClose();
  }
  const inputStyle = { fontFamily: "'Inter', sans-serif", fontSize: 14, color: c.ink, backgroundColor: c.canvas, border: `1px solid ${c.border}`, borderRadius: 8, padding: '9px 12px', width: '100%' };
  const labelStyle = { fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: c.inkMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div style={{ width: 420, backgroundColor: c.surface, borderRadius: 12, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.35)' }}>
        <div className="flex items-center justify-between mb-5">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 700, color: c.ink }}>{isEdit ? 'Edit expense' : 'Add expense'}</span>
          <button onClick={onClose} style={{ color: c.inkMuted }}><X size={20} /></button>
        </div>
        <div className="flex flex-col gap-4">
          <div><label style={labelStyle}>Description</label><input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} autoFocus /></div>
          <div><label style={labelStyle}>Amount</label><input style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums' }} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
          <div>
            <label style={labelStyle}>Paid by</label>
            <div className="flex gap-2">
              {ALL_NAMES.map((name) => (
                <button key={name} onClick={() => setPaidBy(name)} className="flex items-center gap-2" style={{ padding: '5px 11px 5px 5px', borderRadius: 999, border: `1px solid ${paidBy === name ? c.accent : c.border}`, backgroundColor: paidBy === name ? `${c.accent}10` : c.canvas }}>
                  <Avatar name={name} size={22} c={c} />
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: c.ink }}>{name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} style={{ height: 38, padding: '0 16px', fontFamily: "'Inter', sans-serif", fontSize: 14, color: c.ink }}>Cancel</button>
          <button onClick={handleSave} disabled={!description.trim() || amountNum <= 0} className="rounded-full font-semibold" style={{ height: 38, padding: '0 20px', backgroundColor: c.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 14, opacity: !description.trim() || amountNum <= 0 ? 0.5 : 1 }}>
            {isEdit ? 'Save changes' : `Add to ${GROUP.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function BalancesPanel({ c }) {
  return (
    <div className="flex flex-col flex-shrink-0" style={{ width: 280, backgroundColor: c.surface, borderLeft: `1px solid ${c.border}` }}>
      <div className="px-5 pt-6 pb-5 flex flex-col items-center" style={{ borderBottom: `1px solid ${c.border}` }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>{net >= 0 ? "You're owed" : 'You owe'}</span>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 28, color: net >= 0 ? c.positive : c.negative, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{formatMoney(Math.abs(net))}</span>
      </div>
      <div className="px-5 py-4 flex-1">
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: c.inkMuted, marginBottom: 12 }}>BALANCES</div>
        {GROUP.members.map((m) => (
          <div key={m.name} className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${c.border}` }}>
            <Avatar name={m.name} size={32} c={c} />
            <div className="flex-1">
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: c.ink }}>{m.name}</div>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>{m.balance >= 0 ? 'owes you' : 'you owe'}</div>
            </div>
            <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 14, color: m.balance >= 0 ? c.positive : c.negative, fontVariantNumeric: 'tabular-nums' }}>{formatSigned(m.balance)}</span>
          </div>
        ))}
      </div>
      <div className="px-5 pb-6">
        <button className="w-full rounded-full font-semibold" style={{ height: 40, backgroundColor: c.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 14 }}>Settle up</button>
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

export default function DesktopGroupLayout() {
  const [dark, setDark] = useState(false);
  const c = dark ? DARK : LIGHT;
  const [expenses, setExpenses] = useState(initialExpenses);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState('Expenses');

  function openAdd() { setEditing(null); setModalOpen(true); }
  function openEdit(e) { setEditing(e); setModalOpen(true); }
  function handleSave(e) {
    if (e.id) setExpenses((prev) => prev.map((x) => (x.id === e.id ? { ...x, ...e } : x)));
    else setExpenses((prev) => [{ id: `ge${prev.length + 1}`, date: 'Just now', ...e }, ...prev]);
  }
  function handleDelete(id) { setExpenses((prev) => prev.filter((x) => x.id !== id)); }

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

          <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
            <div className="flex items-center justify-between px-6 flex-shrink-0" style={{ height: 54, borderBottom: `1px solid ${c.border}` }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 17 }}>{GROUP.emoji}</span>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: c.ink }}>{GROUP.name}</span>
                <div className="flex ml-2">
                  {ALL_NAMES.map((n, i) => <div key={n} style={{ marginLeft: i === 0 ? 0 : -8, border: `2px solid ${c.canvas}`, borderRadius: 999 }}><Avatar name={n} size={22} c={c} /></div>)}
                </div>
              </div>
              <button onClick={openAdd} className="flex items-center gap-2 rounded-full font-semibold" style={{ height: 34, padding: '0 14px', backgroundColor: c.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 13 }}>
                <Plus size={14} /> Add expense
              </button>
            </div>

            <div className="flex items-center gap-1 px-6 pt-3 flex-shrink-0" style={{ height: 48, borderBottom: `1px solid ${c.border}` }}>
              {['Expenses', 'Activity'].map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, padding: '8px 4px', marginRight: 20, color: tab === t ? c.ink : c.inkMuted, borderBottom: tab === t ? `2px solid ${c.accent}` : '2px solid transparent' }}>{t}</button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 pt-2">
              {tab === 'Expenses' ? (
                <>
                  {expenses.map((e) => <ExpenseRow key={e.id} expense={e} c={c} onEdit={openEdit} onDelete={handleDelete} />)}
                  <div className="py-6 text-center" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>Hover a row for edit/delete</div>
                </>
              ) : (
                <div className="py-6" style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: c.inkMuted }}>Activity feed goes here — member joins, edits, settle-ups.</div>
              )}
            </div>
          </div>

          <BalancesPanel c={c} />
        </div>

        <Footer c={c} />
      </div>

      {modalOpen && <AddExpenseModal c={c} onClose={() => setModalOpen(false)} onSave={handleSave} initialExpense={editing} />}
    </div>
  );
}
