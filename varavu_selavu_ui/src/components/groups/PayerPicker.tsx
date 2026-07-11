import React from 'react';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useTheme } from '@mui/material/styles';
import { MemberDTO, PayerSummaryItem } from '../../api/groups';
import { colorFromMemberId, initialsFromName } from './MemberAvatarStack';

interface PayerPickerProps {
  amount: number;
  members: MemberDTO[];
  payers: PayerSummaryItem[];
  onChange: (payers: PayerSummaryItem[]) => void;
  onValidityChange?: (valid: boolean) => void;
}

const TOLERANCE = 0.01;

/**
 * Pure validity check, usable by a parent form even while this picker isn't mounted (it only
 * mounts when its popover is open). Single-payer selection always sets amount_paid === amount
 * (see selectSinglePayer below) and the parent keeps it in sync when amount changes, so "sum
 * of payers equals total" is correct for both single- and multiple-payer mode without needing
 * to know which mode is active.
 */
export function computePayersValid(payers: PayerSummaryItem[], amount: number): boolean {
  const total = payers.reduce((sum, p) => sum + p.amount_paid, 0);
  return Math.abs(total - amount) < TOLERANCE;
}

/**
 * Splitwise-style payer picker (TS-GRP redesign) — defaults to a single-select list (tap a
 * name = they paid the full amount) instead of always showing per-person checkboxes and
 * amount fields. "Multiple people" switches to that fuller editor for the uncommon case.
 */
const PayerPicker: React.FC<PayerPickerProps> = ({
  amount,
  members,
  payers,
  onChange,
  onValidityChange,
}) => {
  const theme = useTheme();
  const [mode, setMode] = React.useState<'single' | 'multiple'>(payers.length > 1 ? 'multiple' : 'single');
  const selectedIds = React.useMemo(() => new Set(payers.map((p) => p.member_id)), [payers]);

  const totalEntered = payers.reduce((sum, p) => sum + p.amount_paid, 0);
  const isValid = mode === 'single' ? payers.length === 1 : Math.abs(totalEntered - amount) < TOLERANCE;

  React.useEffect(() => {
    onValidityChange?.(isValid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid]);

  const selectSinglePayer = (memberId: string) => {
    onChange([{ member_id: memberId, amount_paid: amount }]);
  };

  const toggleMember = (memberId: string, checked: boolean) => {
    if (checked) {
      const remaining = Math.max(0, amount - totalEntered);
      onChange([...payers, { member_id: memberId, amount_paid: remaining }]);
    } else {
      onChange(payers.filter((p) => p.member_id !== memberId));
    }
  };

  const updateAmount = (memberId: string, newAmount: number) => {
    onChange(payers.map((p) => (p.member_id === memberId ? { ...p, amount_paid: newAmount } : p)));
  };

  if (mode === 'single') {
    return (
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Who Paid?
        </Typography>
        <Box sx={{ borderRadius: 1, overflow: 'hidden', border: `1px solid ${theme.palette.divider}` }}>
          {members.map((m, idx) => {
            const selected = payers.length === 1 && payers[0].member_id === m.member_id;
            return (
              <Box
                key={m.member_id}
                onClick={() => selectSinglePayer(m.member_id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  px: 1.5,
                  py: 1.25,
                  cursor: 'pointer',
                  borderTop: idx === 0 ? 'none' : `1px solid ${theme.palette.divider}`,
                  backgroundColor: selected ? theme.palette.action.selected : 'transparent',
                  '&:hover': { backgroundColor: selected ? theme.palette.action.selected : theme.palette.action.hover },
                }}
              >
                <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: colorFromMemberId(m.member_id) }}>
                  {initialsFromName(m.display_name)}
                </Avatar>
                <Typography sx={{ flex: 1, fontWeight: 600 }}>{m.display_name}</Typography>
                {selected && <CheckRoundedIcon fontSize="small" color="primary" />}
              </Box>
            );
          })}
          <Box
            onClick={() => setMode('multiple')}
            sx={{
              px: 1.5,
              py: 1.25,
              cursor: 'pointer',
              borderTop: `1px solid ${theme.palette.divider}`,
              '&:hover': { backgroundColor: theme.palette.action.hover },
            }}
          >
            <Typography sx={{ fontWeight: 600, color: 'text.secondary' }}>Multiple people</Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Who Paid?
        </Typography>
        <Button size="small" onClick={() => setMode('single')}>
          Single person
        </Button>
      </Box>
      <Box
        sx={{
          borderRadius: 1,
          overflow: 'hidden',
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        {members.map((m, idx) => {
          const checked = selectedIds.has(m.member_id);
          const payer = payers.find((p) => p.member_id === m.member_id);
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
                inputProps={{ 'aria-label': `Include ${m.display_name} as payer` }}
              />
              <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: colorFromMemberId(m.member_id) }}>
                {initialsFromName(m.display_name)}
              </Avatar>
              <Typography sx={{ flex: 1, fontWeight: 600 }}>{m.display_name}</Typography>
              {checked && (
                <TextField
                  size="small"
                  type="number"
                  value={payer?.amount_paid ?? 0}
                  onChange={(e) => updateAmount(m.member_id, parseFloat(e.target.value) || 0)}
                  sx={{ width: 120 }}
                  inputProps={{ 'aria-label': `Amount paid by ${m.display_name}` }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  }}
                />
              )}
            </Box>
          );
        })}
      </Box>

      {!isValid && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          Amounts paid must equal total expense (${amount.toFixed(2)}). Currently: ${totalEntered.toFixed(2)}.
        </Typography>
      )}
      {isValid && (
        <Typography color="success.main" variant="body2" sx={{ mt: 1 }}>
          Payments reconcile ✓
        </Typography>
      )}
    </Box>
  );
};

export default PayerPicker;
