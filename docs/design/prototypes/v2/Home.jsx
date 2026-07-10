import React from 'react';
import { ArrowRight } from 'lucide-react';

const colors = {
  canvas: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#E4E4E7',
  ink: '#18181B',
  inkMuted: '#71717A',
  accent: '#3F3F9E',
  positive: '#15803D',
};

const categoryColors = { 'Food & Drink': '#B4694A', Home: '#6B7A99', Transportation: '#5C8C82' };

function DashboardPreview() {
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface, boxShadow: '0 8px 24px rgba(24,24,27,0.08)' }}>
      <div className="px-4 pt-4 pb-4">
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: colors.inkMuted, textTransform: 'uppercase', marginBottom: 8 }}>
          July 2026
        </div>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 30, color: colors.ink, fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
          $2,190.10
        </div>
        <div className="flex justify-center mb-3">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, color: colors.inkMuted }}>1 group still settling</span>
        </div>
        <div className="flex w-full mb-3" style={{ backgroundColor: colors.border, borderRadius: 999, padding: 2, height: 20 }}>
          <div style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 600, color: colors.ink, boxShadow: '0 1px 2px rgba(24,24,27,0.08)' }}>My Expenses</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif", fontSize: 9, color: colors.inkMuted }}>I Paid</div>
        </div>
        <div className="flex w-full mb-2" style={{ height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.border }}>
          <div style={{ width: '36%', backgroundColor: categoryColors['Food & Drink'] }} />
          <div style={{ width: '25%', backgroundColor: categoryColors.Home }} />
          <div style={{ width: '19%', backgroundColor: categoryColors.Transportation }} />
        </div>
        <div style={{ backgroundColor: colors.canvas, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 8 }}>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 600, color: colors.ink }}>Weekend Trip</div>
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, color: '#B45309', fontWeight: 600, marginTop: 2 }}>$162.00 pending</div>
        </div>
      </div>
    </div>
  );
}

function AnalysisPreview() {
  const bars = [0.62, 0.68, 0.55, 0.75, 0.61, 0.79];
  const cats = [
    { name: 'Food & Drink', pct: 36, amt: '$780.40' },
    { name: 'Home', pct: 25, amt: '$540.00' },
    { name: 'Transportation', pct: 19, amt: '$410.00' },
  ];
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface, boxShadow: '0 8px 24px rgba(24,24,27,0.08)' }}>
      <div className="px-4 pt-4 pb-4">
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>Analysis</div>
        <div className="flex items-baseline justify-between mb-2">
          <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.05em', color: colors.inkMuted }}>2026 YTD</span>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink }}>$13,263</span>
        </div>
        <div className="flex items-end gap-1 mb-3" style={{ height: 32 }}>
          {bars.map((v, i) => (
            <div key={i} style={{ flex: 1, height: `${v * 100}%`, borderRadius: 2, backgroundColor: i === bars.length - 1 ? colors.accent : colors.border }} />
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          {cats.map((c) => (
            <div key={c.name} className="flex items-center gap-1.5">
              <div style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: categoryColors[c.name] }} />
              <span style={{ flex: 1, fontFamily: "'Inter', sans-serif", fontSize: 9, color: colors.ink }}>{c.name}</span>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 600, color: colors.ink }}>{c.amt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AskPreview() {
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface, boxShadow: '0 8px 24px rgba(24,24,27,0.08)' }}>
      <div className="px-4 pt-4 pb-4">
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 700, color: colors.ink, marginBottom: 10 }}>AI Analyst</div>
        <div className="flex flex-col gap-2">
          <div style={{ alignSelf: 'flex-end', maxWidth: '78%', backgroundColor: colors.ink, color: '#fff', borderRadius: 10, padding: '6px 10px', fontFamily: "'Inter', sans-serif", fontSize: 10 }}>
            How much on dining this month?
          </div>
          <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
            <div style={{ backgroundColor: colors.canvas, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '6px 10px', fontFamily: "'Inter', sans-serif", fontSize: 10, color: colors.ink, lineHeight: 1.4 }}>
              $142.30 across 9 visits — about 32% more than usual.
            </div>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 8, color: colors.inkMuted, marginTop: 3, marginLeft: 2, display: 'block' }}>Looked at: July 2026 · My Expenses</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen flex justify-center py-6" style={{ backgroundColor: '#E4E4E7' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div className="w-full flex flex-col rounded-3xl overflow-hidden shadow-2xl" style={{ maxWidth: 384, height: 800, backgroundColor: colors.canvas }}>
        <div className="px-5 pt-6 pb-2 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: colors.accent }} />
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 17, fontWeight: 700, color: colors.ink }}>TrackSpense</span>
          </div>
          <button style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, color: colors.ink, border: `1px solid ${colors.border}`, borderRadius: 999, padding: '6px 14px' }}>
            Login
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center px-6 pt-6 pb-8 text-center">
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 32, color: colors.ink, lineHeight: 1.15 }}>Track less.</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 32, color: colors.accent, lineHeight: 1.15, marginBottom: 14 }}>Understand more.</div>
            <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: colors.inkMuted, lineHeight: 1.6, marginBottom: 24, maxWidth: 280 }}>
              A calm, fast, privacy-first companion for everyday money decisions. No ads, no clutter — just clarity.
            </p>
            <button className="flex items-center gap-2 rounded-full font-semibold mb-3" style={{ height: 44, padding: '0 24px', backgroundColor: colors.accent, color: '#fff', fontFamily: "'Inter', sans-serif", fontSize: 15 }}>
              Open Dashboard <ArrowRight size={16} />
            </button>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, marginBottom: 28 }}>See how it works ↓</span>
          </div>

          <div className="flex flex-col items-center px-6 pb-6" style={{ gap: 36 }}>
            <div className="w-full flex flex-col items-center" style={{ maxWidth: 240 }}>
              <DashboardPreview />
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink, marginTop: 16, marginBottom: 4, textAlign: 'center' }}>
                One ledger for everything
              </div>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, lineHeight: 1.55, textAlign: 'center' }}>
                Personal spending and every group you split with, combined into one number — no more adding things up across apps.
              </p>
            </div>

            <div className="w-full flex flex-col items-center" style={{ maxWidth: 240 }}>
              <AnalysisPreview />
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink, marginTop: 16, marginBottom: 4, textAlign: 'center' }}>
                See exactly where it goes
              </div>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, lineHeight: 1.55, textAlign: 'center' }}>
                Year-to-date totals, six-month trends, and a category breakdown that actually explains itself — not just numbers in a table.
              </p>
            </div>

            <div className="w-full flex flex-col items-center" style={{ maxWidth: 240 }}>
              <AskPreview />
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, color: colors.ink, marginTop: 16, marginBottom: 4, textAlign: 'center' }}>
                Ask, in plain English
              </div>
              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: colors.inkMuted, lineHeight: 1.55, textAlign: 'center' }}>
                "How much did I spend on dining this month?" Ask from anywhere in the app and get a real answer pulled from your own data.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
