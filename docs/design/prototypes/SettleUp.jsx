import React, { useState, useRef, useEffect } from 'react';
import { X, Check, BadgeCheck, ArrowRight } from 'lucide-react';

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

const initialMembers = [
  { id: 'ana', name: 'Ana', color: '#7E8CA3', amount: 28.00 },
  { id: 'marco', name: 'Marco', color: '#B98CC2', amount: 18.20 },
  { id: 'priya', name: 'Priya', color: '#A3A86B', amount: -12.00 },
];

function formatSigned(n) {
  const sign = n < 0 ? '−' : '+';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}
function formatAbs(n) {
  return `$${Math.abs(n).toFixed(2)}`;
}

function Avatar({ name, color, size = 40 }) {
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        color: '#fff',
        fontFamily: "'Inter', sans-serif",
        fontWeight: 600,
        fontSize: size * 0.4,
      }}
    >
      {name[0]}
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

export default function SettleUpSheet() {
  const [members] = useState(initialMembers);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stage, setStage] = useState('review'); // review | settling | done
  const [settledIds, setSettledIds] = useState([]);
  const [groupSettled, setGroupSettled] = useState(false);

  const net = members.reduce((s, m) => s + m.amount, 0);
  const [displayNet, setDisplayNet] = useState(net);
  const fromRef = useRef(net);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!groupSettled) setDisplayNet(net);
  }, [net, groupSettled]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  function openSheet() {
    setStage('review');
    setSettledIds([]);
    setSheetOpen(true);
  }

  function confirmSettle() {
    setStage('settling');
    fromRef.current = net;
    const start = performance.now();
    const duration = 900;
    function step(ts) {
      const progress = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayNet(fromRef.current * (1 - eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);

    members.forEach((m, i) => {
      setTimeout(() => setSettledIds((prev) => [...prev, m.id]), 250 + i * 260);
    });

    setTimeout(() => {
      setStage('done');
      setGroupSettled(true);
    }, 250 + members.length * 260 + 300);
  }

  function closeSheet() {
    setSheetOpen(false);
  }

  const netLabel = groupSettled ? 'All squared up' : net >= 0 ? 'You are owed' : 'You owe overall';
  const netColor = groupSettled ? colors.gold : net >= 0 ? colors.jadeText : colors.ember;

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#DADAD5' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 780, backgroundColor: colors.paper }}>
        <div className="px-5 pt-6 pb-4">
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: colors.inkMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Weekend Trip
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex" style={{ marginLeft: 4 }}>
              {members.map((m, i) => (
                <div key={m.id} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                  <Avatar name={m.name} color={m.color} size={32} />
                </div>
              ))}
              <div style={{ marginLeft: -10 }}>
                <Avatar name="You" color={colors.ink} size={32} />
              </div>
            </div>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>
              4 people · {members.length} balances
            </span>
          </div>
        </div>

        <div
          className="flex flex-col items-center py-8"
          style={{ borderBottom: `1px solid ${colors.hairline}`, borderTop: `1px solid ${colors.hairline}` }}
        >
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: colors.inkMuted }}>{netLabel}</span>
          <span
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
              fontSize: 44,
              color: netColor,
              fontVariantNumeric: 'tabular-nums',
              marginTop: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {groupSettled ? <BadgeCheck size={32} style={{ color: colors.gold }} /> : null}
            {groupSettled ? '$0.00' : `${net >= 0 ? '+' : '−'}$${Math.abs(displayNet).toFixed(2)}`}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: colors.inkMuted,
              marginBottom: 8,
            }}
          >
            BALANCES
          </div>
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 py-3"
              style={{ borderBottom: `1px solid ${colors.hairline}`, opacity: groupSettled ? 0.5 : 1, transition: 'opacity 300ms ease-out' }}
            >
              <Avatar name={m.name} color={m.color} />
              <div className="flex-1">
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink }}>{m.name}</div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>
                  {groupSettled ? 'Settled' : m.amount >= 0 ? 'owes you' : 'you owe'}
                </div>
              </div>
              {groupSettled ? (
                <Check size={20} style={{ color: colors.jadeText }} />
              ) : (
                <span
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 600,
                    fontSize: 15,
                    color: m.amount >= 0 ? colors.jadeText : colors.ember,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatSigned(m.amount)}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="px-5 pb-6 pt-2">
          <button
            onClick={openSheet}
            disabled={groupSettled}
            className="w-full rounded-full py-3 font-semibold"
            style={{
              backgroundColor: groupSettled ? colors.hairline : colors.jade,
              color: groupSettled ? colors.inkMuted : '#fff',
              fontFamily: "'Inter', sans-serif",
              fontSize: 15,
            }}
          >
            {groupSettled ? 'All settled' : 'Settle up'}
          </button>
        </div>

        <BottomSheet open={sheetOpen} onClose={closeSheet}>
          <div className="px-5 pt-3 pb-6">
            <div className="mx-auto mb-4 rounded-full" style={{ width: 36, height: 4, backgroundColor: colors.hairline }} />

            {stage !== 'done' ? (
              <>
                <div className="flex items-start justify-between mb-1">
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: colors.ink }}>Settle up</span>
                  <button onClick={closeSheet} style={{ color: colors.inkMuted }}>
                    <X size={22} />
                  </button>
                </div>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginBottom: 20 }}>
                  Minimal payments to bring every balance to zero.
                </p>

                <div className="flex flex-col gap-1 mb-6">
                  {members.map((m) => {
                    const done = settledIds.includes(m.id);
                    const youPay = m.amount < 0;
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 py-3"
                        style={{ borderBottom: `1px solid ${colors.hairline}`, opacity: done ? 0.45 : 1, transition: 'opacity 300ms ease-out' }}
                      >
                        <Avatar name={youPay ? 'You' : m.name} color={youPay ? colors.ink : m.color} size={32} />
                        <ArrowRight size={16} style={{ color: colors.inkMuted, flexShrink: 0 }} />
                        <Avatar name={youPay ? m.name : 'You'} color={youPay ? m.color : colors.ink} size={32} />
                        <div className="flex-1 ml-1">
                          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink }}>
                            {youPay ? `You pay ${m.name}` : `${m.name} pays you`}
                          </div>
                        </div>
                        {done ? (
                          <Check size={18} style={{ color: colors.jadeText }} />
                        ) : (
                          <span
                            style={{
                              fontFamily: "'Inter', sans-serif",
                              fontWeight: 600,
                              fontSize: 15,
                              color: colors.ink,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatAbs(m.amount)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={confirmSettle}
                  disabled={stage === 'settling'}
                  className="w-full rounded-full py-3 font-semibold"
                  style={{
                    backgroundColor: colors.jade,
                    color: '#fff',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 15,
                    opacity: stage === 'settling' ? 0.7 : 1,
                  }}
                >
                  {stage === 'settling' ? 'Settling…' : 'Confirm settle up'}
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center py-6">
                <BadgeCheck size={48} style={{ color: colors.gold, marginBottom: 12 }} />
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 22, color: colors.ink, marginBottom: 4 }}>
                  All squared up
                </div>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginBottom: 24, textAlign: 'center' }}>
                  Every balance in Weekend Trip is now $0.00.
                </p>
                <button
                  onClick={closeSheet}
                  className="w-full rounded-full py-3 font-semibold"
                  style={{ backgroundColor: colors.ink, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 15 }}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </BottomSheet>
      </div>
    </div>
  );
}
