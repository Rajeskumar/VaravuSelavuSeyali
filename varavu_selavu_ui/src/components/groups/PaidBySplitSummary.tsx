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

interface Props {
  amount: number;
  members: MemberDTO[];
  myMemberId?: string;
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
 * click instead of always rendering expanded. Picker changes are staged locally and only
 * committed to the parent form on Save (Cancel discards them), which also means reopening
 * the picker always reflects whatever is currently selected rather than a reset default.
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
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [pickerType, setPickerType] = React.useState<PickerType>(null);

  const [localPayers, setLocalPayers] = React.useState<PayerSummaryItem[]>(payers);
  const [localPayersValid, setLocalPayersValid] = React.useState(true);
  const [localSplit, setLocalSplit] = React.useState<SplitEditorValue>(splitValue);
  const [localSplitValid, setLocalSplitValid] = React.useState(true);

  const openPicker = (type: 'payer' | 'split') => {
    setLocalPayers(payers);
    setLocalSplit(splitValue);
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
          (${perPerson.toFixed(2)}/person)
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
            <PayerPicker amount={amount} members={members} payers={localPayers} onChange={setLocalPayers} onValidityChange={setLocalPayersValid} />
          )}
          {pickerType === 'split' && (
            <SplitEditor
              amount={amount}
              members={members}
              value={localSplit}
              onChange={setLocalSplit}
              onValidityChange={setLocalSplitValid}
              allowedTypes={allowedTypes}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel}>Cancel</Button>
          <Button variant="contained" disabled={saveDisabled} onClick={handleSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PaidBySplitSummary;
