import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Plus, X, Check, ArrowRight, Clock } from 'lucide-react';

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

const MEMBER_COLORS = { Ana: '#6B7A99', Marco: '#A5738A', Priya: '#9C9166' };

const GROUPS_LIST = [
  { id: 'g1', name: 'Weekend Trip', emoji: '✈️', members: ['Ana', 'Marco', 'Priya'], net: 34.20 },
  { id: 'g2', name: 'Roommates', emoji: '🏠', members: ['Ana'], net: -12.00 },
];

const GROUP_DETAIL = {
  name: 'Weekend Trip',
  emoji: '✈️',
  members: [
    { name: 'Ana', balance: 28.00 },
    { name: 'Marco', balance: 18.20 },
    { name: 'Priya', balance: -12.00 },
  ],
};
const ALL_NAMES = ['You', ...GROUP_DETAIL.members.map((m) => m.name)];
const net = GROUP_DETAIL.members.reduce((s, m) => s + m.balance, 0);

const categoryOptions = ['Food & Drink · Dining out', 'Food & Drink · Groceries', 'Home · Rent', 'Transportation · Gas/fuel', 'Entertainment · Other'];

const initialGroupExpenses = [
  { id: 'ge1', date: 'Jul 4', description: 'Fourth of July Dinner', paidBy: 'You', amount: 118.00, yourShare: 29.50 },
  { id: 'ge2', date: 'Jul 3', description: 'Airbnb', paidBy: 'Ana', amount: 400.00, yourShare: 100.00 },
  { id: 'ge3', date: 'Jul 3', description: 'Groceries for the house', paidBy: 'Marco', amount: 62.40, yourShare: 15.60 },
];

const activityFeed = [
  { id: 'a1', text: 'You added "Fourth of July Dinner" — $118.00', time: 'Today' },
  { id: 'a2', text: 'Ana added "Airbnb" — $400.00', time: 'Jul 3' },
  { id: 'a3', text: 'Marco joined the group', time: 'Jul 1' },
];

function formatMoney(n) {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}
function formatSigned(n) {
  const sign = n < 0 ? '−' : '+';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function Avatar({ name, size = 32 }) {
  const color = name === 'You' ? colors.ink : MEMBER_COLORS[name] || colors.inkMuted;
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, backgroundColor: color, color: '#fff', fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: size * 0.4 }}>
      {name[0]}
    </div>
  );
}

function AvatarStack({ names, size = 40, overlap = 12 }) {
  return (
    <div className="flex">
      {names.map((n, i) => (
        <div key={n} style={{ marginLeft: i === 0 ? 0 : -overlap, border: `2px solid ${colors.canvas}`, borderRadius: 999 }}>
          <Avatar name={n} size={size} />
        </div>
      ))}
    </div>
  );
}

function SegmentedTabs({ tabs, active, onChange }) {
  const idx = tabs.indexOf(active);
  return (
    <div className="relative flex w-full" style={{ backgroundColor: colors.border, borderRadius: 10, padding: 3, height: 34 }}>
      <div className="absolute transition-transform duration-300 ease-out" style={{ top: 3, bottom: 3, left: 3, width: `calc(${100 / tabs.length}% - ${(tabs.length - 1) * 2 / tabs.length}px)`, backgroundColor: colors.surface, borderRadius: 8, transform: `translateX(${idx * 100}%)`, boxShadow: '0 1px 2px rgba(24,24,27,0.10)' }} />
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t)} className="relative flex-1 z-10" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: t === active ? colors.ink : colors.inkMuted }}>{t}</button>
      ))}
    </div>
  );
}

function BottomSheet({ open, onClose, children, height = 460 }) {
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
      <div className="relative w-full rounded-t-2xl transition-transform duration-300 ease-out flex flex-col" style={{ maxWidth: 384, backgroundColor: colors.surface, transform: visible ? 'translateY(0)' : 'translateY(100%)', maxHeight: '88%', height }}>
        {children}
      </div>
    </div>
  );
}

/* ---------- Groups list ---------- */

