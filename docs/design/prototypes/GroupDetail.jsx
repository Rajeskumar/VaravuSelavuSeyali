import React, { useState } from 'react';
import { Plus, X, Check } from 'lucide-react';

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

const GROUP = { name: 'Weekend Trip', members: [
  { name: 'Ana', color: '#7E8CA3', balance: 28.00 },
  { name: 'Marco', color: '#B98CC2', balance: 18.20 },
  { name: 'Priya', color: '#A3A86B', balance: -12.00 },
]};
const ALL_NAMES = ['You', ...GROUP.members.map((m) => m.name)];
const net = GROUP.members.reduce((s, m) => s + m.balance, 0);

const categoryOptions = [
  'Food & Drink · Dining out',
  'Food & Drink · Groceries',
  'Home · Rent',
  'Transportation · Gas/fuel',
  'Entertainment · Other',
];

const initialExpenses = [
  { id: 'ge1', date: 'Jul 4', description: 'Fourth of July Dinner', category: 'Food & Drink · Dining out', paidBy: 'You', amount: 118.00, yourShare: 29.50 },
  { id: 'ge2', date: 'Jul 3', description: 'Airbnb', category: 'Home · Rent', paidBy: 'Ana', amount: 400.00, yourShare: 100.00 },
  { id: 'ge3', date: 'Jul 3', description: 'Groceries for the house', category: 'Food & Drink · Groceries', paidBy: 'Marco', amount: 62.40, yourShare: 15.60 },
];

function formatMoney(n) {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function Avatar({ name, color, size = 32 }) {
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color, color: '#fff', fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: size * 0.4 }}
    >
      {name[0]}
    </div>
  );
}

