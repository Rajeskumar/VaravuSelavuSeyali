import React, { useState, useRef, useEffect } from 'react';
import { Search, SlidersHorizontal, X, Pencil, Trash2 } from 'lucide-react';

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
  Home: '#7E8CA3',
  Transportation: '#5E9C8F',
  'Food & Drink': '#C97B4D',
  Entertainment: '#B98CC2',
  Life: '#C77B9E',
  Other: '#9AA0A6',
  Utilities: '#A3A86B',
};

const categoryOptions = [
  'Food & Drink · Groceries',
  'Food & Drink · Dining out',
  'Transportation · Gas/fuel',
  'Transportation · Taxi',
  'Home · Household supplies',
  'Utilities · Electricity',
  'Entertainment · Other',
  'Life · Other',
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
  { id: 'e9', date: '2026-06-28', merchant: 'Whole Foods', main: 'Food & Drink', sub: 'Groceries', amount: -31.59, isGroup: true, groupLabel: 'Split 2 · Roommates' },
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
  const sign = n < 0 ? '−' : '+';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function groupByDay(expenses) {
  const sorted = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
  const map = new Map();
  for (const e of sorted) {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date).push(e);
  }
  return Array.from(map.entries()).map(([date, items]) => ({
    date,
    label: dayLabel(date),
    items,
    subtotal: items.reduce((s, e) => s + e.amount, 0),
  }));
}

const ACTION_WIDTH = 144;

