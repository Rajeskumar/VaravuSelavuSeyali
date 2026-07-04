import React from 'react';
import { Box, Chip, FormControl, InputLabel, Select, MenuItem, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import EventIcon from '@mui/icons-material/Event';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type ScopeMode = 'period' | 'custom';

export interface InsightScopeState {
  mode: ScopeMode;
  year: number | 'all';
  month: number | 'all';
  startDate: string;
  endDate: string;
}

export function defaultInsightScopeState(): InsightScopeState {
  const now = new Date();
  return {
    mode: 'period',
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    startDate: '',
    endDate: '',
  };
}

/** Resolves the current UI state into backend-ready date filters. */
export function resolveScopeFilters(state: InsightScopeState) {
  if (state.mode === 'custom' && state.startDate && state.endDate) {
    return { start_date: state.startDate, end_date: state.endDate };
  }
  return {
    year: state.year === 'all' ? undefined : Number(state.year),
    month: state.month === 'all' ? undefined : Number(state.month),
  };
}

/** Human-readable label for a scope badge, e.g. "Jul 2026", "2026", "All time", "Jan 1 – Mar 31, 2026". */
export function formatScopeLabel(state: InsightScopeState): string {
  if (state.mode === 'custom' && state.startDate && state.endDate) {
    // Parse the YYYY-MM-DD parts directly rather than `new Date(str)`, which
    // treats the string as UTC midnight and can shift a day off in local time.
    const fmt = (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };
    return `${fmt(state.startDate)} – ${fmt(state.endDate)}`;
  }
  if (state.year === 'all') return 'All time';
  if (state.month === 'all') return String(state.year);
  return `${MONTH_NAMES[(state.month as number) - 1]} ${state.year}`;
}

interface Props {
  value: InsightScopeState;
  onChange: (next: InsightScopeState) => void;
}

const InsightScopeFilter: React.FC<Props> = ({ value, onChange }) => {
  const years = ['all', ...Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)];
  const months = ['all', ...Array.from({ length: 12 }, (_, i) => i + 1)];

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={value.mode}
        onChange={(_, next) => next && onChange({ ...value, mode: next })}
      >
        <ToggleButton value="period">Month</ToggleButton>
        <ToggleButton value="custom">Custom range</ToggleButton>
      </ToggleButtonGroup>

      {value.mode === 'period' ? (
        <>
          <FormControl size="small">
            <InputLabel>Year</InputLabel>
            <Select value={value.year} label="Year" onChange={(e) => onChange({ ...value, year: e.target.value as any })}>
              {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Month</InputLabel>
            <Select value={value.month} label="Month" onChange={(e) => onChange({ ...value, month: e.target.value as any })}>
              {months.map((m) => (
                <MenuItem key={m} value={m}>{m === 'all' ? 'All' : MONTH_NAMES[(m as number) - 1]}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </>
      ) : (
        <>
          <TextField
            size="small"
            type="date"
            label="From"
            InputLabelProps={{ shrink: true }}
            value={value.startDate}
            onChange={(e) => onChange({ ...value, startDate: e.target.value })}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            InputLabelProps={{ shrink: true }}
            value={value.endDate}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
          />
        </>
      )}
    </Box>
  );
};

export const ScopeBadge: React.FC<{ state: InsightScopeState }> = ({ state }) => (
  <Chip size="small" icon={<EventIcon />} label={formatScopeLabel(state)} variant="outlined" />
);

export default InsightScopeFilter;
