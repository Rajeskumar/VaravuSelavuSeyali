import React from 'react';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import { MemberDTO } from '../../api/groups';
import { previewEqualSplit, previewPercentageSplit } from '../../utils/splitPreview';

export type SplitType = 'equal' | 'exact' | 'percentage';

export interface SplitEditorEntry {
  member_id: string;
  value?: number;
}

export interface SplitEditorValue {
  type: SplitType;
  entries: SplitEditorEntry[];
}

interface SplitEditorProps {
  amount: number;
  members: MemberDTO[];
  value: SplitEditorValue;
  onChange: (value: SplitEditorValue) => void;
  /** Reports whether the current split reconciles, so the parent form can gate its own Submit button. */
  onValidityChange?: (valid: boolean) => void;
  /** Backend 400 message (e.g. from a SplitError), shown inline in addition to local validation. */
  serverError?: string | null;
}

const TOLERANCE = 0.01;

const SplitEditor: React.FC<SplitEditorProps> = ({ amount, members, value, onChange, onValidityChange, serverError }) => {
  const selectedIds = React.useMemo(() => new Set(value.entries.map((e) => e.member_id)), [value.entries]);

  const totalEntered = value.entries.reduce((sum, e) => sum + (e.value || 0), 0);
  const target = value.type === 'percentage' ? 100 : value.type === 'exact' ? amount : null;
  const isValid =
    value.type === 'equal' ? value.entries.length > 0 : target !== null && Math.abs(totalEntered - target) < TOLERANCE;

  React.useEffect(() => {
    onValidityChange?.(isValid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid]);

  const preview: Record<string, number> = React.useMemo(() => {
    if (value.type === 'equal') {
      return previewEqualSplit(amount, value.entries.map((e) => e.member_id));
    }
    if (value.type === 'exact') {
      const out: Record<string, number> = {};
      value.entries.forEach((e) => {
        out[e.member_id] = e.value || 0;
      });
      return out;
    }
    return previewPercentageSplit(
      amount,
      value.entries.map((e) => ({ member_id: e.member_id, value: e.value || 0 }))
    );
  }, [value, amount]);

  const handleTabChange = (_: React.SyntheticEvent, newType: SplitType) => {
    const participantIds = members.map((m) => m.member_id);
    const entries: SplitEditorEntry[] = participantIds.map((member_id) => ({
      member_id,
      value:
        newType === 'percentage'
          ? Math.round((100 / participantIds.length) * 100) / 100
          : newType === 'exact'
          ? Math.round((amount / participantIds.length) * 100) / 100
          : undefined,
    }));
    onChange({ type: newType, entries });
  };

  const toggleMember = (memberId: string, checked: boolean) => {
    if (checked) {
      const defaultValue = value.type === 'equal' ? undefined : 0;
      onChange({ ...value, entries: [...value.entries, { member_id: memberId, value: defaultValue }] });
    } else {
      onChange({ ...value, entries: value.entries.filter((e) => e.member_id !== memberId) });
    }
  };

  const updateEntryValue = (memberId: string, newValue: number) => {
    onChange({
      ...value,
      entries: value.entries.map((e) => (e.member_id === memberId ? { ...e, value: newValue } : e)),
    });
  };

  return (
    <Box>
      <Tabs value={value.type} onChange={handleTabChange} sx={{ mb: 1 }}>
        <Tab label="Equal" value="equal" />
        <Tab label="Exact" value="exact" />
        <Tab label="Percentage" value="percentage" />
      </Tabs>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {members.map((m) => {
          const checked = selectedIds.has(m.member_id);
          const entry = value.entries.find((e) => e.member_id === m.member_id);
          return (
            <Box key={m.member_id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox
                checked={checked}
                onChange={(e) => toggleMember(m.member_id, e.target.checked)}
                inputProps={{ 'aria-label': `Include ${m.display_name}` }}
              />
              <Typography sx={{ flex: 1 }}>{m.display_name}</Typography>
              {checked && value.type !== 'equal' && (
                <TextField
                  size="small"
                  type="number"
                  value={entry?.value ?? 0}
                  onChange={(e) => updateEntryValue(m.member_id, parseFloat(e.target.value) || 0)}
                  sx={{ width: 130 }}
                  inputProps={{ 'aria-label': `${value.type === 'exact' ? 'Amount' : 'Percentage'} for ${m.display_name}` }}
                  InputProps={
                    value.type === 'exact'
                      ? { startAdornment: <InputAdornment position="start">$</InputAdornment> }
                      : { endAdornment: <InputAdornment position="end">%</InputAdornment> }
                  }
                />
              )}
              {checked && (
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 72, textAlign: 'right' }}>
                  ${(preview[m.member_id] ?? 0).toFixed(2)}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>

      {value.type === 'equal' && value.entries.length === 0 && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          Select at least one participant
        </Typography>
      )}
      {value.type !== 'equal' && !isValid && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {value.type === 'percentage'
            ? `Percentages must total 100 (currently ${totalEntered.toFixed(2)})`
            : `Exact amounts must total $${amount.toFixed(2)} (currently $${totalEntered.toFixed(2)})`}
        </Typography>
      )}
      {isValid && (
        <Typography color="success.main" variant="body2" sx={{ mt: 1 }}>
          Split reconciles ✓
        </Typography>
      )}
      {serverError && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {serverError}
        </Typography>
      )}
    </Box>
  );
};

export default SplitEditor;