function ExpenseRow({ expense, isOpen, onOpen, onClose, onSelect, onDelete }) {
  const [dragX, setDragX] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const moved = useRef(false);

  const translateX = isOpen ? -ACTION_WIDTH : dragX;

  function handlePointerDown(e) {
    dragging.current = true;
    moved.current = false;
    startX.current = e.clientX;
    e.target.setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e) {
    if (!dragging.current) return;
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 4) moved.current = true;
    const base = isOpen ? -ACTION_WIDTH : 0;
    let next = base + delta;
    next = Math.max(-ACTION_WIDTH, Math.min(0, next));
    setDragX(next);
  }
  function handlePointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragX < -ACTION_WIDTH / 2) {
      onOpen(expense.id);
    } else {
      onClose();
    }
    setDragX(0);
  }
  function handleRowClick() {
    if (moved.current) {
      moved.current = false;
      return;
    }
    if (isOpen) {
      onClose();
      return;
    }
    onSelect(expense);
  }

  const dotColor = categoryColors[expense.main] || colors.inkMuted;

  return (
    <div className="relative overflow-hidden" style={{ borderBottom: `1px solid ${colors.hairline}` }}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTION_WIDTH }}>
        <button
          onClick={() => { onSelect(expense); onClose(); }}
          className="flex flex-col items-center justify-center gap-1"
          style={{ width: ACTION_WIDTH / 2, backgroundColor: colors.jade, color: '#fff' }}
        >
          <Pencil size={18} />
          <span style={{ fontSize: 11, fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>Edit</span>
        </button>
        <button
          onClick={() => { onDelete(expense.id); onClose(); }}
          className="flex flex-col items-center justify-center gap-1"
          style={{ width: ACTION_WIDTH / 2, backgroundColor: colors.ember, color: '#fff' }}
        >
          <Trash2 size={18} />
          <span style={{ fontSize: 11, fontWeight: 500, fontFamily: "'Inter', sans-serif" }}>Delete</span>
        </button>
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleRowClick}
        className="relative flex items-center gap-3 px-4 py-3 transition-transform duration-200 ease-out select-none cursor-pointer"
        style={{ backgroundColor: colors.surface, transform: `translateX(${translateX}px)`, touchAction: 'pan-y' }}
      >
        <div className="rounded-full flex-shrink-0" style={{ width: 10, height: 10, backgroundColor: dotColor }} />
        <div className="flex-1 min-w-0">
          <div className="truncate" style={{ color: colors.ink, fontWeight: 600, fontSize: 15, fontFamily: "'Inter', sans-serif" }}>
            {expense.merchant}
          </div>
          <div className="truncate" style={{ color: colors.inkMuted, fontSize: 13, fontFamily: "'Inter', sans-serif" }}>
            {expense.isGroup ? expense.groupLabel : expense.sub}
          </div>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <span
            style={{
              color: colors.ink,
              fontWeight: 600,
              fontSize: 15,
              fontFamily: "'Inter', sans-serif",
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatMoney(expense.amount)}
          </span>
          {expense.isGroup && (
            <span className="flex items-center gap-1" style={{ color: colors.inkMuted, fontSize: 11, fontFamily: "'Inter', sans-serif" }}>
              <span>◐</span> your share
            </span>
          )}
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
        style={{
          maxWidth: 384,
          backgroundColor: colors.surface,
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          maxHeight: '85%',
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ExpenseDetailSheet({ expense, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (expense) {
      setForm({
        merchant: expense.merchant,
        category: `${expense.main} · ${expense.sub}`,
        amount: Math.abs(expense.amount).toFixed(2),
        notes: expense.notes || '',
      });
      setSaved(false);
    }
  }, [expense]);

  if (!expense || !form) return null;

  function handleSave() {
    const [main, sub] = form.category.split(' · ');
    onSave(expense.id, {
      merchant: form.merchant,
      main,
      sub,
      amount: -Math.abs(parseFloat(form.amount) || 0),
      notes: form.notes,
    });
    setSaved(true);
    setTimeout(() => onClose(), 700);
  }

  const inputStyle = {
    fontFamily: "'Inter', sans-serif",
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.paper,
    border: `1px solid ${colors.hairline}`,
    borderRadius: 10,
    padding: '10px 12px',
    width: '100%',
  };
  const labelStyle = {
    fontFamily: "'Inter', sans-serif",
    fontSize: 11,
    fontWeight: 600,
    color: colors.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: 6,
    display: 'block',
  };

  return (
    <div className="px-5 pt-3 pb-6">
      <div className="mx-auto mb-4 rounded-full" style={{ width: 36, height: 4, backgroundColor: colors.hairline }} />
      <div className="flex items-start justify-between mb-4">
        <div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>
            {new Date(expense.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: 30,
              color: colors.ink,
              fontVariantNumeric: 'tabular-nums',
              marginTop: 2,
            }}
          >
            {formatMoney(expense.amount)}
          </div>
        </div>
        <button onClick={onClose} style={{ color: colors.inkMuted }}>
          <X size={22} />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label style={labelStyle}>Merchant</label>
          <input style={inputStyle} value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Category</label>
          <select style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Amount</label>
          <input
            style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums' }}
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div>
          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: 64, resize: 'none' }}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Add a note"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-6">
        <button
          onClick={handleSave}
          className="w-full rounded-full py-3 font-semibold"
          style={{ backgroundColor: colors.jade, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 15 }}
        >
          {saved ? 'Saved ✓' : 'Save changes'}
        </button>
        <button
          onClick={() => { onDelete(expense.id); onClose(); }}
          className="w-full rounded-full py-3 font-medium"
          style={{ color: colors.ember, fontFamily: "'Inter', sans-serif", fontSize: 15 }}
        >
          Delete expense
        </button>
      </div>
    </div>
  );
}

export default function ExpenseFeed() {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [openRowId, setOpenRowId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const groups = groupByDay(expenses);
  const monthTotal = expenses.reduce((s, e) => s + e.amount, 0);

  function handleSelect(expense) {
    setSelected(expense);
    setSheetOpen(true);
  }
  function handleSave(id, patch) {
    setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function handleDelete(id) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    if (selected && selected.id === id) setSheetOpen(false);
  }

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#DADAD5' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 780, backgroundColor: colors.paper }}>
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: colors.ink }}>Expenses</span>
            <div className="flex items-center gap-3" style={{ color: colors.ink }}>
              <Search size={20} />
              <SlidersHorizontal size={20} />
            </div>
          </div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>
            July 2026 ·{' '}
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: colors.ink }}>
              {formatMoney(monthTotal)}
            </span>{' '}
            so far
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" onClick={() => { if (openRowId) setOpenRowId(null); }}>
          {groups.map((g) => (
            <div key={g.date}>
              <div className="flex items-center justify-between px-5 py-2 sticky top-0" style={{ backgroundColor: '#EFEFEA', zIndex: 5 }}>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: colors.inkMuted }}>
                  {g.label}
                </span>
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.inkMuted, fontVariantNumeric: 'tabular-nums' }}>
                  {formatMoney(g.subtotal)}
                </span>
              </div>
              {g.items.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  isOpen={openRowId === expense.id}
                  onOpen={(id) => setOpenRowId(id)}
                  onClose={() => setOpenRowId(null)}
                  onSelect={handleSelect}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ))}
          <div className="py-6 text-center" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>
            Swipe a row for quick actions · tap to open
          </div>
        </div>

        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
          <ExpenseDetailSheet expense={selected} onClose={() => setSheetOpen(false)} onSave={handleSave} onDelete={handleDelete} />
        </BottomSheet>
      </div>
    </div>
  );
}
