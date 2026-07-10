import React, { useState } from 'react';
import {
  Home, Receipt, BarChart3, Users, Sun, Moon, ChevronLeft,
} from 'lucide-react';

const LIGHT = {
  canvas: '#FAFAFA', surface: '#FFFFFF', border: '#E4E4E7',
  ink: '#18181B', inkMuted: '#71717A', accent: '#3F3F9E',
};
const DARK = {
  canvas: '#09090B', surface: '#18181B', border: '#27272A',
  ink: '#FAFAFA', inkMuted: '#A1A1AA', accent: '#6D6DC7',
};
const NAV_ITEMS = [
  { label: 'Dashboard', Icon: Home }, { label: 'Expenses', Icon: Receipt },
  { label: 'Analysis', Icon: BarChart3 }, { label: 'Groups', Icon: Users },
];

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
        {NAV_ITEMS.map(({ label, Icon }) => (
          <div key={label} className="flex items-center gap-3 mb-1" style={{ padding: '9px 12px', borderRadius: 8, cursor: 'pointer' }}>
            <Icon size={18} style={{ color: c.inkMuted }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500, color: c.ink }}>{label}</span>
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
function SegmentedTabs({ c, tabs, active, onChange }) {
  const idx = tabs.indexOf(active);
  return (
    <div className="relative flex" style={{ width: 240, backgroundColor: c.border, borderRadius: 10, padding: 3, height: 34 }}>
      <div className="absolute transition-transform duration-300 ease-out" style={{ top: 3, bottom: 3, left: 3, width: 'calc(50% - 3px)', backgroundColor: c.surface, borderRadius: 8, transform: `translateX(${idx * 100}%)`, boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }} />
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t)} className="relative flex-1 z-10" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: t === active ? c.ink : c.inkMuted }}>{t}</button>
      ))}
    </div>
  );
}
function Field({ c, label, value, onChange, placeholder, type = 'text', readOnly = false }) {
  return (
    <div>
      <label style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: c.inkMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' }}>{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange && onChange(e.target.value)} placeholder={placeholder} readOnly={readOnly}
        style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: readOnly ? c.inkMuted : c.ink, backgroundColor: readOnly ? c.border : c.canvas, border: `1px solid ${c.border}`, borderRadius: 8, padding: '9px 12px', width: '100%' }}
      />
    </div>
  );
}

function ProfileTab({ c }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [venmo, setVenmo] = useState('');
  const [saved, setSaved] = useState(false);
  return (
    <div className="grid grid-cols-2 gap-8" style={{ maxWidth: 640 }}>
      <div className="flex flex-col gap-4">
        <Field c={c} label="Email" value="testlocaluser@test.app" readOnly />
        <Field c={c} label="Name" value={name} onChange={setName} placeholder="Your name" />
        <Field c={c} label="Phone" value={phone} onChange={setPhone} placeholder="Phone number" />
      </div>
      <div className="flex flex-col gap-4">
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted, marginBottom: -6 }}>Payment handles — used for Settle Up deep links</div>
        <Field c={c} label="Venmo username" value={venmo} onChange={setVenmo} placeholder="@username" />
        <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1500); }} className="rounded-full font-semibold" style={{ height: 40, backgroundColor: c.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 14, marginTop: 8 }}>
          {saved ? 'Saved ✓' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
function FeedbackTab({ c }) {
  const [email, setEmail] = useState('');
  const [idea, setIdea] = useState('');
  const [submitted, setSubmitted] = useState(false);
  if (submitted) {
    return (
      <div style={{ maxWidth: 480 }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: c.ink, marginBottom: 6 }}>Thanks — got it.</div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: c.inkMuted }}>We read every idea. If we follow up, it'll be at the email you gave.</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" style={{ maxWidth: 420 }}>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: c.inkMuted }}>Got an idea to make TrackSpense better? We'd love to hear it.</div>
      <Field c={c} label="Contact email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
      <div>
        <label style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: c.inkMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' }}>Your idea</label>
        <textarea value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="What should we build or fix?" style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: c.ink, backgroundColor: c.canvas, border: `1px solid ${c.border}`, borderRadius: 8, padding: '9px 12px', width: '100%', minHeight: 100, resize: 'none' }} />
      </div>
      <button onClick={() => { if (email.trim() && idea.trim()) setSubmitted(true); }} disabled={!email.trim() || !idea.trim()} className="rounded-full font-semibold" style={{ height: 40, backgroundColor: c.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 14, opacity: !email.trim() || !idea.trim() ? 0.5 : 1 }}>
        Submit request
      </button>
    </div>
  );
}

export default function DesktopAccount() {
  const [dark, setDark] = useState(false);
  const c = dark ? DARK : LIGHT;
  const [tab, setTab] = useState('Profile');

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
            <div className="flex items-center gap-2 mb-6">
              <ChevronLeft size={20} style={{ color: c.ink, cursor: 'pointer' }} />
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: c.ink }}>Account</span>
            </div>
            <div className="mb-6"><SegmentedTabs c={c} tabs={['Profile', 'Feedback']} active={tab} onChange={setTab} /></div>
            {tab === 'Profile' ? <ProfileTab c={c} /> : <FeedbackTab c={c} />}
          </div>
        </div>

        <Footer c={c} />
      </div>
    </div>
  );
}
