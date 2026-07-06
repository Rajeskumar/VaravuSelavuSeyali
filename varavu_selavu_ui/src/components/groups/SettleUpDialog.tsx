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
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import { useTheme } from '@mui/material/styles';
import { createSettlement, ApiError, MemberBalance } from '../../api/groups';
import { colorFromMemberId, initialsFromName } from './MemberAvatarStack';
import { withAlpha, reconcile, typeScale, tabularNums } from '../../theme';

interface SettleUpDialogProps {
  open: boolean;
  groupId: string;
  members: MemberBalance[];
  onClose: () => void;
  onSuccess: () => void;
}

type Stage = 'review' | 'settling' | 'done';

/** 900ms cubic-ease-out count-down, matching docs/design/prototypes/SettleUp.jsx's resolution moment. */
function useCountDown() {
  const [displayValue, setDisplayValue] = React.useState(0);
  const rafRef = React.useRef<number | undefined>(undefined);

  const runFrom = React.useCallback((from: number, onDone: () => void) => {
    const start = performance.now();
    const duration = 900;
    function step(ts: number) {
      const progress = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(from * (1 - eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        onDone();
      }
    }
    rafRef.current = requestAnimationFrame(step);
  }, []);

  React.useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  return { displayValue, setDisplayValue, runFrom };
}

const SettleUpDialog: React.FC<SettleUpDialogProps> = ({ open, groupId, members, onClose, onSuccess }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const nameFor = (id: string) => members.find((m) => m.member_id === id)?.display_name || '';
  const [fromMemberId, setFromMemberId] = React.useState('');
  const [toMemberId, setToMemberId] = React.useState('');
  const [amount, setAmount] = React.useState<number>(0);
  const [method, setMethod] = React.useState('cash');
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState<Stage>('review');
  const { displayValue, setDisplayValue, runFrom } = useCountDown();

  // Edge-triggered on the closed→open transition only. `members` (live balances) is read from
  // a ref, not a dependency — the balances query refetches (and its array reference changes)
  // as a side effect of this dialog's own onSuccess() call while the settling/done animation is
  // still in flight; depending on `members` directly re-ran this reset mid-animation and wiped
  // fromMemberId/toMemberId (recomputed against the now-zeroed post-settlement balances) out
  // from under the "done" resolution screen's name lookup. Found via manual verification.
  const membersRef = React.useRef(members);
  membersRef.current = members;
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      const current = membersRef.current;
      // Default to the largest debtor paying the largest creditor, if determinable.
      const debtor = [...current].sort((a, b) => a.net - b.net)[0];
      const creditor = [...current].sort((a, b) => b.net - a.net)[0];
      const initialAmount = debtor && debtor.net < 0 ? Math.abs(debtor.net) : 0;
      setFromMemberId(debtor && debtor.net < 0 ? debtor.member_id : '');
      setToMemberId(creditor && creditor.net > 0 ? creditor.member_id : '');
      setAmount(initialAmount);
      setMethod('cash');
      setNotes('');
      setError(null);
      setStage('review');
      setDisplayValue(initialAmount);
    }
    wasOpenRef.current = open;
  }, [open, setDisplayValue]);

  React.useEffect(() => {
    if (stage === 'review') setDisplayValue(amount);
  }, [amount, stage, setDisplayValue]);

  const isValid = fromMemberId && toMemberId && fromMemberId !== toMemberId && amount > 0;
  const saving = stage === 'settling';

  const handleSubmit = async () => {
    setError(null);
    setStage('settling');
    try {
      await createSettlement(groupId, {
        from_member_id: fromMemberId,
        to_member_id: toMemberId,
        amount,
        method: method || undefined,
        notes: notes || undefined,
      });
      onSuccess();
      runFrom(amount, () => setStage('done'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to record settlement');
      setStage('review');
    }
  };

  const handleDone = () => {
    onClose();
  };

  const hasPair = !!(fromMemberId && toMemberId && fromMemberId !== toMemberId);
  const heroColor = isDark ? reconcile.jadeDark : reconcile.jadeText;

  return (
    <Dialog open={open} onClose={stage === 'settling' ? undefined : onClose} maxWidth="xs" fullWidth>
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Settle Up
        </Typography>

        {(hasPair || stage === 'done') && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              py: 3,
              mb: 2.5,
              borderTop: `1px solid ${theme.palette.divider}`,
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              {stage === 'done' ? 'All squared up' : 'Settling'}
            </Typography>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mt: 0.5,
                color: stage === 'done' ? reconcile.gold : heroColor,
              }}
            >
              {stage === 'done' && <TaskAltRoundedIcon sx={{ fontSize: 28 }} />}
              <Typography sx={{ ...typeScale.display, ...tabularNums, color: 'inherit' }}>
                ${(stage === 'done' ? 0 : displayValue).toFixed(2)}
              </Typography>
            </Box>
          </Box>
        )}

        {stage === 'done' ? (
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {nameFor(fromMemberId)} paid {nameFor(toMemberId)} — balances updated.
            </Typography>
            <Button variant="contained" size="large" fullWidth onClick={handleDone}>
              Done
            </Button>
          </Box>
        ) : (
          <>
            {hasPair && (
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
                  opacity: stage === 'settling' ? 0.6 : 1,
                  transition: 'opacity 0.3s ease-out',
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
                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: 'primary.main', ...tabularNums }}>
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
                disabled={saving}
                value={fromMemberId}
                onChange={(e) => setFromMemberId(e.target.value)}
              >
                {members.map((m) => (
                  <MenuItem key={m.member_id} value={m.member_id}>
                    {m.display_name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label="To (who received)" fullWidth disabled={saving} value={toMemberId} onChange={(e) => setToMemberId(e.target.value)}>
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
                disabled={saving}
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                inputProps={{ min: 0, step: 0.01 }}
              />
              <TextField select label="Method" fullWidth disabled={saving} value={method} onChange={(e) => setMethod(e.target.value)}>
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="venmo">Venmo</MenuItem>
                <MenuItem value="upi">UPI</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </TextField>
              <TextField label="Notes (optional)" fullWidth disabled={saving} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
              <Button onClick={onClose} disabled={saving}>Cancel</Button>
              <Button variant="contained" disabled={!isValid || saving} onClick={handleSubmit}>
                {saving ? 'Settling…' : 'Record Settlement'}
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Dialog>
  );
};

export default SettleUpDialog;
