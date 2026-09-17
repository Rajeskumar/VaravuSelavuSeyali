import React from 'react';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useTheme } from '@mui/material/styles';
import { withAlpha } from '../../theme';

interface SegmentedTabsOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedTabsOption<T>[];
  fullWidth?: boolean;
  size?: 'small' | 'medium';
  ariaLabel?: string;
}

/** A pill-shaped segmented control — the modern alternative to MUI's default
 * underlined Tabs, used wherever a small set of mutually-exclusive views need
 * switching (Expenses/Balances, split type, etc).
 *
 * Sized between two prior, opposing pieces of feedback: MUI's default `ToggleButtonGroup`
 * (~40-42px tall, 14px font) was flagged as an oversized "slider," which led to a compact pass
 * down to 28-32px/11-12px — a later design review then called that too small to read
 * comfortably. `medium` now lands at 36px/13px and `compact` at 30px/12px, splitting the
 * difference in both directions rather than re-litigating one extreme into the other. */
function SegmentedTabs<T extends string>({ value, onChange, options, fullWidth, size = 'medium', ariaLabel }: SegmentedTabsProps<T>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const compact = size === 'small';

  return (
    <ToggleButtonGroup
      exclusive
      value={value}
      onChange={(_, next) => next && onChange(next)}
      fullWidth={fullWidth}
      aria-label={ariaLabel}
      sx={{
        p: '3px',
        height: compact ? 30 : 36,
        borderRadius: `${theme.shape.borderRadius}px`,
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        border: 'none',
        gap: 0.25,
        '& .MuiToggleButton-root': {
          position: 'relative',
          border: 'none',
          borderRadius: `${Math.max(Number(theme.shape.borderRadius) - 2, 4)}px`,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: compact ? '0.75rem' : '0.8125rem',
          lineHeight: 1,
          px: compact ? 1.25 : 1.5,
          py: 0,
          color: 'text.secondary',
          // Touch target: the pill stays visually 30-36px tall (still under 44px), so the
          // tappable area is expanded to the 44×44 WCAG minimum via an invisible centered hit
          // area rather than growing the pill further.
          '&::after': {
            content: '""',
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 44,
            height: 44,
          },
          '&.Mui-selected': {
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.primary.main,
            boxShadow: isDark ? '0 1px 3px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.08)',
            '&:hover': {
              backgroundColor: theme.palette.background.paper,
            },
          },
          '&:hover': {
            backgroundColor: withAlpha(theme.palette.text.primary, 0.04),
          },
        },
      }}
    >
      {options.map((opt) => (
        <ToggleButton key={opt.value} value={opt.value}>
          {opt.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export default SegmentedTabs;
