import React from 'react';
import { Box, Chip, TextField, Menu, MenuItem } from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import SegmentedTabs from './SegmentedTabs';

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

/**
 * Sleek pass: this was two full-height labeled MUI `Select`s plus a `ToggleButtonGroup` sized to
 * MUI's defaults — visually much bigger than every other control on the redesigned pages. Now a
 * single compact trigger (matches OverviewTab's own "Jul 2026 📅" pattern) that opens a menu with
 * the same Year/Month/All choices, plus the app's shared `SegmentedTabs` for the period-vs-custom
 * toggle instead of a bespoke `ToggleButtonGroup`.
 */
const InsightScopeFilter: React.FC<Props> = ({ value, onChange }) => {
  const years = ['all', ...Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)];
  const months = ['all', ...Array.from({ length: 12 }, (_, i) => i + 1)];

  const [yearAnchor, setYearAnchor] = React.useState<null | HTMLElement>(null);
  const [monthAnchor, setMonthAnchor] = React.useState<null | HTMLElement>(null);

  const triggerSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 0.5,
    height: 28,
    px: 1.25,
    borderRadius: 999,
    border: '1px solid',
    borderColor: 'divider',
    backgroundColor: 'background.paper',
    fontFamily: 'Inter',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'text.primary',
    cursor: 'pointer',
  } as const;

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      <Box sx={{ width: 168 }}>
        <SegmentedTabs<ScopeMode>
          value={value.mode}
          onChange={(next) => onChange({ ...value, mode: next })}
          fullWidth
          size="small"
          ariaLabel="Scope mode"
          options={[
            { value: 'period', label: 'Month' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      </Box>

      {value.mode === 'period' ? (
        <>
          <Box component="button" onClick={(e) => setYearAnchor(e.currentTarget)} sx={triggerSx}>
            {value.year === 'all' ? 'All years' : value.year}
            <ExpandMoreRoundedIcon sx={{ fontSize: 16 }} />
          </Box>
          <Menu anchorEl={yearAnchor} open={Boolean(yearAnchor)} onClose={() => setYearAnchor(null)}>
            {years.map((y) => (
              <MenuItem
                key={y}
                selected={value.year === y}
                onClick={() => { onChange({ ...value, year: y as any }); setYearAnchor(null); }}
              >
                {y === 'all' ? 'All years' : y}
              </MenuItem>
            ))}
          </Menu>

          <Box component="button" onClick={(e) => setMonthAnchor(e.currentTarget)} sx={triggerSx}>
            {value.month === 'all' ? 'All months' : MONTH_NAMES[(value.month as number) - 1]}
            <ExpandMoreRoundedIcon sx={{ fontSize: 16 }} />
          </Box>
          <Menu anchorEl={monthAnchor} open={Boolean(monthAnchor)} onClose={() => setMonthAnchor(null)}>
            {months.map((m) => (
              <MenuItem
                key={m}
                selected={value.month === m}
                onClick={() => { onChange({ ...value, month: m as any }); setMonthAnchor(null); }}
              >
                {m === 'all' ? 'All months (whole year)' : MONTH_NAMES[(m as number) - 1]}
              </MenuItem>
            ))}
          </Menu>
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
            sx={{ '& .MuiInputBase-root': { height: 28 } }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            InputLabelProps={{ shrink: true }}
            value={value.endDate}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
            sx={{ '& .MuiInputBase-root': { height: 28 } }}
          />
        </>
      )}
    </Box>
  );
};

export const ScopeBadge: React.FC<{ state: InsightScopeState }> = ({ state }) => (
  <Chip size="small" icon={<EventIcon />} label={formatScopeLabel(state)} variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
);

export default InsightScopeFilter;
