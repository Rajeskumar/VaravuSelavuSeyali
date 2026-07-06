import React from 'react';
import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import InputAdornment from '@mui/material/InputAdornment';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useTheme } from '@mui/material/styles';
import { createSettlement, ApiError, MemberBalance } from '../../api/groups';
import { colorFromMemberId, initialsFromName } from './MemberAvatarStack';
import { withAlpha } from '../../theme';

interface SettleUpDialogProps {
  open: boolean;
  groupId: string;
  members: MemberBalance[];
  onClose: () => void;
  onSuccess: () => void;
}

const SettleUpDialog: React.FC<SettleUpDialogProps> = ({ open, groupId, members, onClose, onSuccess }) => {
  const theme = useTheme();
  const nameFor = (id: string) => members.find((m) => m.member_id === id)?.display_name || '';
  const [fromMemberId, setFromMemberId] = React.useState('');
  const [toMemberId, setToMemberId] = React.useState('');
  const [amount, setAmount] = React.useState<number>(0);
  const [method, setMethod] = React.useState('cash');
  const [notes, setNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      // Default to the largest debtor paying the largest creditor, if determinable.
      const debtor = [...members].sort((a, b) => a.net - b.net)[0];
      const creditor = [...members].sort((a, b) => b.net - a.net)[0];
      setFromMemberId(debtor && debtor.net < 0 ? debtor.member_id : '');
      setToMemberId(creditor && creditor.net > 0 ? creditor.member_id : '');
      setAmount(debtor && debtor.net < 0 ? Math.abs(debtor.net) : 0);
      setMethod('cash');
      setNotes('');
      setError(null);
    }
  }, [open, members]);

  const isValid = fromMemberId && toMemberId && fromMemberId !== toMemberId && amount > 0;

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      await createSettlement(groupId, {
        from_member_id: fromMemberId,
        to_member_id: toMemberId,
        amount,
        method: method || undefined,
        notes: notes || undefined,
      });
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to record settlement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Settle Up
        </Typography>

        {fromMemberId && toMemberId && fromMemberId !== toMemberId && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              p: 2,
              mb: 2.5,
              borderRadius: 3,
              backgroundColor: withAlpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.06),
            }}
          >
            <Box sx={{ textAlign: 'center' }}>
              <Avatar sx={{ width: 40, height: 40, mx: 'auto', mb: 0.5, bgcolor: colorFromMemberId(fromMemberId) }}>
                {initialsFromName(nameFor(fromMemberId))}
              </Avatar>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {nameFor(fromMemberId)}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center', color: 'text.secondary' }}>
              <ArrowForwardRoundedIcon />
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: 'primary.main' }}>
                ${amount ? amount.toFixed(2) : '0.00'}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'center' }}>
              <Avatar sx={{ width: 40, height: 40, mx: 'auto', mb: 0.5, bgcolor: colorFromMemberId(toMemberId) }}>
                {initialsFromName(nameFor(toMemberId))}
              </Avatar>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {nameFor(toMemberId)}
              </Typography>
            </Box>
          </Box>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            select
            label="From (who paid)"
            fullWidth
            value={fromMemberId}
            onChange={(e) => setFromMemberId(e.target.value)}
          >
            {members.map((m) => (
              <MenuItem key={m.member_id} value={m.member_id}>
                {m.display_name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="To (who received)" fullWidth value={toMemberId} onChange={(e) => setToMemberId(e.target.value)}>
            {members.map((m) => (
              <MenuItem key={m.member_id} value={m.member_id}>
                {m.display_name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Amount"
            type="number"
            fullWidth
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            inputProps={{ min: 0, step: 0.01 }}
          />
          <TextField select label="Method" fullWidth value={method} onChange={(e) => setMethod(e.target.value)}>
            <MenuItem value="cash">Cash</MenuItem>
            <MenuItem value="venmo">Venmo</MenuItem>
            <MenuItem value="upi">UPI</MenuItem>
            <MenuItem value="other">Other</MenuItem>
          </TextField>
          <TextField label="Notes (optional)" fullWidth value={notes} onChange={(e) => setNotes(e.target.value)} />
          {fromMemberId && toMemberId && fromMemberId === toMemberId && (
            <Typography color="error" variant="body2">
              "From" and "To" must be different people
            </Typography>
          )}
          {error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" disabled={!isValid || saving} onClick={handleSubmit}>
            {saving ? 'Saving...' : 'Record Settlement'}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default SettleUpDialog;