function GroupsList({ onOpen }) {
  return (
    <div className="px-5 pt-4">
      {GROUPS_LIST.map((g) => (
        <button key={g.id} onClick={() => onOpen(g.id)} className="w-full flex items-center gap-3 py-4 text-left" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: colors.canvas, border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
            {g.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: colors.ink }}>{g.name}</div>
            <div className="mt-1"><AvatarStack names={g.members} size={22} overlap={8} /></div>
          </div>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: g.net >= 0 ? colors.positive : colors.negative, fontVariantNumeric: 'tabular-nums' }}>
            {formatSigned(g.net)}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Add expense sheet ---------- */

function ExpenseFormSheet({ onClose, onSave, onDelete, initialExpense }) {
  const isEdit = !!initialExpense;
  const [description, setDescription] = useState(initialExpense?.description || '');
  const [amount, setAmount] = useState(initialExpense ? String(initialExpense.amount) : '');
  const [paidBy, setPaidBy] = useState(initialExpense?.paidBy || 'You');
  const [category, setCategory] = useState(categoryOptions[0]);
  const [splitMode, setSplitMode] = useState('equal');
  const amountNum = parseFloat(amount) || 0;
  const equalShare = amountNum / ALL_NAMES.length;

  function handleSave() {
    if (!description.trim() || amountNum <= 0) return;
    onSave({ id: initialExpense?.id, description, amount: amountNum, paidBy, yourShare: splitMode === 'equal' ? equalShare : (initialExpense?.yourShare ?? 0) });
    onClose();
  }
  const inputStyle = { fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink, backgroundColor: colors.canvas, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 12px', width: '100%' };
  const labelStyle = { fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' };

  return (
    <div className="px-5 pt-3 pb-6 overflow-y-auto">
      <div className="mx-auto mb-4 rounded-full" style={{ width: 36, height: 4, backgroundColor: colors.border }} />
      <div className="flex items-start justify-between mb-1">
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 700, color: colors.ink }}>{isEdit ? 'Edit expense' : 'Add expense'}</span>
        <button onClick={onClose} style={{ color: colors.inkMuted }}><X size={20} /></button>
      </div>
      <div className="inline-block mb-4" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.accent, backgroundColor: 'rgba(63,63,158,0.08)', padding: '3px 9px', borderRadius: 999 }}>
        {GROUP_DETAIL.emoji} {GROUP_DETAIL.name} · locked
      </div>
      <div className="flex flex-col gap-4">
        <div><label style={labelStyle}>Description</label><input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Dinner at the lake house" autoFocus={!isEdit} /></div>
        <div><label style={labelStyle}>Amount</label><input style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums' }} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
        <div>
          <label style={labelStyle}>Paid by</label>
          <div className="flex gap-2 flex-wrap">
            {ALL_NAMES.map((name) => (
              <button key={name} onClick={() => setPaidBy(name)} className="flex items-center gap-2" style={{ padding: '5px 11px 5px 5px', borderRadius: 999, border: `1px solid ${paidBy === name ? colors.accent : colors.border}`, backgroundColor: paidBy === name ? 'rgba(63,63,158,0.06)' : colors.surface }}>
                <Avatar name={name} size={22} />
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.ink }}>{name}</span>
              </button>
            ))}
          </div>
        </div>
        <div><label style={labelStyle}>Category</label>
          <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 14 }}>
          <div className="flex items-center justify-between mb-2">
            <label style={{ ...labelStyle, marginBottom: 0 }}>Split equally</label>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>{formatMoney(equalShare)} each</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 mt-6">
        <button onClick={handleSave} disabled={!description.trim() || amountNum <= 0} className="w-full rounded-full font-semibold"
          style={{ height: 42, backgroundColor: colors.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 15, opacity: !description.trim() || amountNum <= 0 ? 0.5 : 1 }}>
          {isEdit ? 'Save changes' : `Add to ${GROUP_DETAIL.name}`}
        </button>
        {isEdit && (
          <button onClick={() => { onDelete(initialExpense.id); onClose(); }} className="w-full rounded-full font-medium" style={{ height: 40, color: colors.negative, fontFamily: "'Inter', sans-serif", fontSize: 14 }}>
            Delete expense
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Expenses tab (swipeable) ---------- */

const ACTION_WIDTH = 144;
function GroupExpenseRow({ expense, isOpen, onOpen, onClose, onSelect, onDelete }) {
  const [dragX, setDragX] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const moved = useRef(false);
  const translateX = isOpen ? -ACTION_WIDTH : dragX;

  function down(e) { dragging.current = true; moved.current = false; startX.current = e.clientX; e.target.setPointerCapture(e.pointerId); }
  function move(e) {
    if (!dragging.current) return;
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 4) moved.current = true;
    const base = isOpen ? -ACTION_WIDTH : 0;
    setDragX(Math.max(-ACTION_WIDTH, Math.min(0, base + delta)));
  }
  function up() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragX < -ACTION_WIDTH / 2) onOpen(expense.id); else onClose();
    setDragX(0);
  }
  function handleClick() {
    if (moved.current) { moved.current = false; return; }
    if (isOpen) { onClose(); return; }
    onSelect(expense);
  }

  return (
    <div className="relative overflow-hidden" style={{ borderBottom: `1px solid ${colors.border}` }}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTION_WIDTH }}>
        <button onClick={() => { onSelect(expense); onClose(); }} className="flex flex-col items-center justify-center gap-1" style={{ width: ACTION_WIDTH / 2, backgroundColor: colors.accent, color: '#fff' }}>
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>Edit</span>
        </button>
        <button onClick={() => { onDelete(expense.id); onClose(); }} className="flex flex-col items-center justify-center gap-1" style={{ width: ACTION_WIDTH / 2, backgroundColor: colors.negative, color: '#fff' }}>
          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>Delete</span>
        </button>
      </div>
      <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={handleClick}
        className="relative flex items-center gap-3 px-1 py-3 transition-transform duration-200 ease-out select-none cursor-pointer"
        style={{ backgroundColor: colors.canvas, transform: `translateX(${translateX}px)`, touchAction: 'pan-y' }}>
        <Avatar name={expense.paidBy} size={30} />
        <div className="flex-1 min-w-0">
          <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink }}>{expense.description}</div>
          <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>{expense.date} · {expense.paidBy} paid {formatMoney(expense.amount)}</div>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(expense.yourShare)}</span>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: colors.inkMuted }}>your share</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Balances + Settle Up ---------- */

