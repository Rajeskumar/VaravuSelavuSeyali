import React from 'react';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Avatar from '@mui/material/Avatar';
import InputAdornment from '@mui/material/InputAdornment';
import { useTheme } from '@mui/material/styles';
import { MemberDTO } from '../../api/groups';
import { previewEqualSplit, previewPercentageSplit, previewSharesSplit, previewAdjustmentSplit } from '../../utils/splitPreview';
import { colorFromMemberId, initialsFromName } from './MemberAvatarStack';
import SegmentedTabs from '../common/SegmentedTabs';

export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares' | 'adjustment';

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
  /** Restricts which split types are selectable — defaults to all three (GroupDetailPage's
   * usage, TS-GRP-107). The receipt/quick-add flow (TS-GRP-108) passes `['equal']` only,
   * per spec §10.1's Phase-1 scope for that entry point; the tab bar is hidden entirely
   * when there's nothing to choose between. */
  allowedTypes?: SplitType[];
}

const TOLERANCE = 0.01;
const ALL_TYPES: SplitType[] = ['equal', 'exact', 'percentage', 'shares', 'adjustment'];

/**
 * Pure validity check, usable by a parent form even while this editor isn't mounted (it only
 * mounts when its popover is open) — mirrors the isValid computation below exactly.
 */
export function computeSplitValid(value: SplitEditorValue, amount: number): boolean {
  if (value.type === 'equal' || value.type === 'shares' || value.type === 'adjustment') {
    return value.entries.length > 0;
  }
  const target = value.type === 'percentage' ? 100 : amount;
  const totalEntered = value.entries.reduce((sum, e) => sum + (e.value || 0), 0);
  return Math.abs(totalEntered - target) < TOLERANCE;
}

const SplitEditor: React.FC<SplitEditorProps> = ({
  amount,
  members,
  value,
  onChange,
  onValidityChange,
  serverError,
  allowedTypes = ALL_TYPES,
}) => {
  const selectedIds = React.useMemo(() => new Set(value.entries.map((e) => e.member_id)), [value.entries]);

  const totalEntered = value.entries.reduce((sum, e) => sum + (e.value || 0), 0);
  const isValid = computeSplitValid(value, amount);

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
    if (value.type === 'shares') {
      return previewSharesSplit(
        amount,
        value.entries.map((e) => ({ member_id: e.member_id, value: e.value || 0 }))
      );
    }
    if (value.type === 'adjustment') {
      return previewAdjustmentSplit(
        amount,
        value.entries.map((e) => ({ member_id: e.member_id, value: e.value || 0 }))
      );
    }
    return previewPercentageSplit(
      amount,
      value.entries.map((e) => ({ member_id: e.member_id, value: e.value || 0 }))
    );
  }, [value, amount]);

  const theme = useTheme();

  const handleTabChange = (newType: SplitType) => {
    const participantIds = members.map((m) => m.member_id);
    const entries: SplitEditorEntry[] = participantIds.map((member_id) => ({
      member_id,
      value:
        newType === 'percentage'
          ? Math.round((100 / participantIds.length) * 100) / 100
          : newType === 'exact'
          ? Math.round((amount / participantIds.length) * 100) / 100
          : newType === 'shares'
          ? 1
          : newType === 'adjustment'
          ? 0
          : undefined,
    }));
    onChange({ type: newType, entries });
  };

  const toggleMember = (memberId: string, checked: boolean) => {
    if (checked) {
      let defaultValue: number | undefined;
      if (value.type === 'shares') defaultValue = 1;
      else if (value.type === 'adjustment' || value.type === 'exact' || value.type === 'percentage') defaultValue = 0;
      else defaultValue = undefined;
      
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
      {allowedTypes.length > 1 && (
        <Box sx={{ mb: 1.5 }}>
          <SegmentedTabs<SplitType>
            value={value.type}
            onChange={handleTabChange}
            options={([
              { value: 'equal', label: 'Equal' },
              { value: 'exact', label: 'Exact' },
              { value: 'percentage', label: 'Percentage' },
              { value: 'shares', label: 'Shares' },
              { value: 'adjustment', label: 'Adjustment' },
            ] as { value: SplitType; label: string }[]).filter((o) => allowedTypes.includes(o.value))}
          />
        </Box>
      )}

      <Box
        sx={{
          borderRadius: 1,
          overflow: 'hidden',
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        {members.map((m, idx) => {
          const checked = selectedIds.has(m.member_id);
          const entry = value.entries.find((e) => e.member_id === m.member_id);
          return (
            <Box
              key={m.member_id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                px: 1.5,
                py: 1,
                borderTop: idx === 0 ? 'none' : `1px solid ${theme.palette.divider}`,
                backgroundColor: checked ? 'transparent' : theme.palette.action.disabledBackground,
                opacity: checked ? 1 : 0.6,
              }}
            >
              <Checkbox
                checked={checked}
                onChange={(e) => toggleMember(m.member_id, e.target.checked)}
                inputProps={{ 'aria-label': `Include ${m.display_name}` }}
              />
              <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: colorFromMemberId(m.member_id) }}>
                {initialsFromName(m.display_name)}
              </Avatar>
              <Typography sx={{ flex: 1, fontWeight: 600 }}>{m.display_name}</Typography>
              {checked && value.type !== 'equal' && (
                <TextField
                  size="small"
                  type="number"
                  value={entry?.value ?? 0}
                  onChange={(e) => updateEntryValue(m.member_id, parseFloat(e.target.value) || 0)}
                  sx={{ width: 120 }}
                  inputProps={{ 'aria-label': `${value.type} for ${m.display_name}` }}
                  InputProps={
                    value.type === 'exact' || value.type === 'adjustment'
                      ? { startAdornment: <InputAdornment position="start">{value.type === 'adjustment' ? '±$' : '$'}</InputAdornment> }
                      : value.type === 'percentage'
                      ? { endAdornment: <InputAdornment position="end">%</InputAdornment> }
                      : {}
                  }
                />
              )}
              {checked && (
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 72, textAlign: 'right', fontWeight: 600 }}>
                  ${(preview[m.member_id] ?? 0).toFixed(2)}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>

      {['equal', 'shares', 'adjustment'].includes(value.type) && value.entries.length === 0 && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          Select at least one participant
        </Typography>
      )}
      {['exact', 'percentage'].includes(value.type) && !isValid && (
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