function BottomSheet({ open, onClose, children }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  React.useEffect(() => {
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
      <div onClick={onClose} className="absolute inset-0 transition-opacity duration-300" style={{ backgroundColor: 'rgba(25,26,30,0.45)', opacity: visible ? 1 : 0 }} />
      <div
        className="relative w-full rounded-t-2xl transition-transform duration-300 ease-out"
        style={{ maxWidth: 384, backgroundColor: colors.surface, transform: visible ? 'translateY(0)' : 'translateY(100%)', maxHeight: '88%', overflowY: 'auto' }}
      >
        {children}
      </div>
    </div>
  );
}

function AddExpenseSheet({ onClose, onSave }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('You');
  const [category, setCategory] = useState(categoryOptions[0]);
  const [splitMode, setSplitMode] = useState('equal');
  const [customShares, setCustomShares] = useState({});

  const amountNum = parseFloat(amount) || 0;
  const equalShare = amountNum / ALL_NAMES.length;
  const customTotal = ALL_NAMES.reduce((s, n) => s + (parseFloat(customShares[n]) || 0), 0);
  const customValid = Math.abs(customTotal - amountNum) < 0.02;

  function handleCustomChange(name, val) {
    setCustomShares((prev) => ({ ...prev, [name]: val }));
  }

  function handleSave() {
    if (!description.trim() || amountNum <= 0) return;
    const yourShare = splitMode === 'equal' ? equalShare : parseFloat(customShares['You']) || 0;
    onSave({ description, amount: amountNum, paidBy, category, yourShare });
    onClose();
  }

  const inputStyle = {
    fontFamily: "'Inter', sans-serif", fontSize: 15, color: colors.ink, backgroundColor: colors.paper,
    border: `1px solid ${colors.hairline}`, borderRadius: 10, padding: '10px 12px', width: '100%',
  };
  const labelStyle = {
    fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.inkMuted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block',
  };

  return (
    <div className="px-5 pt-3 pb-6">
      <div className="mx-auto mb-4 rounded-full" style={{ width: 36, height: 4, backgroundColor: colors.hairline }} />
      <div className="flex items-start justify-between mb-1">
        <div>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: colors.ink }}>Add expense</span>
        </div>
        <button onClick={onClose} style={{ color: colors.inkMuted }}><X size={22} /></button>
      </div>
      <div
        className="inline-block mb-4"
        style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: colors.jadeText, backgroundColor: 'rgba(15,163,127,0.08)', padding: '4px 10px', borderRadius: 999 }}
      >
        {GROUP.name} · locked
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label style={labelStyle}>Description</label>
          <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Dinner at the lake house" autoFocus />
        </div>
        <div>
          <label style={labelStyle}>Amount</label>
          <input style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums' }} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label style={labelStyle}>Paid by</label>
          <div className="flex gap-2 flex-wrap">
            {ALL_NAMES.map((name) => (
              <button
                key={name}
                onClick={() => setPaidBy(name)}
                className="flex items-center gap-2"
                style={{
                  padding: '6px 12px 6px 6px', borderRadius: 999,
                  border: `1px solid ${paidBy === name ? colors.jade : colors.hairline}`,
                  backgroundColor: paidBy === name ? 'rgba(15,163,127,0.06)' : colors.surface,
                }}
              >
                <Avatar name={name} color={name === 'You' ? colors.ink : (GROUP.members.find((m) => m.name === name) || {}).color || colors.inkMuted} size={22} />
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.ink }}>{name}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Category</label>
          <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ borderTop: `1px solid ${colors.hairline}`, paddingTop: 14 }}>
          <div className="flex items-center justify-between mb-2">
            <label style={{ ...labelStyle, marginBottom: 0 }}>Split</label>
            <button
              onClick={() => setSplitMode(splitMode === 'equal' ? 'custom' : 'equal')}
              style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: colors.jadeText }}
            >
              {splitMode === 'equal' ? 'Split differently' : 'Split equally'}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {ALL_NAMES.map((name) => (
              <div key={name} className="flex items-center justify-between">
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink }}>{name}</span>
                {splitMode === 'equal' ? (
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.inkMuted, fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(equalShare)}
                  </span>
                ) : (
                  <input
                    style={{ ...inputStyle, width: 90, padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                    type="number" step="0.01"
                    value={customShares[name] || ''}
                    onChange={(e) => handleCustomChange(name, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
          {splitMode === 'custom' && amountNum > 0 && (
            <div className="flex items-center gap-1 mt-2">
              {customValid ? <Check size={13} style={{ color: colors.jadeText }} /> : null}
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: customValid ? colors.jadeText : colors.ember }}>
                {customValid ? 'Splits match the total' : `Splits total ${formatMoney(customTotal)} — should be ${formatMoney(amountNum)}`}
              </span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!description.trim() || amountNum <= 0 || (splitMode === 'custom' && !customValid)}
        className="w-full rounded-full py-3 font-semibold mt-6"
        style={{
          backgroundColor: colors.jade, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 15,
          opacity: !description.trim() || amountNum <= 0 || (splitMode === 'custom' && !customValid) ? 0.5 : 1,
        }}
      >
        Add to {GROUP.name}
      </button>
    </div>
  );
}

export default function GroupDetail() {
  const [tab, setTab] = useState('expenses');
  const [expenses, setExpenses] = useState(initialExpenses);
  const [sheetOpen, setSheetOpen] = useState(false);

  function handleSaveExpense(e) {
    setExpenses((prev) => [{ id: `ge${prev.length + 1}`, date: 'Just now', ...e }, ...prev]);
  }

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#DADAD5' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 780, backgroundColor: colors.paper, position: 'relative' }}>
        <div className="overflow-y-auto flex-1">
          <div className="px-5 pt-6 pb-3">
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              GROUP
            </div>
            <div className="flex items-center justify-between mt-1">
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 600, color: colors.ink }}>{GROUP.name}</span>
              <div className="flex" style={{ marginLeft: 4 }}>
                {GROUP.members.map((m, i) => (
                  <div key={m.name} style={{ marginLeft: i === 0 ? 0 : -8 }}><Avatar name={m.name} color={m.color} size={28} /></div>
                ))}
                <div style={{ marginLeft: -8 }}><Avatar name="You" color={colors.ink} size={28} /></div>
              </div>
            </div>
          </div>

          <div className="px-5 pb-4 flex items-center justify-between">
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>
              {net >= 0 ? "You're owed" : 'You owe'}{' '}
              <span style={{ fontWeight: 700, color: net >= 0 ? colors.jadeText : colors.ember, fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(Math.abs(net))}
              </span>{' '}
              overall
            </span>
          </div>

          <div className="px-5 pb-3">
            <div className="relative flex w-full" style={{ backgroundColor: '#ECECE7', borderRadius: 999, padding: 3, height: 34 }}>
              <div
                className="absolute transition-transform duration-300 ease-out"
                style={{
                  top: 3, bottom: 3, left: 3, width: 'calc(50% - 3px)', backgroundColor: colors.surface, borderRadius: 999,
                  transform: `translateX(${tab === 'balances' ? 100 : 0}%)`, boxShadow: '0 1px 2px rgba(25,26,30,0.08)',
                }}
              />
              {['expenses', 'balances'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="relative flex-1 z-10"
                  style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: tab === t ? colors.ink : colors.inkMuted, textTransform: 'capitalize' }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {tab === 'expenses' ? (
            <div className="px-5">
              {expenses.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${colors.hairline}` }}>
                  <div className="flex-1 min-w-0">
                    <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink }}>{e.description}</div>
                    <div className="truncate" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>
                      {e.date} · {e.paidBy} paid {formatMoney(e.amount)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0">
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: colors.ink, fontVariantNumeric: 'tabular-nums' }}>
                      {formatMoney(e.yourShare)}
                    </span>
                    <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: colors.inkMuted }}>your share</span>
                  </div>
                </div>
              ))}
              <div className="py-6 text-center" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>
                Tap the + to add an expense to this group
              </div>
            </div>
          ) : (
            <div className="px-5">
              {GROUP.members.map((m) => (
                <div key={m.name} className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${colors.hairline}` }}>
                  <Avatar name={m.name} color={m.color} />
                  <div className="flex-1">
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink }}>{m.name}</div>
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>{m.balance >= 0 ? 'owes you' : 'you owe'}</div>
                  </div>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, color: m.balance >= 0 ? colors.jadeText : colors.ember, fontVariantNumeric: 'tabular-nums' }}>
                    {formatMoney(m.balance)}
                  </span>
                </div>
              ))}
              <button
                className="w-full rounded-full py-3 font-semibold mt-4"
                style={{ backgroundColor: colors.jade, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 15 }}
              >
                Settle up
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setSheetOpen(true)}
          style={{
            position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 999,
            backgroundColor: colors.jade, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(15,163,127,0.4)',
          }}
        >
          <Plus size={26} />
        </button>

        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
          <AddExpenseSheet onClose={() => setSheetOpen(false)} onSave={handleSaveExpense} />
        </BottomSheet>
      </div>
    </div>
  );
}
