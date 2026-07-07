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
 * switching (Expenses/Balances, split type, etc). */
function SegmentedTabs<T extends string>({ value, onChange, options, fullWidth, size = 'medium', ariaLabel }: SegmentedTabsProps<T>) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <ToggleButtonGroup
      exclusive
      value={value}
      onChange={(_, next) => next && onChange(next)}
      size={size}
      fullWidth={fullWidth}
      aria-label={ariaLabel}
      sx={{
        p: 0.5,
        borderRadius: 980,
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        border: 'none',
        gap: 0.5,
        '& .MuiToggleButton-root': {
          border: 'none',
          borderRadius: 980,
          textTransform: 'none',
          fontWeight: 600,
          px: 2.5,
          color: 'text.secondary',
          '&.Mui-selected': {
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.primary.main,
            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.08)',
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
