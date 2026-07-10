import React, { useState } from 'react';
import {
  Home, Receipt, BarChart3, Users, Sun, Moon, Plus, X,
} from 'lucide-react';

const LIGHT = {
  canvas: '#FAFAFA', surface: '#FFFFFF', border: '#E4E4E7',
  ink: '#18181B', inkMuted: '#71717A', accent: '#3F3F9E',
  positive: '#15803D', negative: '#B91C1C', caution: '#B45309',
};
const DARK = {
  canvas: '#09090B', surface: '#18181B', border: '#27272A',
  ink: '#FAFAFA', inkMuted: '#A1A1AA', accent: '#6D6DC7',
  positive: '#4ADE80', negative: '#F87171', caution: '#FBBF24',
};
const MEMBER_COLORS = { Ana: '#6B7A99', Marco: '#A5738A', Priya: '#9C9166', Sam: '#B4694A', Jess: '#5C8C82' };
const ALL_CONTACTS = ['Ana', 'Marco', 'Priya', 'Sam', 'Jess'];
const NAV_ITEMS = [
  { label: 'Dashboard', Icon: Home }, { label: 'Expenses', Icon: Receipt },
  { label: 'Analysis', Icon: BarChart3 }, { label: 'Groups', Icon: Users, active: true },
];

const initialGroupsList = [
  { id: 'g1', name: 'Weekend Trip', emoji: '✈️', members: ['Ana', 'Marco', 'Priya'], net: 34.20 },
  { id: 'g2', name: 'Roommates', emoji: '🏠', members: ['Ana'], net: -12.00 },
];

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

function CreateGroupModal({ c, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(['Ana']);
  const filtered = ALL_CONTACTS.filter((n) => n.toLowerCase().includes(search.toLowerCase()));
  function toggle(n) { setSelected((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n])); }
  function handleCreate() {
    if (!name.trim()) return;
    onCreate({ name, members: selected });
    onClose();
  }
  const inputStyle = { fontFamily: "'Inter', sans-serif", fontSize: 14, color: c.ink, backgroundColor: c.canvas, border: `1px solid ${c.border}`, borderRadius: 8, padding: '9px 12px', width: '100%' };
  const labelStyle = { fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: c.inkMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div style={{ width: 420, backgroundColor: c.surface, borderRadius: 12, padding: 24, boxShadow: '0 20px 50px rgba(0,0,0,0.35)' }}>
        <div className="flex items-center justify-between mb-5">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 700, color: c.ink }}>Create group</span>
          <button onClick={onClose} style={{ color: c.inkMuted }}><X size={20} /></button>
        </div>
        <label style={labelStyle}>Group name</label>
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekend Trip" autoFocus />

        <div style={{ marginTop: 16 }}>
          <label style={labelStyle}>Add members</label>
          <input style={inputStyle} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search friends" />
          <div className="flex flex-wrap gap-2 mt-2">
            {filtered.map((n) => {
              const isSel = selected.includes(n);
              return (
                <button key={n} onClick={() => toggle(n)} className="flex items-center gap-2" style={{ padding: '5px 11px 5px 5px', borderRadius: 999, border: `1px solid ${isSel ? c.accent : c.border}`, backgroundColor: isSel ? `${c.accent}10` : c.canvas }}>
                  <Avatar name={n} size={22} c={c} />
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: c.ink }}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} style={{ height: 38, padding: '0 16px', fontFamily: "'Inter', sans-serif", fontSize: 14, color: c.ink }}>Cancel</button>
          <button onClick={handleCreate} disabled={!name.trim()} className="rounded-full font-semibold" style={{ height: 38, padding: '0 20px', backgroundColor: c.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 14, opacity: name.trim() ? 1 : 0.5 }}>
            Create group
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DesktopGroupsList() {
  const [dark, setDark] = useState(false);
  const c = dark ? DARK : LIGHT;
  const [groups, setGroups] = useState(initialGroupsList);
  const [modalOpen, setModalOpen] = useState(false);

  function handleCreate({ name, members }) {
    setGroups((prev) => [...prev, { id: `g${prev.length + 1}`, name, emoji: '👥', members, net: 0 }]);
  }

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

          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div className="flex items-center justify-between mb-6">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: c.ink }}>Groups</span>
              <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 rounded-full font-semibold" style={{ height: 36, padding: '0 16px', backgroundColor: c.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 13 }}>
                <Plus size={15} /> Create group
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {groups.map((g) => (
                <div key={g.id} className="flex items-center gap-3 cursor-pointer" style={{ backgroundColor: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: c.canvas, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{g.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: c.ink }}>{g.name}</div>
                    <div className="flex mt-1">
                      {g.members.map((n, i) => <div key={n} style={{ marginLeft: i === 0 ? 0 : -8, border: `2px solid ${c.surface}`, borderRadius: 999 }}><Avatar name={n} size={20} c={c} /></div>)}
                    </div>
                  </div>
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: g.net >= 0 ? c.positive : c.negative, fontVariantNumeric: 'tabular-nums' }}>{formatSigned(g.net)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Footer c={c} />
      </div>

      {modalOpen && <CreateGroupModal c={c} onClose={() => setModalOpen(false)} onCreate={handleCreate} />}
    </div>
  );
}
