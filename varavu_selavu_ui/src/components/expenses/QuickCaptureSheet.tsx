import React from 'react';
import Drawer from '@mui/material/Drawer';
import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import CloseIcon from '@mui/icons-material/CloseRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { typeScale, tabularNums } from '../../theme';
import { CATEGORY_GROUPS, findMainCategory } from './AddExpenseForm';
import { formatMoney } from './ExpenseFeed';
import { suggestCategory } from '../../api/expenses';
import { listGroups, GroupSummary } from '../../api/groups';
import { useGroupsEnabled } from '../../hooks/useGroupsEnabled';
import { useLogExpense } from '../../hooks/useLogExpense';
import { useReceiptScan } from '../../hooks/useReceiptScan';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
/** CATEGORY_GROUPS.Other includes 'General' — used when suggestCategory can't classify. */
const FALLBACK_CATEGORY = 'General';

function pressKey(amount: string, key: string): string {
  if (key === '⌫') return amount.slice(0, -1);
  if (key === '.') return amount.includes('.') ? amount : (amount || '0') + '.';
  const dec = amount.split('.')[1];
  if (dec && dec.length >= 2) return amount;
  if (amount.replace('.', '').length >= 7) return amount;
  return amount + key;
}

interface QuickCaptureSheetProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selects this group as "who" on open instead of "Just me" — used when opened from a
   * group's own "+ Add expense" button (both breakpoints). */
  initialGroupId?: string;
}

/**
 * FAB / "+ New expense" target (TrackSpense v3 design) — the one fast expense-entry surface
 * across the app, replacing AddExpenseForm as a *creation* entry point everywhere (it stays for
 * editing — see ExpensesPage.tsx's row Edit-icon flow, untouched by this component). No category
 * picker: category comes from a scanned receipt when present, otherwise the existing
 * suggestCategory() call on save, falling back to a generic category so the payload is always
 * valid without asking the user to pick one here.
 *
 * Mobile renders a bottom sheet with a numeric keypad; desktop (`md`+) renders a centered dialog
 * with a plain amount field, per the two design mocks — same state/save logic underneath.
 */
