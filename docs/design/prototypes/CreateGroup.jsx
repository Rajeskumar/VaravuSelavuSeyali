import React, { useState } from 'react';
import { X } from 'lucide-react';

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

const ALL_CONTACTS = ['Ana', 'Marco', 'Priya', 'Sam', 'Jess'];
const CONTACT_COLORS = { Ana: '#7E8CA3', Marco: '#B98CC2', Priya: '#A3A86B', Sam: '#C97B4D', Jess: '#5E9C8F' };
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
    fontFamily: "'Inter', sans-serif", fontSize: 15, color: colors.ink, backgroundColor: colors.paper,
    border: `1px solid ${colors.hairline}`, borderRadius: 10, padding: '10px 12px', width: '100%',
  };
  const labelStyle = {
    fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.inkMuted,
    textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block',
  };

  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#DADAD5' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 780, backgroundColor: colors.paper, position: 'relative' }}>
        <div className="px-5 pt-6" style={{ opacity: 0.35 }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: colors.ink }}>Groups</span>
        </div>
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(25,26,30,0.35)' }} />

        <div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: keyboardVisible ? KEYBOARD_HEIGHT : 0,
            backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            transition: 'bottom 250ms ease-out', maxHeight: '72%', display: 'flex', flexDirection: 'column',
            boxShadow: '0 -6px 24px rgba(0,0,0,0.15)',
          }}
        >
          <div className="px-5 pt-3 pb-6 overflow-y-auto">
            <div className="mx-auto mb-3 rounded-full" style={{ width: 36, height: 4, backgroundColor: colors.hairline }} />
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: colors.ink }}>Create group</span>
              <button style={{ color: colors.inkMuted }}><X size={20} /></button>
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
                        padding: '5px 10px 5px 5px', borderRadius: 999,
                        border: `1px solid ${isSel ? colors.jade : colors.hairline}`,
                        backgroundColor: isSel ? 'rgba(15,163,127,0.06)' : colors.surface,
                      }}
                    >
                      <Avatar name={name} size={20} />
                      <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: colors.ink }}>{name}</span>
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
                    <div key={name} style={{ marginLeft: i === 0 ? 0 : -8 }}><Avatar name={name} size={24} /></div>
                  ))}
                </div>
              </div>
            )}

            <button
              disabled={!groupName.trim()}
              className="w-full rounded-full py-3 font-semibold"
              style={{
                backgroundColor: colors.jade, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 15,
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
              backgroundColor: '#C7C7C2', display: 'flex', flexDirection: 'column',
            }}
          >
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: '#5b5b56' }}>simulated keyboard</span>
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
