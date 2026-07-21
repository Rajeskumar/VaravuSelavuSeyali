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
import { listGroups, getGroup, GroupSummary, GroupDetailResponse, PayerSummaryItem } from '../../api/groups';
import { suggestMerchants } from '../../api/entityResolution';
import { useGroupsEnabled } from '../../hooks/useGroupsEnabled';
import { useEntityResolutionEnabled } from '../../hooks/useEntityResolutionEnabled';
import { useLogExpense } from '../../hooks/useLogExpense';
import { useReceiptScan } from '../../hooks/useReceiptScan';
import ScannedItemsCard, { ScannedItem } from './ScannedItemsCard';
import EntityAutocomplete from './EntityAutocomplete';
import CategoryPickerField from './CategoryPickerField';
import PaidBySplitSummary from '../groups/PaidBySplitSummary';
import { SplitEditorValue, computeSplitValid } from '../groups/SplitEditor';
import { computePayersValid } from '../groups/PayerPicker';

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
 * editing — see ExpensesPage.tsx's row Edit-icon flow, untouched by this component).
 *
 * Category and merchant are both AI-suggested as the user types the description (debounced,
 * mirroring AddExpenseScreen's mobile equivalent) and surfaced live via CategoryPickerField / the
 * merchant EntityAutocomplete — previously these were silently resolved only at save time
 * (category) or not resolved into the persisted expense at all (merchant, from suggestCategory's
 * own response), so nothing the AI decided was ever visible or editable before it was persisted.
 * `userPickedCategory`/`userPickedMerchant` stop the debounce from clobbering a receipt scan's
 * values or the user's own manual pick once either has happened.
 *
 * Mobile renders a bottom sheet with a numeric keypad; desktop (`md`+) renders a centered dialog
 * with a plain amount field, per the two design mocks — same state/save logic underneath.
 */
const QuickCaptureSheet: React.FC<QuickCaptureSheetProps> = ({ open, onClose, initialGroupId }) => {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { enabled: groupsEnabled } = useGroupsEnabled();
  const { enabled: entityResolutionEnabled } = useEntityResolutionEnabled();
  const { logPersonal, logToGroup, logPersonalWithItems, logToGroupWithItems } = useLogExpense();
  const fetchMerchantSuggestions = React.useCallback(
    (q: string) => (entityResolutionEnabled ? suggestMerchants(q) : Promise.resolve([])),
    [entityResolutionEnabled]
  );

  const [stage, setStage] = React.useState<'entry' | 'saved'>('entry');
  const [amount, setAmount] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [who, setWho] = React.useState(initialGroupId || 'me');
  const [groups, setGroups] = React.useState<GroupSummary[]>([]);
  const [scannedCategory, setScannedCategory] = React.useState<string | null>(null);
  const [scannedMerchant, setScannedMerchant] = React.useState<string | null>(null);
  // Set once a value came from a receipt scan or the user's own edit — stops the debounced
  // auto-suggest effect below from overwriting either with a lower-confidence guess afterward.
  const [userPickedCategory, setUserPickedCategory] = React.useState(false);
  const [userPickedMerchant, setUserPickedMerchant] = React.useState(false);
  const [scannedItems, setScannedItems] = React.useState<ScannedItem[]>([]);
  const [scannedTax, setScannedTax] = React.useState(0);
  const [scannedDiscount, setScannedDiscount] = React.useState(0);
  const [scannedPurchasedAt, setScannedPurchasedAt] = React.useState<string | null>(null);
  const [scannedFingerprint, setScannedFingerprint] = React.useState<string | null>(null);
  const [groupDetail, setGroupDetail] = React.useState<GroupDetailResponse | null>(null);
  const [payers, setPayers] = React.useState<PayerSummaryItem[]>([]);
  const [splitValue, setSplitValue] = React.useState<SplitEditorValue>({ type: 'equal', entries: [] });
  // Tracks whether the user has explicitly saved a change out of PaidBySplitSummary's payer or
  // split picker — while false, payers/splitValue auto-track the live amount/group so the fast
  // "just me, split equally" default needs no interaction; once true, amount edits stop
  // silently rewriting a customized payer/split (see the effects below).
  const [customized, setCustomized] = React.useState(false);
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
      if (merchant) {
        setScannedMerchant(merchant);
        setUserPickedMerchant(true);
      }
      if (hdr.category_name && CATEGORY_GROUPS[hdr.main_category_name]?.includes(hdr.category_name)) {
        setScannedCategory(hdr.category_name);
        setUserPickedCategory(true);
      }
      setScannedTax(Number(hdr.tax) || 0);
      setScannedDiscount(Number(hdr.discount) || 0);
      setScannedPurchasedAt(hdr.purchased_at || null);
      setScannedFingerprint(res.fingerprint || null);
      // The itemized save path only supports an equal split (member_ratios per item, no
      // percentage/exact/shares/adjustment analog) — if the user had already customized to a
      // weighted split before scanning, drop back to equal over the same participants rather
      // than silently ignoring their weights at save time.
      setSplitValue((v) => (v.type === 'equal' ? v : { type: 'equal', entries: v.entries }));
      setScannedItems(
        (res.items || []).map((it: any, idx: number) => ({
          line_no: idx + 1,
          item_name: it.item_name || it.normalized_name || 'Item',
          line_total: Number(it.line_total) || 0,
          quantity: it.quantity != null ? Number(it.quantity) : null,
          unit_price: it.unit_price != null ? Number(it.unit_price) : null,
          normalized_name: it.normalized_name,
        }))
      );
    },
  });

  const reset = React.useCallback(() => {
    setStage('entry');
    setAmount('');
    setDescription('');
    setWho(initialGroupId || 'me');
    setScannedCategory(null);
    setScannedMerchant(null);
    setUserPickedCategory(false);
    setUserPickedMerchant(false);
    setScannedItems([]);
    setScannedTax(0);
    setScannedDiscount(0);
    setScannedPurchasedAt(null);
    setScannedFingerprint(null);
    setGroupDetail(null);
    setPayers([]);
    setSplitValue({ type: 'equal', entries: [] });
    setCustomized(false);
    setError(null);
    scan.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGroupId]);

  React.useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced AI category/merchant suggestion as the user types — mirrors AddExpenseScreen's
  // mobile equivalent. Never overwrites a value that came from a receipt scan or the user's own
  // edit (userPickedCategory/userPickedMerchant), and never fires while a receipt scan is being
  // parsed (its onAutoParse result should win outright).
  React.useEffect(() => {
    if (!open || scan.parsing || scan.converting) return;
    if (userPickedCategory && userPickedMerchant) return;
    const desc = description.trim();
    if (desc.length < 3) return;
    const timer = setTimeout(() => {
      suggestCategory(desc)
        .then((res) => {
          if (!userPickedCategory && res.subcategory && CATEGORY_GROUPS[res.main_category]?.includes(res.subcategory)) {
            setScannedCategory(res.subcategory);
          }
          if (!userPickedMerchant && res.merchant_name) {
            setScannedMerchant(res.merchant_name);
          }
        })
        .catch(() => {
          /* keep whatever's shown; resolveCategory() still falls back at save time */
        });
    }, 800);
    return () => clearTimeout(timer);
  }, [open, description, userPickedCategory, userPickedMerchant, scan.parsing, scan.converting]);

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
  const myEmail = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const myMemberId = groupDetail?.members.find((m) => m.user_email === myEmail)?.member_id;

  // Fetches the full member list (GroupSummary only has member_count) and resets payers/split
  // to "just me, split equally among everyone" whenever the selected group changes, or the
  // sheet is reopened against the same group — a fresh default every time, since a prior
  // session's customization may reference members no longer in the group (or just shouldn't
  // silently carry over).
  React.useEffect(() => {
    if (!open || !selectedGroup) {
      setGroupDetail(null);
      setPayers([]);
      setSplitValue({ type: 'equal', entries: [] });
      setCustomized(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const detail = await getGroup(selectedGroup.group_id);
        if (!mounted) return;
        setGroupDetail(detail);
        const mine = detail.members.find((m) => m.user_email === myEmail);
        setPayers(mine ? [{ member_id: mine.member_id, amount_paid: amountNum }] : []);
        setSplitValue({ type: 'equal', entries: detail.members.map((m) => ({ member_id: m.member_id })) });
        setCustomized(false);
      } catch {
        if (mounted) setGroupDetail(null);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedGroup?.group_id]);

  // Keeps the default single "just me" payer's amount tracking the keypad total. Only while
  // unpicked — once the user has saved a change out of the payer/split picker (`customized`),
  // amount edits stop silently rewriting it; a stale split just shows as invalid (see
  // payersValid/splitValid below) until the user reopens the picker to fix it.
  React.useEffect(() => {
    if (customized) return;
    setPayers((prev) => (prev.length === 1 ? [{ ...prev[0], amount_paid: amountNum }] : prev));
  }, [amountNum, customized]);

  const payersValid = !selectedGroup || (!!groupDetail && computePayersValid(payers, amountNum));
  const splitValid = !selectedGroup || (!!groupDetail && computeSplitValid(splitValue, amountNum));
  const ready = amountNum > 0 && description.trim() !== '' && !saving && payersValid && splitValid;

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

  // Items with a blank name (user cleared a row rather than deleting it) are dropped
  // rather than sent to the itemized endpoints, which require a non-empty item_name.
  const itemsToSave = scannedItems.filter((it) => it.item_name.trim() !== '');

  const handleSave = async () => {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      const category = await resolveCategory();
      if (selectedGroup) {
        const { myShare } = itemsToSave.length > 0
          ? await logToGroupWithItems(selectedGroup.group_id, {
              description: description.trim(),
              category,
              amount: amountNum,
              merchantName: scannedMerchant || undefined,
              items: itemsToSave,
              tax: scannedTax,
              discount: scannedDiscount,
              payers,
              participantMemberIds: splitValue.entries.map((e) => e.member_id),
            })
          : await logToGroup(selectedGroup.group_id, {
              description: description.trim(),
              category,
              amount: amountNum,
              merchantName: scannedMerchant || undefined,
              payers,
              split: splitValue,
            });
        setSavedLine(`Logged to ${selectedGroup.name} — your share ${formatMoney(myShare)} joins your personal total automatically.`);
      } else if (itemsToSave.length > 0) {
        await logPersonalWithItems({
          description: description.trim(),
          category,
          amount: amountNum,
          merchantName: scannedMerchant || undefined,
          items: itemsToSave,
          tax: scannedTax,
          discount: scannedDiscount,
          purchasedAtIso: scannedPurchasedAt || undefined,
          fingerprint: scannedFingerprint || undefined,
        });
        setSavedLine('Logged to your personal ledger.');
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

  const splitPreview = selectedGroup && groupDetail && (
    <Box sx={{ mt: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1.25, px: 1.5, py: 1 }}>
      <PaidBySplitSummary
        amount={amountNum}
        members={groupDetail.members}
        myMemberId={myMemberId}
        payers={payers}
        onPayersChange={setPayers}
        splitValue={splitValue}
        onSplitChange={setSplitValue}
        allowedTypes={itemsToSave.length > 0 ? ['equal'] : undefined}
        onCustomized={() => setCustomized(true)}
      />
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
                    fontFamily: "'Bricolage Grotesque', sans-serif",
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

            <EntityAutocomplete
              value={scannedMerchant || ''}
              onValueChange={(v) => {
                setScannedMerchant(v || null);
                setUserPickedMerchant(true);
              }}
              fetchSuggestions={fetchMerchantSuggestions}
              textFieldProps={{ fullWidth: true, size: 'small', placeholder: 'Merchant (optional)', sx: { mt: 1 } }}
            />

            <Box sx={{ mt: 1.25 }}>
              <CategoryPickerField
                mainCategory={scannedCategory ? findMainCategory(scannedCategory) : ''}
                subcategory={scannedCategory || ''}
                onChange={(_main, sub) => {
                  setScannedCategory(sub);
                  setUserPickedCategory(true);
                }}
                label="Category ✨"
              />
            </Box>

            {scannedItems.length > 0 && (
              <ScannedItemsCard
                items={scannedItems}
                onChange={setScannedItems}
                merchant={scannedMerchant}
                tax={scannedTax}
                discount={scannedDiscount}
                currentAmount={amountNum}
              />
            )}

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

          <EntityAutocomplete
            value={scannedMerchant || ''}
            onValueChange={(v) => {
              setScannedMerchant(v || null);
              setUserPickedMerchant(true);
            }}
            fetchSuggestions={fetchMerchantSuggestions}
            textFieldProps={{ fullWidth: true, size: 'small', placeholder: 'Merchant (optional)', sx: { mt: 1 } }}
          />

          <Box sx={{ mt: 1 }}>
            <CategoryPickerField
              mainCategory={scannedCategory ? findMainCategory(scannedCategory) : ''}
              subcategory={scannedCategory || ''}
              onChange={(_main, sub) => {
                setScannedCategory(sub);
                setUserPickedCategory(true);
              }}
              label="Category ✨"
            />
          </Box>

          {scannedItems.length > 0 && (
            <ScannedItemsCard
              items={scannedItems}
              onChange={setScannedItems}
              merchant={scannedMerchant}
              tax={scannedTax}
              discount={scannedDiscount}
              currentAmount={amountNum}
            />
          )}

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
                  fontFamily: "'Bricolage Grotesque', sans-serif",
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
