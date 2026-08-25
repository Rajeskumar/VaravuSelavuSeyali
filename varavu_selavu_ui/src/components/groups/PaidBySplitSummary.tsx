import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { MemberDTO, PayerSummaryItem } from '../../api/groups';
import PayerPicker from './PayerPicker';
import SplitEditor, { SplitEditorValue, SplitType } from './SplitEditor';
import { formatMoney } from '../../utils/money';

interface Props {
  amount: number;
  members: MemberDTO[];
  myMemberId?: string;
  currency?: string;
  payers: PayerSummaryItem[];
  onPayersChange: (payers: PayerSummaryItem[]) => void;
  onPayersValidityChange?: (valid: boolean) => void;
  splitValue: SplitEditorValue;
  onSplitChange: (value: SplitEditorValue) => void;
  onSplitValidityChange?: (valid: boolean) => void;
  /** Restricts the split picker's type tabs — e.g. Quick Capture's itemized-receipt path only
   * supports an equal split (member_ratios per line item has no percentage/exact/shares/
   * adjustment analog), so it passes ['equal'] to keep this same summary/picker reusable there
   * instead of needing a second UI just for that case. Defaults to all 5 types (unchanged
   * behavior for existing callers like ExpenseDetailDialog). */
  allowedTypes?: SplitType[];
  /** Fired after either picker's own Save commits a change — lets the parent flip a single
   * shared "customized" flag without this component needing to know that concept exists. */
  onCustomized?: () => void;
}

function payerLabel(payers: PayerSummaryItem[], members: MemberDTO[], myMemberId?: string): string {
  if (payers.length === 0) return 'someone';
  if (payers.length > 1) return `${payers.length} people`;
  const p = payers[0];
  if (p.member_id === myMemberId) return 'you';
  return members.find((m) => m.member_id === p.member_id)?.display_name || 'someone';
}

function splitLabel(value: SplitEditorValue): string {
  switch (value.type) {
    case 'equal':
      return 'equally';
    case 'exact':
      return 'unequally';
    case 'percentage':
      return 'by percentage';
    case 'shares':
      return 'by shares';
    case 'adjustment':
      return 'with adjustments';
    default:
      return 'equally';
  }
}

type PickerType = 'payer' | 'split' | null;

/**
 * Splitwise-style "Paid by X and split Y" summary line — the picker stays hidden behind a
 * click instead of always rendering expanded. Single-payer selection commits the instant you
 * tap a name (no Save needed — see PayerPicker's onSingleSelect); split editing and
 * "multiple people" payer mode still stage changes locally and only commit on an explicit
 * Save (Cancel, the dialog's close icon, or clicking the backdrop all discard them), since
 * those involve several interdependent fields with no single click that fully determines the
 * answer.
 */
