import React from 'react';
import { ArrowRight } from 'lucide-react';

const c = {
  canvas: '#FAFAFA', surface: '#FFFFFF', border: '#E4E4E7',
  ink: '#18181B', inkMuted: '#71717A', accent: '#3F3F9E', positive: '#15803D',
};
const categoryColors = { 'Food & Drink': '#B4694A', Home: '#6B7A99', Transportation: '#5C8C82' };

function DashboardPreview() {
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 14, overflow: 'hidden', backgroundColor: c.surface, boxShadow: '0 8px 24px rgba(24,24,27,0.08)' }}>
      <div className="px-4 pt-4 pb-4">
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: c.inkMuted, textTransform: 'uppercase', marginBottom: 8 }}>July 2026</div>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 26, color: c.ink, fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>$2,190.10</div>
        <div className="flex justify-center mb-3"><span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: c.inkMuted }}>1 group still settling</span></div>
        <div className="flex w-full mb-2" style={{ height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: c.border }}>
          <div style={{ width: '46%', backgroundColor: categoryColors['Food & Drink'] }} />
          <div style={{ width: '30%', backgroundColor: categoryColors.Home }} />
          <div style={{ width: '24%', backgroundColor: categoryColors.Transportation }} />
        </div>
        <div style={{ backgroundColor: c.canvas, border: `1px solid ${c.border}`, borderRadius: 8, padding: 8, marginTop: 8 }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 600, color: c.ink }}>Weekend Trip</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: '#B45309', fontWeight: 600, marginTop: 2 }}>$162.00 pending</div>
        </div>
      </div>
    </div>
  );
}
function AnalysisPreview() {
  const bars = [0.62, 0.68, 0.55, 0.75, 0.61, 0.79];
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 14, overflow: 'hidden', backgroundColor: c.surface, boxShadow: '0 8px 24px rgba(24,24,27,0.08)' }}>
      <div className="px-4 pt-4 pb-4">
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: c.ink, marginBottom: 8 }}>Analysis</div>
        <div className="flex items-baseline justify-between mb-2">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.05em', color: c.inkMuted }}>2026 YTD</span>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 600, color: c.ink }}>$13,263</span>
        </div>
        <div className="flex items-end gap-1" style={{ height: 30 }}>
          {bars.map((v, i) => <div key={i} style={{ flex: 1, height: `${v * 100}%`, borderRadius: 2, backgroundColor: i === bars.length - 1 ? c.accent : c.border }} />)}
        </div>
      </div>
    </div>
  );
}
function AskPreview() {
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 14, overflow: 'hidden', backgroundColor: c.surface, boxShadow: '0 8px 24px rgba(24,24,27,0.08)' }}>
      <div className="px-4 pt-4 pb-4">
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: c.ink, marginBottom: 10 }}>AI Analyst</div>
        <div style={{ alignSelf: 'flex-end', maxWidth: '78%', backgroundColor: c.ink, color: '#fff', borderRadius: 10, padding: '6px 10px', fontFamily: "'Inter', sans-serif", fontSize: 10, marginLeft: 'auto', marginBottom: 6 }}>
          How much on dining?
        </div>
        <div style={{ backgroundColor: c.canvas, border: `1px solid ${c.border}`, borderRadius: 10, padding: '6px 10px', fontFamily: "'Inter', sans-serif", fontSize: 10, color: c.ink, lineHeight: 1.4, maxWidth: '85%' }}>
          $142.30 across 9 visits — 32% more than usual.
        </div>
      </div>
    </div>
  );
}

const pages = [
  { Preview: DashboardPreview, title: 'One ledger for everything', body: 'Personal spending and every group you split with, combined into one number — no more adding things up across apps.' },
  { Preview: AnalysisPreview, title: 'See exactly where it goes', body: 'Year-to-date totals, six-month trends, and a category breakdown that actually explains itself — not just numbers in a table.' },
  { Preview: AskPreview, title: 'Ask, in plain English', body: '"How much did I spend on dining this month?" Ask from anywhere in the app and get a real answer pulled from your own data.' },
];

export default function DesktopHome() {
  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#E4E4E7' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col overflow-hidden rounded-2xl shadow-2xl" style={{ maxWidth: 1120, height: 700, backgroundColor: c.canvas }}>

        <div className="flex items-center justify-between px-6 flex-shrink-0" style={{ height: 58, borderBottom: `1px solid ${c.border}`, backgroundColor: c.surface }}>
          <div className="flex items-center gap-2">
            <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: c.accent }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 700, color: c.ink }}>TrackSpense</span>
          </div>
          <button style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: c.ink, border: `1px solid ${c.border}`, borderRadius: 999, padding: '7px 16px' }}>Login</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center px-6 pt-10 pb-10 text-center">
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 42, color: c.ink, lineHeight: 1.1 }}>Track less.</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 42, color: c.accent, lineHeight: 1.1, marginBottom: 16 }}>Understand more.</div>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, color: c.inkMuted, lineHeight: 1.6, marginBottom: 28, maxWidth: 440 }}>
              A calm, fast, privacy-first companion for everyday money decisions. No ads, no clutter — just clarity.
            </p>
            <button className="flex items-center gap-2 rounded-full font-semibold" style={{ height: 46, padding: '0 26px', backgroundColor: c.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 15 }}>
              Open Dashboard <ArrowRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-8 px-10 pb-10">
            {pages.map(({ Preview, title, body }) => (
              <div key={title} className="flex flex-col items-center text-center">
                <div style={{ width: '100%', maxWidth: 220 }}><Preview /></div>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: c.ink, marginTop: 16, marginBottom: 4 }}>{title}</div>
                <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: c.inkMuted, lineHeight: 1.55, maxWidth: 240 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 flex-shrink-0" style={{ height: 44, borderTop: `1px solid ${c.border}`, backgroundColor: c.surface }}>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>Privacy · Terms · Help</span>
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: c.inkMuted }}>© 2026 TrackSpense</span>
        </div>
      </div>
    </div>
  );
}
