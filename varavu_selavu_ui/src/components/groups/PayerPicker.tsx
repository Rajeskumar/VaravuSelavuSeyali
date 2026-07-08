import React from 'react';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Avatar from '@mui/material/Avatar';
import InputAdornment from '@mui/material/InputAdornment';
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

const PayerPicker: React.FC<PayerPickerProps> = ({
  amount,
  members,
  payers,
  onChange,
  onValidityChange,
}) => {
  const theme = useTheme();
  const selectedIds = React.useMemo(() => new Set(payers.map((p) => p.member_id)), [payers]);
  
  const totalEntered = payers.reduce((sum, p) => sum + p.amount_paid, 0);
  const isValid = Math.abs(totalEntered - amount) < TOLERANCE;

  React.useEffect(() => {
    onValidityChange?.(isValid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid]);

  const toggleMember = (memberId: string, checked: boolean) => {
    if (checked) {
      // If adding a member, give them the remaining balance up to the total
      const remaining = Math.max(0, amount - totalEntered);
      onChange([...payers, { member_id: memberId, amount_paid: remaining }]);
    } else {
      onChange(payers.filter((p) => p.member_id !== memberId));
    }
  };

  const updateAmount = (memberId: string, newAmount: number) => {
    onChange(
      payers.map((p) => (p.member_id === memberId ? { ...p, amount_paid: newAmount } : p))
    );
  };

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
        Who Paid?
      </Typography>
      <Box
        sx={{
          borderRadius: 3,
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