const PaidBySplitSummary: React.FC<Props> = ({
  amount,
  members,
  myMemberId,
  payers,
  onPayersChange,
  onPayersValidityChange,
  splitValue,
  onSplitChange,
  onSplitValidityChange,
  allowedTypes,
  onCustomized,
  currency = 'USD',
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [pickerType, setPickerType] = React.useState<PickerType>(null);

  const [localPayers, setLocalPayers] = React.useState<PayerSummaryItem[]>(payers);
  const [localPayersValid, setLocalPayersValid] = React.useState(true);
  const [localSplit, setLocalSplit] = React.useState<SplitEditorValue>(splitValue);
  const [localSplitValid, setLocalSplitValid] = React.useState(true);
  // "single" payer mode commits per-tap (via onSingleSelect below) with nothing left to
  // confirm, so its dialog needs no Save/Cancel at all — the backdrop click/Escape MUI's
  // Dialog already wires to onClose is the "cancel" affordance. "multiple" mode still has
  // several amount fields to reconcile before there's anything valid to commit, so it keeps
  // explicit actions. Derived from payers.length so the very first render (before PayerPicker
  // mounts and reports its own mode) already guesses right instead of flashing buttons.
  const [payerMode, setPayerMode] = React.useState<'single' | 'multiple'>(payers.length > 1 ? 'multiple' : 'single');

  const openPicker = (type: 'payer' | 'split') => {
    setLocalPayers(payers);
    setLocalSplit(splitValue);
    setPayerMode(payers.length > 1 ? 'multiple' : 'single');
    setPickerType(type);
  };

  const handleCancel = () => setPickerType(null);

  const handleSave = () => {
    if (pickerType === 'payer') {
      onPayersChange(localPayers);
      onPayersValidityChange?.(localPayersValid);
    } else if (pickerType === 'split') {
      onSplitChange(localSplit);
      onSplitValidityChange?.(localSplitValid);
    }
    onCustomized?.();
    setPickerType(null);
  };

  const linkSx = {
    font: 'inherit',
    fontWeight: 700,
    color: theme.palette.primary.main,
    background: 'none',
    border: 'none',
    borderBottom: `1px dashed ${theme.palette.primary.main}`,
    cursor: 'pointer',
    padding: 0,
    mx: 0.5,
  } as const;

  const perPerson =
    splitValue.type === 'equal' && splitValue.entries.length > 0 ? amount / splitValue.entries.length : null;

  const saveDisabled = pickerType === 'payer' ? !localPayersValid : !localSplitValid;

  return (
    <Box sx={{ py: 0.25 }}>
      <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary' }}>
        Paid by
        <Box component="button" type="button" onClick={() => openPicker('payer')} sx={linkSx}>
          {payerLabel(payers, members, myMemberId)}
        </Box>
        and split
        <Box component="button" type="button" onClick={() => openPicker('split')} sx={linkSx}>
          {splitLabel(splitValue)}
        </Box>
        .
      </Typography>
      {perPerson !== null && (
        <Typography sx={{ fontSize: '0.8rem', color: 'text.disabled', mt: 0.25 }}>
          ({formatMoney(perPerson, currency)}/person)
        </Typography>
      )}

      <Dialog
        open={!!pickerType}
        onClose={handleCancel}
        fullScreen={isMobile}
        slotProps={{ backdrop: { invisible: !isMobile } }}
        PaperProps={
          !isMobile
            ? {
                sx: {
                  position: 'fixed',
                  top: '50%',
                  left: 'calc(50% + 240px)',
                  transform: 'translateY(-50%)',
                  m: 0,
                  width: 360,
                  maxWidth: 'calc(100vw - 32px)',
                  maxHeight: '80vh',
                },
              }
            : undefined
        }
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          {pickerType === 'payer' ? 'Choose payer' : 'Choose how to split'}
          <IconButton size="small" onClick={handleCancel} aria-label="Close">
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {pickerType === 'payer' && (
            <PayerPicker
              amount={amount}
              members={members}
              payers={localPayers}
              onChange={setLocalPayers}
              onValidityChange={setLocalPayersValid}
              currency={currency}
              // Tapping a single payer fully determines the answer on its own — commit and
              // close immediately instead of making the user click Save to confirm a choice
              // that one tap already made. "Multiple people" mode still stages via onChange
              // above and needs its own explicit Save (per-person amounts must reconcile).
              onSingleSelect={(memberId) => {
                onPayersChange([{ member_id: memberId, amount_paid: amount }]);
                onPayersValidityChange?.(true);
                onCustomized?.();
                setPickerType(null);
              }}
              onModeChange={setPayerMode}
            />
          )}
          {pickerType === 'split' && (
            <SplitEditor
              amount={amount}
              members={members}
              value={localSplit}
              onChange={setLocalSplit}
              onValidityChange={setLocalSplitValid}
              allowedTypes={allowedTypes}
              currency={currency}
            />
          )}
        </DialogContent>
        {!(pickerType === 'payer' && payerMode === 'single') && (
          <DialogActions>
            <Button onClick={handleCancel}>Cancel</Button>
            <Button variant="contained" disabled={saveDisabled} onClick={handleSave}>
              Save
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </Box>
  );
};

export default PaidBySplitSummary;
