import React from 'react';
import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import { useTheme } from '@mui/material/styles';
import { createSettlement, ApiError, MemberBalance, BalanceTransfer } from '../../api/groups';
import { colorFromMemberId, initialsFromName } from './MemberAvatarStack';
import { withAlpha, slate, typeScale, tabularNums } from '../../theme';
import { venmoLink, paypalMeLink, upiLink } from '../../utils/paymentDeepLinks';

interface SettleUpDialogProps {
  open: boolean;
  groupId: string;
  members: MemberBalance[];
  /** Pairwise "who owes whom" (balances.transfers) — with myMemberId, drives the default
   * row-per-debt picker instead of a blank From/To form. */
  transfers?: BalanceTransfer[];
  myMemberId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Stage = 'pick' | 'review' | 'settling' | 'done';

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

const SettleUpDialog: React.FC<SettleUpDialogProps> = ({ open, groupId, members, transfers = [], myMemberId, onClose, onSuccess }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const nameFor = (id: string) => members.find((m) => m.member_id === id)?.display_name || '';
  const [fromMemberId, setFromMemberId] = React.useState('');
  const [toMemberId, setToMemberId] = React.useState('');
  const [amount, setAmount] = React.useState<number>(0);
  const [method, setMethod] = React.useState('cash');
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  // Default: a row-per-debt picker scoped to the logged-in member (Splitwise-style "Settle
  // up"), falling back straight to the old blank manual form when myMemberId isn't known —
  // that keeps this dialog usable from any call site, not just ones that pass it.
  const [stage, setStage] = React.useState<Stage>(myMemberId ? 'pick' : 'review');
  const [manualMode, setManualMode] = React.useState(!myMemberId);
  const { displayValue, setDisplayValue, runFrom } = useCountDown();

  const myTransfers = React.useMemo(
    () => (myMemberId ? transfers.filter((t) => t.from_member_id === myMemberId || t.to_member_id === myMemberId) : []),
    [transfers, myMemberId]
  );

  const defaultManualPick = (current: MemberBalance[]) => {
    // Default to the largest debtor paying the largest creditor, if determinable.
    const debtor = [...current].sort((a, b) => a.net - b.net)[0];
    const creditor = [...current].sort((a, b) => b.net - a.net)[0];
    const initialAmount = debtor && debtor.net < 0 ? Math.abs(debtor.net) : 0;
    setFromMemberId(debtor && debtor.net < 0 ? debtor.member_id : '');
    setToMemberId(creditor && creditor.net > 0 ? creditor.member_id : '');
    setAmount(initialAmount);
    setDisplayValue(initialAmount);
  };

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
      setMethod('cash');
      setNotes('');
      setError(null);
      if (myMemberId) {
        setStage('pick');
        setManualMode(false);
        setFromMemberId('');
        setToMemberId('');
        setAmount(0);
        setDisplayValue(0);
      } else {
        setStage('review');
        setManualMode(true);
        defaultManualPick(membersRef.current);
      }
    }
    wasOpenRef.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, myMemberId, setDisplayValue]);

  React.useEffect(() => {
    if (stage === 'review') setDisplayValue(amount);
  }, [amount, stage, setDisplayValue]);

  const isValid = fromMemberId && toMemberId && fromMemberId !== toMemberId && amount > 0;
  const saving = stage === 'settling';

  const pickTransfer = (t: BalanceTransfer) => {
    setFromMemberId(t.from_member_id);
    setToMemberId(t.to_member_id);
    setAmount(t.amount);
    setDisplayValue(t.amount);
    setManualMode(false);
    setError(null);
    setStage('review');
  };

  const enterManual = () => {
    setManualMode(true);
    defaultManualPick(membersRef.current);
    setError(null);
    setStage('review');
  };

  // TS-GRP-130: payment deep links — the recipient ("to") is who the buttons pay.
  // Clicking one only opens the user's own payment app; it never auto-records
  // the settlement, which the user still confirms separately below.
  const recipient = members.find((m) => m.member_id === toMemberId);
  const note = `TrackSpense settlement`;
  const paymentButtons: { label: string; href: string }[] = [];
  if (recipient?.venmo_handle) paymentButtons.push({ label: 'Pay with Venmo', href: venmoLink(recipient.venmo_handle, amount || 0, note) });
  if (recipient?.paypal_handle) paymentButtons.push({ label: 'Pay with PayPal', href: paypalMeLink(recipient.paypal_handle, amount || 0) });
  if (recipient?.upi_id) paymentButtons.push({ label: 'Pay with UPI', href: upiLink(recipient.upi_id, amount || 0, note) });

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
  const heroColor = isDark ? slate.positiveDark : slate.positive;
  // "Done" celebration reuses the brand accent (Slate has no dedicated ceremony hue), same
  // policy as TrueTotalHero's RECONCILED badge.
  const doneColor = isDark ? slate.accentDark : slate.accent;
  const canGoBack = !manualMode && myTransfers.length > 0 && stage === 'review';

  return (
    <Dialog open={open} onClose={stage === 'settling' ? undefined : onClose} maxWidth="xs" fullWidth>
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          {canGoBack && (
            <IconButton size="small" onClick={() => setStage('pick')} aria-label="Back">
              <ArrowBackRoundedIcon fontSize="small" />
            </IconButton>
          )}
          <Typography variant="h6">Settle Up</Typography>
        </Box>

        {stage === 'pick' && (
          <Box>
            {myTransfers.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                You're all settled up with everyone in this group.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                {myTransfers.map((t, idx) => {
                  const iOwe = t.from_member_id === myMemberId;
                  const otherId = iOwe ? t.to_member_id : t.from_member_id;
                  return (
                    <Box
                      key={idx}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        px: 1.5,
                        py: 1,
                        borderRadius: 1,
                        border: `1px solid ${theme.palette.divider}`,
                      }}
                    >
                      <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: colorFromMemberId(otherId) }}>
                        {initialsFromName(nameFor(otherId))}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }} noWrap>
                          {nameFor(otherId)}
                        </Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: iOwe ? theme.palette.error.main : theme.palette.success.main }}>
                          {iOwe ? 'you owe' : 'owes you'} ${t.amount.toFixed(2)}
                        </Typography>
                      </Box>
                      <Button size="small" variant="outlined" onClick={() => pickTransfer(t)}>
                        Settle
                      </Button>
                    </Box>
                  );
                })}
              </Box>
            )}
            <Button variant="text" size="small" onClick={enterManual} sx={{ display: 'block', mx: 'auto' }}>
              Record a custom settlement
            </Button>
          </Box>
        )}

        {stage !== 'pick' && (hasPair || stage === 'done') && (
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
                color: stage === 'done' ? doneColor : heroColor,
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
        ) : stage === 'review' || stage === 'settling' ? (
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
                  borderRadius: 1,
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

            {paymentButtons.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Open {nameFor(toMemberId)}'s payment app, then confirm below once you've paid.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {paymentButtons.map((b) => (
                    <Button
                      key={b.label}
                      size="small"
                      variant="outlined"
                      component="a"
                      href={b.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {b.label}
                    </Button>
                  ))}
                </Box>
              </Box>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {manualMode && (
                <>
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
                </>
              )}
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
        ) : null}
      </Box>
    </Dialog>
  );
};

export default SettleUpDialog;