function SettleUpSheet({ members, onClose, onDone }) {
  const [stage, setStage] = useState('review');
  const [settledIds, setSettledIds] = useState([]);
  const [displayNet, setDisplayNet] = useState(net);
  const fromRef = useRef(net);
  const rafRef = useRef(null);

  function confirm() {
    setStage('settling');
    fromRef.current = net;
    const start = performance.now();
    function step(ts) {
      const progress = Math.min(1, (ts - start) / 900);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayNet(fromRef.current * (1 - eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    members.forEach((m, i) => setTimeout(() => setSettledIds((p) => [...p, m.name]), 250 + i * 260));
    setTimeout(() => setStage('done'), 250 + members.length * 260 + 300);
  }
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  if (stage === 'done') {
    return (
      <div className="flex flex-col items-center py-10 px-5">
        <Check size={40} style={{ color: colors.positive, marginBottom: 12 }} />
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 22, color: colors.ink, marginBottom: 4 }}>All squared up</div>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginBottom: 24, textAlign: 'center' }}>Every balance in {GROUP_DETAIL.name} is now $0.00.</p>
        <button onClick={() => { onDone(); onClose(); }} className="w-full rounded-full font-semibold" style={{ height: 42, backgroundColor: colors.ink, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 15 }}>Done</button>
      </div>
    );
  }

  return (
    <div className="px-5 pt-3 pb-6">
      <div className="mx-auto mb-4 rounded-full" style={{ width: 36, height: 4, backgroundColor: colors.border }} />
      <div className="flex items-center justify-between mb-1">
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: colors.ink }}>Settle up</span>
        <button onClick={onClose} style={{ color: colors.inkMuted }}><X size={20} /></button>
      </div>
      <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginBottom: 16 }}>Minimal payments to bring every balance to zero.</p>
      <div className="flex flex-col gap-1 mb-6">
        {members.map((m) => {
          const done = settledIds.includes(m.name);
          const youPay = m.balance < 0;
          return (
            <div key={m.name} className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${colors.border}`, opacity: done ? 0.45 : 1, transition: 'opacity 300ms ease-out' }}>
              <Avatar name={youPay ? 'You' : m.name} size={30} />
              <ArrowRight size={15} style={{ color: colors.inkMuted, flexShrink: 0 }} />
              <Avatar name={youPay ? m.name : 'You'} size={30} />
              <div className="flex-1 ml-1">
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink }}>{youPay ? `You pay ${m.name}` : `${m.name} pays you`}</div>
              </div>
              {done ? <Check size={17} style={{ color: colors.positive }} /> : <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(m.balance)}</span>}
            </div>
          );
        })}
      </div>
      <button onClick={confirm} disabled={stage === 'settling'} className="w-full rounded-full font-semibold"
        style={{ height: 42, backgroundColor: colors.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 15, opacity: stage === 'settling' ? 0.7 : 1 }}>
        {stage === 'settling' ? 'Settling…' : 'Confirm settle up'}
      </button>
    </div>
  );
}

function BalancesTab({ members, onOpenSettle }) {
  return (
    <div className="px-5 pt-2">
      {members.map((m) => (
        <div key={m.name} className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Avatar name={m.name} size={38} />
          <div className="flex-1">
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink }}>{m.name}</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>{m.balance >= 0 ? 'owes you' : 'you owe'}</div>
          </div>
          <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 16, color: m.balance >= 0 ? colors.positive : colors.negative, fontVariantNumeric: 'tabular-nums' }}>{formatSigned(m.balance)}</span>
        </div>
      ))}
      <button onClick={onOpenSettle} className="w-full rounded-full font-semibold mt-5" style={{ height: 42, backgroundColor: colors.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 15 }}>
        Settle up
      </button>
    </div>
  );
}

function ActivityTab() {
  return (
    <div className="px-5 pt-2">
      {activityFeed.map((a) => (
        <div key={a.id} className="flex items-start gap-3 py-3" style={{ borderBottom: `1px solid ${colors.border}` }}>
          <Clock size={15} style={{ color: colors.inkMuted, marginTop: 2, flexShrink: 0 }} />
          <div className="flex-1">
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink }}>{a.text}</div>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, marginTop: 1 }}>{a.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Group Detail ---------- */

function GroupDetail({ onBack }) {
  const [tab, setTab] = useState('Expenses');
  const [expenses, setExpenses] = useState(initialGroupExpenses);
  const [openRowId, setOpenRowId] = useState(null);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settled, setSettled] = useState(false);

  function openAdd() { setSelectedExpense(null); setFormOpen(true); }
  function openEdit(expense) { setSelectedExpense(expense); setFormOpen(true); }
  function handleSaveExpense(e) {
    if (e.id) {
      setExpenses((prev) => prev.map((x) => (x.id === e.id ? { ...x, ...e } : x)));
    } else {
      setExpenses((prev) => [{ id: `ge${prev.length + 1}`, date: 'Just now', ...e }, ...prev]);
    }
  }
  function handleDeleteExpense(id) {
    setExpenses((prev) => prev.filter((x) => x.id !== id));
    setOpenRowId(null);
  }

  const members = settled ? GROUP_DETAIL.members.map((m) => ({ ...m, balance: 0 })) : GROUP_DETAIL.members;
  const displayNet = settled ? 0 : net;

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="px-5 pt-6 pb-3 flex items-center gap-2">
        <button onClick={onBack} style={{ color: colors.ink }}><ChevronLeft size={22} /></button>
        <span style={{ fontSize: 20 }}>{GROUP_DETAIL.emoji}</span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 700, color: colors.ink }}>{GROUP_DETAIL.name}</span>
      </div>

      <div className="flex flex-col items-center px-5 pb-4">
        <AvatarStack names={ALL_NAMES} size={44} overlap={14} />
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginTop: 10 }}>{displayNet >= 0 ? "You're owed" : 'You owe'}</span>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 38, color: displayNet >= 0 ? colors.positive : colors.negative, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
          {formatMoney(Math.abs(displayNet))}
        </span>
      </div>

      <div className="px-5 pb-3">
        <SegmentedTabs tabs={['Expenses', 'Balances', 'Activity']} active={tab} onChange={setTab} />
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'Expenses' && (
          <div className="px-5">
            {expenses.map((e) => (
              <GroupExpenseRow
                key={e.id} expense={e}
                isOpen={openRowId === e.id}
                onOpen={setOpenRowId}
                onClose={() => setOpenRowId(null)}
                onSelect={openEdit}
                onDelete={handleDeleteExpense}
              />
            ))}
            <div className="py-6 text-center" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>Swipe for edit/delete · tap a row to edit · tap the + to add</div>
          </div>
        )}
        {tab === 'Balances' && <BalancesTab members={members} onOpenSettle={() => setSettleOpen(true)} />}
        {tab === 'Activity' && <ActivityTab />}
      </div>

      <button onClick={openAdd} style={{ position: 'absolute', right: 20, bottom: 24, width: 52, height: 52, borderRadius: 999, backgroundColor: colors.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(63,63,158,0.35)' }}>
        <Plus size={24} />
      </button>

      <BottomSheet open={formOpen} onClose={() => setFormOpen(false)} height={540}>
        <ExpenseFormSheet onClose={() => setFormOpen(false)} onSave={handleSaveExpense} onDelete={handleDeleteExpense} initialExpense={selectedExpense} />
      </BottomSheet>
      <BottomSheet open={settleOpen} onClose={() => setSettleOpen(false)} height={460}>
        <SettleUpSheet members={GROUP_DETAIL.members} onClose={() => setSettleOpen(false)} onDone={() => setSettled(true)} />
      </BottomSheet>
    </div>
  );
}

/* ---------- Root ---------- */

export default function Groups() {
  const [view, setView] = useState('list');

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#E4E4E7' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 800, backgroundColor: colors.canvas, position: 'relative' }}>
        {view === 'list' ? (
          <>
            <div className="px-5 pt-6 pb-2 flex items-center justify-between">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: colors.ink }}>Groups</span>
              <button style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: colors.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={16} />
              </button>
            </div>
            <GroupsList onOpen={() => setView('detail')} />
          </>
        ) : (
          <GroupDetail onBack={() => setView('list')} />
        )}
      </div>
    </div>
  );
}
