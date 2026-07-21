import React from 'react';
import Box from '@mui/material/Box';
import { keyframes, useTheme } from '@mui/material/styles';
import { cerebro, cerebroTokens, typeScale, withAlpha } from '../../theme';

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

type StatusBadgeTone = 'violet' | 'cyan' | 'positive' | 'negative' | 'caution' | 'neutral';

interface StatusBadgeProps {
  label: string;
  tone?: StatusBadgeTone;
  /** Small dot to the left of the label, pulsing 1↔0.35 opacity over 2s. Use for "live"/"active" states. */
  pulse?: boolean;
}

/** Pill status indicator (CerebroOS design system §3) — mono uppercase label, optional pulsing dot. */
function StatusBadge({ label, tone = 'cyan', pulse: showPulse = false }: StatusBadgeProps) {
  const theme = useTheme();
  const t = cerebroTokens(theme.palette.mode);
  const toneColor: Record<StatusBadgeTone, string> = {
    violet: t.violetAccentHex,
    cyan: t.cyanAccentHex,
    positive: t.positive,
    negative: t.negative,
    caution: t.caution,
    neutral: t.textSecondary,
  };
  const color = toneColor[tone];

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        color,
        backgroundColor: withAlpha(color, 0.08),
        border: `1px solid ${withAlpha(color, 0.25)}`,
        borderRadius: cerebro.radius.pill,
        px: '18px',
        py: '8px',
        ...typeScale.eyebrow,
      }}
    >
      {showPulse && (
        <Box
          component="span"
          sx={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: color,
            animation: `${pulse} 2s ease-in-out infinite`,
          }}
        />
      )}
      {label}
    </Box>
  );
}

export default StatusBadge;
