import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';

const colors = {
  canvas: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#E4E4E7',
  ink: '#18181B',
  inkMuted: '#71717A',
  accent: '#3F3F9E',
  positive: '#15803D',
};

function SegmentedTabs({ tabs, active, onChange }) {
  const idx = tabs.indexOf(active);
  return (
    <div className="relative flex w-full" style={{ backgroundColor: colors.border, borderRadius: 10, padding: 3, height: 34 }}>
      <div className="absolute transition-transform duration-300 ease-out" style={{ top: 3, bottom: 3, left: 3, width: 'calc(50% - 3px)', backgroundColor: colors.surface, borderRadius: 8, transform: `translateX(${idx * 100}%)`, boxShadow: '0 1px 2px rgba(24,24,27,0.10)' }} />
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange(t)} className="relative flex-1 z-10" style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: t === active ? colors.ink : colors.inkMuted }}>{t}</button>
      ))}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', readOnly = false }) {
  return (
    <div>
      <label style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' }}>
        {label}
      </label>
      <input
        type={type} value={value} onChange={(e) => onChange && onChange(e.target.value)} placeholder={placeholder} readOnly={readOnly}
        style={{
          fontFamily: "'Inter', sans-serif", fontSize: 14, color: readOnly ? colors.inkMuted : colors.ink,
          backgroundColor: readOnly ? colors.border : colors.canvas, border: `1px solid ${colors.border}`, borderRadius: 8,
          padding: '9px 12px', width: '100%',
        }}
      />
    </div>
  );
}

function ProfileTab() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [venmo, setVenmo] = useState('');
  const [paypal, setPaypal] = useState('');
  const [upi, setUpi] = useState('');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="px-5 pt-4 pb-6 flex flex-col gap-4">
      <Field label="Email" value="testlocaluser@test.app" readOnly />
      <Field label="Name" value={name} onChange={setName} placeholder="Your name" />
      <Field label="Phone" value={phone} onChange={setPhone} placeholder="Phone number" />
      <Field label="Address" value={address} onChange={setAddress} placeholder="Street address" />

      <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 14, marginTop: 4 }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: colors.inkMuted, marginBottom: 12 }}>
          Payment handles — used to build Settle Up deep links
        </div>
        <div className="flex flex-col gap-4">
          <Field label="Venmo username" value={venmo} onChange={setVenmo} placeholder="@username" />
          <Field label="PayPal.me username" value={paypal} onChange={setPaypal} placeholder="username" />
          <Field label="UPI ID" value={upi} onChange={setUpi} placeholder="name@bank" />
        </div>
      </div>

      <button onClick={handleSave} className="w-full rounded-full font-semibold mt-2" style={{ height: 40, backgroundColor: colors.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 14 }}>
        {saved ? 'Saved ✓' : 'Save changes'}
      </button>
    </div>
  );
}

function FeedbackTab() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [idea, setIdea] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    if (!email.trim() || !idea.trim()) return;
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="px-5 pt-10 flex flex-col items-center text-center">
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 600, color: colors.ink, marginBottom: 6 }}>Thanks — got it.</div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>We read every idea. If we follow up, it'll be at the email you gave.</div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-4 pb-6 flex flex-col gap-4">
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted }}>
        Got an idea to make TrackSpense better? We'd love to hear it.
      </div>
      <Field label="Your name (optional)" value={name} onChange={setName} placeholder="Name" />
      <Field label="Contact email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
      <div>
        <label style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, color: colors.inkMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'block' }}>Your idea</label>
        <textarea
          value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="What should we build or fix?"
          style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.ink, backgroundColor: colors.canvas, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 12px', width: '100%', minHeight: 110, resize: 'none' }}
        />
      </div>
      <button onClick={handleSubmit} disabled={!email.trim() || !idea.trim()} className="w-full rounded-full font-semibold mt-2"
        style={{ height: 40, backgroundColor: colors.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 14, opacity: !email.trim() || !idea.trim() ? 0.5 : 1 }}>
        Submit request
      </button>
    </div>
  );
}

export default function Account() {
  const [tab, setTab] = useState('Profile');
  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#E4E4E7' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 800, backgroundColor: colors.canvas }}>
        <div className="px-5 pt-6 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <ChevronLeft size={20} style={{ color: colors.ink }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: colors.ink }}>Account</span>
          </div>
          <SegmentedTabs tabs={['Profile', 'Feedback']} active={tab} onChange={setTab} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {tab === 'Profile' ? <ProfileTab /> : <FeedbackTab />}
        </div>
      </div>
    </div>
  );
}
