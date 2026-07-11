import React, { useState } from 'react';
import { X } from 'lucide-react';

const colors = {
  canvas: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#E4E4E7',
  ink: '#18181B',
  inkMuted: '#71717A',
  accent: '#3F3F9E',
};

// Same desaturated categorical palette used in Groups.jsx / Analysis.jsx / Expenses.jsx,
// extended with two more hues for Sam and Jess.
const CONTACT_COLORS = {
  Ana: '#6B7A99',
  Marco: '#A5738A',
  Priya: '#9C9166',
  Sam: '#B4694A',
  Jess: '#5C8C82',
};
const ALL_CONTACTS = ['Ana', 'Marco', 'Priya', 'Sam', 'Jess'];
const KEYBOARD_HEIGHT = 260;

function Avatar({ name, size = 26 }) {
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: CONTACT_COLORS[name] || colors.inkMuted, color: '#fff', fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: size * 0.4 }}
    >
      {name[0]}
    </div>
  );
}

export default function CreateGroup() {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(['Ana']);

  const filtered = ALL_CONTACTS.filter((c) => c.toLowerCase().includes(search.toLowerCase()));

  function toggle(name) {
    setSelected((prev) => (prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name]));
  }

  const inputStyle = {
    fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink, backgroundColor: colors.canvas,
    border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 12px', width: '100%',
  };
  const labelStyle = {
    fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.inkMuted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block',
  };

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#E4E4E7' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 800, backgroundColor: colors.canvas, position: 'relative' }}>
        <div className="px-5 pt-6" style={{ opacity: 0.35 }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: colors.ink }}>Groups</span>
        </div>
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(24,24,27,0.35)' }} />

        <div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: keyboardVisible ? KEYBOARD_HEIGHT : 0,
            backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
            transition: 'bottom 250ms ease-out', maxHeight: '72%', display: 'flex', flexDirection: 'column',
            boxShadow: '0 -6px 24px rgba(0,0,0,0.15)',
          }}
        >
          <div className="px-5 pt-3 pb-6 overflow-y-auto">
            <div className="mx-auto mb-3 rounded-full" style={{ width: 36, height: 4, backgroundColor: colors.border }} />
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 700, color: colors.ink }}>Create group</span>
              <button style={{ color: colors.inkMuted }}><X size={19} /></button>
            </div>

            <label style={labelStyle}>Group name</label>
            <input
              style={inputStyle}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onFocus={() => setKeyboardVisible(true)}
              onBlur={() => setKeyboardVisible(false)}
              placeholder="e.g. Weekend Trip"
            />

            <div style={{ marginTop: 16 }}>
              <label style={labelStyle}>Add members</label>
              <input
                style={inputStyle}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setKeyboardVisible(true)}
                onBlur={() => setKeyboardVisible(false)}
                placeholder="Search friends"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {filtered.map((name) => {
                  const isSel = selected.includes(name);
                  return (
                    <button
                      key={name}
                      onClick={() => toggle(name)}
                      className="flex items-center gap-2"
                      style={{
                        padding: '5px 11px 5px 5px', borderRadius: 999,
                        border: `1px solid ${isSel ? colors.accent : colors.border}`,
                        backgroundColor: isSel ? 'rgba(63,63,158,0.06)' : colors.surface,
                      }}
                    >
                      <Avatar name={name} size={22} />
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.ink }}>{name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selected.length > 0 && (
              <div className="flex items-center gap-2 mt-4">
                <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted }}>{selected.length} added</span>
                <div className="flex" style={{ marginLeft: 2 }}>
                  {selected.map((name, i) => (
                    <div key={name} style={{ marginLeft: i === 0 ? 0 : -8, border: `2px solid ${colors.surface}`, borderRadius: 999 }}>
                      <Avatar name={name} size={24} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              disabled={!groupName.trim()}
              className="w-full rounded-full font-semibold"
              style={{
                height: 42, backgroundColor: colors.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 15,
                marginTop: 20, opacity: groupName.trim() ? 1 : 0.5,
              }}
            >
              Create group
            </button>
          </div>
        </div>

        {keyboardVisible && (
          <div
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, height: KEYBOARD_HEIGHT,
              backgroundColor: '#D4D4D8', display: 'flex', flexDirection: 'column',
            }}
          >
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#52525B' }}>simulated keyboard</span>
              <button onClick={() => setKeyboardVisible(false)} style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.ink }}>
                Hide
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