const QuickCaptureSheet: React.FC<QuickCaptureSheetProps> = ({ open, onClose, initialGroupId }) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { enabled: groupsEnabled } = useGroupsEnabled();
  const { logPersonal, logToGroup } = useLogExpense();

  const [stage, setStage] = React.useState<'entry' | 'saved'>('entry');
  const [amount, setAmount] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [who, setWho] = React.useState(initialGroupId || 'me');
  const [groups, setGroups] = React.useState<GroupSummary[]>([]);
  const [scannedCategory, setScannedCategory] = React.useState<string | null>(null);
  const [scannedMerchant, setScannedMerchant] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAmount, setSavedAmount] = React.useState(0);
  const [savedLine, setSavedLine] = React.useState('');

  const scan = useReceiptScan({
    onAutoParse: (res) => {
      const hdr = res.header || {};
      if (hdr.amount) setAmount(String(Number(hdr.amount)));
      const merchant = hdr.merchant_name || hdr.merchant || '';
      const desc = hdr.description || (merchant ? `Receipt from ${merchant}` : '');
      if (desc) setDescription(desc);
      if (merchant) setScannedMerchant(merchant);
      if (hdr.category_name && CATEGORY_GROUPS[hdr.main_category_name]?.includes(hdr.category_name)) {
        setScannedCategory(hdr.category_name);
      }
    },
  });

  const reset = React.useCallback(() => {
    setStage('entry');
    setAmount('');
    setDescription('');
    setWho(initialGroupId || 'me');
    setScannedCategory(null);
    setScannedMerchant(null);
    setError(null);
    scan.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGroupId]);

  React.useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open || !groupsEnabled) return;
    let mounted = true;
    (async () => {
      try {
        const g = await listGroups();
        if (mounted) setGroups(g);
      } catch {
        if (mounted) setGroups([]);
      }
    })();
    return () => { mounted = false; };
  }, [open, groupsEnabled]);

  const amountNum = parseFloat(amount || '0') || 0;
  const selectedGroup = who !== 'me' ? groups.find((g) => g.group_id === who) : undefined;
  const memberCount = selectedGroup?.member_count ?? 1;
  const shareNum = selectedGroup ? amountNum / memberCount : amountNum;
  const ready = amountNum > 0 && description.trim() !== '' && !saving;
  const categoryPreview = scannedCategory ? `${findMainCategory(scannedCategory)} · ${scannedCategory}` : 'AI suggests on save';

  const resolveCategory = async (): Promise<string> => {
    if (scannedCategory) return scannedCategory;
    try {
      const res = await suggestCategory(description.trim());
      if (CATEGORY_GROUPS[res.main_category]?.includes(res.subcategory)) return res.subcategory;
    } catch {
      /* fall through to default */
    }
    return FALLBACK_CATEGORY;
  };

  const handleSave = async () => {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      const category = await resolveCategory();
      if (selectedGroup) {
        const { myShare } = await logToGroup(selectedGroup.group_id, {
          description: description.trim(),
          category,
          amount: amountNum,
          merchantName: scannedMerchant || undefined,
        });
        setSavedLine(`Logged to ${selectedGroup.name} — your share ${formatMoney(myShare)} joins your personal total automatically.`);
      } else {
        await logPersonal({
          description: description.trim(),
          category,
          amount: amountNum,
          merchantName: scannedMerchant || undefined,
        });
        setSavedLine('Logged to your personal ledger.');
      }
      setSavedAmount(amountNum);
      setStage('saved');
    } catch {
      setError('Failed to save expense. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const scanInput = (
    <input
      ref={scan.cameraInputRef}
      type="file"
      accept="image/*"
      capture="environment"
      style={{ display: 'none' }}
      onChange={scan.handleFileChange}
    />
  );

  const whoChips = groupsEnabled && (
    <Box sx={{ display: 'flex', gap: 0.75, mt: 1.25, flexWrap: 'wrap' }}>
      {[{ id: 'me', name: 'Just me' }, ...groups.map((g) => ({ id: g.group_id, name: g.name }))].map((chip) => {
        const active = who === chip.id;
        return (
          <Box
            key={chip.id}
            onClick={() => setWho(chip.id)}
            sx={{
              px: 1.5,
              py: 0.75,
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              userSelect: 'none',
              border: '1px solid',
              borderColor: active ? 'primary.main' : 'divider',
              bgcolor: active ? 'primary.main' : 'transparent',
              color: active ? 'primary.contrastText' : 'text.primary',
            }}
          >
            {chip.name}
          </Box>
        );
      })}
    </Box>
  );

  const splitPreview = selectedGroup && (
    <Box sx={{ mt: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.25, px: 1.5, py: 1 }}>
      <Typography variant="caption" color="text.secondary">
        Split equally · {memberCount} people · your share{' '}
        <Box component="span" sx={{ color: 'text.primary', fontWeight: 700, ...tabularNums }}>
          {formatMoney(shareNum)}
        </Box>
      </Typography>
    </Box>
  );

  const errorLine = error && (
    <Typography color="error" variant="caption" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
      {error}
    </Typography>
  );

  const saveButton = (
    <Button
      fullWidth
      variant="contained"
      disabled={!ready}
      onClick={handleSave}
      sx={{ mt: 1.5, height: 48, borderRadius: 1.5, fontSize: 15 }}
    >
      {saving ? <CircularProgress size={20} sx={{ color: 'inherit' }} /> : selectedGroup ? 'Save & split' : 'Save'}
    </Button>
  );

  const savedPanel = (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25, py: 2.25 }}>
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: 999,
          bgcolor: 'success.main',
          color: 'success.contrastText',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CheckRoundedIcon sx={{ fontSize: 28 }} />
      </Box>
      <Typography component="div" sx={{ ...typeScale.display, fontSize: 26 }}>
        {formatMoney(savedAmount)}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', px: 1.5 }}>
        {savedLine}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
        <Button variant="outlined" sx={{ borderRadius: 999 }} onClick={reset}>
          Log another
        </Button>
        <Button variant="contained" sx={{ borderRadius: 999 }} onClick={onClose}>
          Done
        </Button>
      </Box>
    </Box>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2, p: 2.5 } }}>
        {stage === 'entry' && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontWeight: 700, fontSize: 16 }}>New expense</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {scanInput}
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={scan.parsing || scan.converting ? <CircularProgress size={14} /> : <PhotoCameraRoundedIcon />}
                  onClick={() => scan.cameraInputRef.current?.click()}
                  disabled={scan.parsing || scan.converting}
                  sx={{ borderRadius: 999 }}
                >
                  Scan receipt
                </Button>
                <IconButton aria-label="close" onClick={onClose} size="small">
                  <CloseIcon />
                </IconButton>
              </Box>
            </Box>

            <Box sx={{ textAlign: 'center', pt: 2, pb: 0.5 }}>
              <Typography variant="caption" sx={{ ...typeScale.label, color: 'text.secondary' }}>Amount</Typography>
              <TextField
                variant="standard"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                autoFocus
                slotProps={{ input: { disableUnderline: true } }}
                inputProps={{
                  style: {
                    textAlign: 'center',
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 600,
                    fontSize: 44,
                    ...tabularNums,
                  },
                }}
                sx={{ width: 220 }}
              />
            </Box>

            <TextField
              fullWidth
              size="small"
              placeholder="Description (AI suggests from merchant)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              sx={{ mt: 1 }}
            />

            <Box sx={{ display: 'flex', gap: 1, mt: 1.25 }}>
              <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 999, px: 1.5, py: 0.5, fontSize: 12, fontWeight: 600 }}>
                {categoryPreview} ✨
              </Box>
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 999, px: 1.5, py: 0.5, fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>
                Today
              </Box>
            </Box>

            <Typography variant="caption" sx={{ ...typeScale.label, color: 'text.secondary', display: 'block', mt: 2 }}>
              Who was this with?
            </Typography>
            {whoChips}
            {splitPreview}
            {errorLine}
            {saveButton}
          </>
        )}
        {stage === 'saved' && savedPanel}
      </Dialog>
    );
  }

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: false }}
      PaperProps={{
        sx: {
          width: '100%',
          maxWidth: '100%',
          maxHeight: '92%',
          borderTopLeftRadius: (theme.shape.borderRadius as number) * 2,
          borderTopRightRadius: (theme.shape.borderRadius as number) * 2,
          p: 2.25,
          pb: 3.5,
        },
      }}
    >
      <Box sx={{ width: 36, height: 4, borderRadius: 999, backgroundColor: 'divider', mx: 'auto', mb: 1.5 }} />

      {stage === 'entry' && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontWeight: 700, fontSize: 16 }}>New expense</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {scanInput}
              <Button
                size="small"
                variant="outlined"
                startIcon={scan.parsing || scan.converting ? <CircularProgress size={14} /> : <PhotoCameraRoundedIcon />}
                onClick={() => scan.cameraInputRef.current?.click()}
                disabled={scan.parsing || scan.converting}
                sx={{ borderRadius: 999 }}
              >
                Scan
              </Button>
              <IconButton aria-label="close" onClick={onClose} size="small">
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>

          <Box sx={{ textAlign: 'center', pt: 1.25, pb: 0.5 }}>
            <Typography component="div" sx={{ ...typeScale.displayHero, fontSize: 42, minHeight: 52 }}>
              {amount ? `$${amount}` : '$0.00'}
            </Typography>
          </Box>

          <TextField
            fullWidth
            size="small"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            sx={{ mt: 1 }}
          />

          {whoChips}
          {splitPreview}

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.75, mt: 1.5 }}>
            {KEYS.map((k) => (
              <Box
                key={k}
                onClick={() => setAmount((a) => pressKey(a, k))}
                sx={{
                  height: 46,
                  borderRadius: 1.25,
                  bgcolor: 'action.hover',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 20,
                  fontWeight: 600,
                  cursor: 'pointer',
                  userSelect: 'none',
                  '&:active': { bgcolor: 'action.selected' },
                }}
              >
                {k}
              </Box>
            ))}
          </Box>

          {errorLine}
          {saveButton}
        </>
      )}

      {stage === 'saved' && savedPanel}
    </Drawer>
  );
};

export default QuickCaptureSheet;
