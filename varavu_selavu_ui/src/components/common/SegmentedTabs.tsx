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
 * Sleek/compact pass: sized to match the reference prototypes' 30-34px-tall lens/
 * sub-tab bars (`LensSwitch`/`SubTabBar` in `docs/design/prototypes/v2/**`) instead
 * of MUI's much taller default `ToggleButtonGroup` control — this was the "slider"
 * flagged as too big/rounded on Dashboard, Expenses, Analysis, and Groups. */
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
        height: compact ? 28 : 32,
        borderRadius: `${theme.shape.borderRadius}px`,
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        border: 'none',
        gap: 0.25,
        '& .MuiToggleButton-root': {
          border: 'none',
          borderRadius: `${Math.max(Number(theme.shape.borderRadius) - 2, 4)}px`,
          textTransform: 'none',
          fontWeight: 600,
          fontSize: compact ? '0.6875rem' : '0.75rem',
          lineHeight: 1,
          px: compact ? 1.25 : 1.5,
          py: 0,
          color: 'text.secondary',
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
