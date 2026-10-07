import React from 'react';
import Drawer from '@mui/material/Drawer';
import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import InputBase from '@mui/material/InputBase';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import CloseIcon from '@mui/icons-material/CloseRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { typeScale, tabularNums, heroButtonSx } from '../../theme';
import { CATEGORY_GROUPS, findMainCategory } from './AddExpenseForm';
import { formatMoney } from './ExpenseFeed';
import { currencySymbol } from '../../utils/money';
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
import TagInput from './TagInput';
import CardPickerField from './CardPickerField';
import { useTagsEnabled } from '../../hooks/useTagsEnabled';
import { useCardCoachEnabled } from '../../hooks/useCardCoachEnabled';
import PaidBySplitSummary from '../groups/PaidBySplitSummary';
import { SplitEditorValue, computeSplitValid } from '../groups/SplitEditor';
import { computePayersValid } from '../groups/PayerPicker';
import { NEGATIVE_AMOUNT_HINT, isValidAmount, sanitizeAmountInput } from '../../utils/amount';

import { clearExpenseDraft, readExpenseDraft, writeExpenseDraft } from '../../utils/expenseDraft';
import ConfirmDialog from '../common/ConfirmDialog';
import { RequestError } from '../../api/request';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
/** CATEGORY_GROUPS.Other includes 'General' — used when suggestCategory can't classify. */
const FALLBACK_CATEGORY = 'General';

function pressKey(amount: string, key: string): string {
  if (key === '⌫') return amount.slice(0, -1);
  if (key === '.') return amount.includes('.') ? amount : (amount || '0') + '.';
  const dec = amount.split('.')[1];
  if (dec && dec.length >= 2) return amount;
  // Shares the server's ceiling, so the keypad cannot compose an amount the API
  // would reject with an opaque 422.
  const next = amount + key;
  return sanitizeAmountInput(next) === null ? amount : next;
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
  const { enabled: tagsEnabled } = useTagsEnabled();
  const { enabled: cardCoachEnabled } = useCardCoachEnabled();
  const { logPersonal, logToGroup, logPersonalWithItems, logToGroupWithItems } = useLogExpense();
  const fetchMerchantSuggestions = React.useCallback(
    (q: string) => (entityResolutionEnabled ? suggestMerchants(q) : Promise.resolve([])),
    [entityResolutionEnabled]
  );

  const [stage, setStage] = React.useState<'entry' | 'saved'>('entry');
  const owner = localStorage.getItem('vs_user') || '';
  const saveLock = React.useRef(false);
  const [unknownOutcome, setUnknownOutcome] = React.useState(false);
  const [restored, setRestored] = React.useState(false);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [storageFailed, setStorageFailed] = React.useState(false);
  const restoringSplit = React.useRef<string | null>(null);
  const [amount, setAmount] = React.useState('');
  const [amountHint, setAmountHint] = React.useState<string | null>(null);
  const [description, setDescription] = React.useState('');
  const [expenseDate, setExpenseDate] = React.useState(() => new Date().toISOString().split('T')[0]);
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
  const [scannedFingerprint, setScannedFingerprint] = React.useState<string | null>(null);
  const [groupDetail, setGroupDetail] = React.useState<GroupDetailResponse | null>(null);
  const [payers, setPayers] = React.useState<PayerSummaryItem[]>([]);
  const [splitValue, setSplitValue] = React.useState<SplitEditorValue>({ type: 'equal', entries: [] });
  const [tagNames, setTagNames] = React.useState<string[]>([]);
  const [cardId, setCardId] = React.useState<string | null>(null);
  // Design review (2026-09): merchant/category/tags/card used to render unconditionally —
  // "one compact interaction... reveal merchant, tags and advanced splits progressively."
  // Collapsed by default; auto-opens once a receipt scan actually populates merchant/category
  // (onAutoParse below) so a scanned result is never hidden from the user.
  const [moreOpen, setMoreOpen] = React.useState(false);
  // Tracks whether the user has explicitly saved a change out of PaidBySplitSummary's payer or
  // split picker — while false, payers/splitValue auto-track the live amount/group so the fast
  // "just me, split equally" default needs no interaction; once true, amount edits stop
  // silently rewriting a customized payer/split (see the effects below).
  const [customized, setCustomized] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAmount, setSavedAmount] = React.useState(0);
  const [savedCurrency, setSavedCurrency] = React.useState('USD');
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
        setMoreOpen(true);
      }
      if (hdr.category_name && CATEGORY_GROUPS[hdr.main_category_name]?.includes(hdr.category_name)) {
        setScannedCategory(hdr.category_name);
        setUserPickedCategory(true);
        setMoreOpen(true);
      }
      setScannedTax(Number(hdr.tax) || 0);
      setScannedDiscount(Number(hdr.discount) || 0);
      if (hdr.purchased_at) setExpenseDate(hdr.purchased_at.split('T')[0]);
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
    clearExpenseDraft();
    restoringSplit.current = null;
    setRestored(false);
    setUnknownOutcome(false);
    setStage('entry');
    setAmount('');
    setDescription('');
    setExpenseDate(new Date().toISOString().split('T')[0]);
    setWho(initialGroupId || 'me');
    setScannedCategory(null);
    setScannedMerchant(null);
    setUserPickedCategory(false);
    setUserPickedMerchant(false);
    setScannedItems([]);
    setScannedTax(0);
    setScannedDiscount(0);
    setScannedFingerprint(null);
    setGroupDetail(null);
    setPayers([]);
    setSplitValue({ type: 'equal', entries: [] });
    setTagNames([]);
    setCardId(null);
    setCustomized(false);
    setError(null);
    setMoreOpen(false);
    scan.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialGroupId]);

  const draft = { amount, description, expenseDate, who, scannedCategory, scannedMerchant,
    userPickedCategory, userPickedMerchant, scannedItems, scannedTax, scannedDiscount,
    scannedFingerprint, payers, splitValue, tagNames, cardId, customized,
    unknownOutcome: unknownOutcome || saving };
  const serializedDraft = JSON.stringify(draft);
  const dirty = stage === 'entry' && !!(amount || description || scannedItems.length);
  const draftReady = React.useRef(false);
  React.useEffect(() => {
    if (!open) { draftReady.current = false; return; }
    const saved = readExpenseDraft<typeof draft>(owner);
    if (saved && typeof saved.amount === 'string' && typeof saved.description === 'string' && Array.isArray(saved.scannedItems) && Array.isArray(saved.payers) && Array.isArray(saved.tagNames) && typeof saved.who === 'string' && typeof saved.expenseDate === 'string' && Array.isArray(saved.splitValue?.entries)) {
      setStage('entry'); setRestored(true);
      setAmount(saved.amount); setDescription(saved.description); setExpenseDate(saved.expenseDate);
      setWho(saved.who); setScannedCategory(saved.scannedCategory); setScannedMerchant(saved.scannedMerchant);
      setUserPickedCategory(saved.userPickedCategory); setUserPickedMerchant(saved.userPickedMerchant);
      setScannedItems(saved.scannedItems); setScannedTax(saved.scannedTax); setScannedDiscount(saved.scannedDiscount);
      setScannedFingerprint(saved.scannedFingerprint); setPayers(saved.payers); setSplitValue(saved.splitValue);
      setTagNames(saved.tagNames); setCardId(saved.cardId); setCustomized(saved.customized);
      setUnknownOutcome(saved.unknownOutcome); restoringSplit.current = saved.customized ? saved.who : null;
    } else reset();
    // Restore before the next render persists values; never overwrite the draft with empty fields.
    draftReady.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, owner]);
  React.useEffect(() => {
    if (!open || stage !== 'entry') return;
    if (!draftReady.current) { draftReady.current = true; return; }
    if (dirty) setStorageFailed(!writeExpenseDraft(owner, JSON.parse(serializedDraft)));
    else clearExpenseDraft();
  }, [open, stage, dirty, owner, serializedDraft]);
  React.useEffect(() => {
    if (!open || !dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [open, dirty]);
  const requestClose = () => { if (saving) return; onClose(); };
  const recoveryNotice = <>
    {restored && <Typography role="status" variant="body2">Your unsaved expense was restored. Review it before saving.</Typography>}
    {storageFailed && <Typography role="alert" color="error">This browser cannot keep a draft. Keep this tab open until you save.</Typography>}
    {unknownOutcome && <Typography role="alert" color="error">The save outcome is unknown. Check Expenses before saving again to avoid a duplicate.</Typography>}
    {unknownOutcome && <Button sx={{ minHeight: 44 }} onClick={() => setUnknownOutcome(false)}>I checked Expenses — allow another save</Button>}
    <Button sx={{ minHeight: 44 }} color="error" onClick={() => setDiscardOpen(true)} disabled={!dirty || saving}>Discard draft</Button>
    <ConfirmDialog open={discardOpen} title="Discard this expense?" message="This removes your unsaved entry." confirmLabel="Discard" destructive onCancel={() => setDiscardOpen(false)} onConfirm={() => { setDiscardOpen(false); reset(); onClose(); }} />
  </>;

  // Debounced AI category/merchant suggestion as the user types — mirrors AddExpenseScreen's
  // mobile equivalent. Never overwrites a value that came from a receipt scan or the user's own
  // edit (userPickedCategory/userPickedMerchant), and never fires while a receipt scan is being
  // parsed (its onAutoParse result should win outright).
  React.useEffect(() => {
    if (!open || !owner || scan.parsing || scan.converting) return;
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
  }, [open, owner, description, userPickedCategory, userPickedMerchant, scan.parsing, scan.converting]);

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
  // Prefer the freshly-fetched detail once it lands; selectedGroup's own currency (from the
  // GroupSummary list) covers the brief window right after picking a group before that fetch
  // resolves, so the amount display doesn't flash `$` and then switch.
  const activeCurrency = groupDetail?.currency ?? selectedGroup?.currency ?? 'USD';

  // Fetch fresh membership before saving. Preserve recovered/customized splits on reopen;
  // the readiness guard rejects stale members rather than silently changing their shares.
  React.useEffect(() => {
    if (!open) return;
    if (!selectedGroup) {
      setGroupDetail(null);
      if (who === 'me' && !restoringSplit.current) {
        setPayers([]);
        setSplitValue({ type: 'equal', entries: [] });
        setCustomized(false);
      }
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const detail = await getGroup(selectedGroup.group_id);
        if (!mounted) return;
        setGroupDetail(detail);
        if (restoringSplit.current === selectedGroup.group_id) {
          restoringSplit.current = null;
          return;
        }
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
  const knownMembers = !selectedGroup || (!!groupDetail && [...payers, ...splitValue.entries].every((entry) => groupDetail.members.some((member) => member.member_id === entry.member_id)));
  const ready = !!owner && !unknownOutcome && (who === 'me' || !!selectedGroup) && knownMembers && isValidAmount(amountNum) && description.trim() !== '' && !saving && payersValid && splitValid;

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
    if (!ready || saveLock.current || localStorage.getItem('vs_user') !== owner) return;
    saveLock.current = true;
    setSaving(true);
    writeExpenseDraft(owner, { ...draft, unknownOutcome: true });
    setError(null);
    try {
      const category = await resolveCategory();
      if (localStorage.getItem('vs_user') !== owner) throw new Error('Your session ended. Sign in again to resume your draft.');
      if (selectedGroup) {
        const { myShare } = itemsToSave.length > 0
          ? await logToGroupWithItems(selectedGroup.group_id, {
              description: description.trim(),
              category,
              amount: amountNum,
              merchantName: scannedMerchant || undefined,
              date: expenseDate,
              items: itemsToSave,
              tax: scannedTax,
              discount: scannedDiscount,
              payers,
              participantMemberIds: splitValue.entries.map((e) => e.member_id),
              tagNames,
              cardId,
            })
          : await logToGroup(selectedGroup.group_id, {
              description: description.trim(),
              category,
              amount: amountNum,
              merchantName: scannedMerchant || undefined,
              date: expenseDate,
              payers,
              split: splitValue,
              tagNames,
              cardId,
            });
        setSavedLine(`Logged to ${selectedGroup.name} — your share ${formatMoney(myShare, activeCurrency)} joins your personal total automatically.`);
      } else if (itemsToSave.length > 0) {
        await logPersonalWithItems({
          description: description.trim(),
          category,
          amount: amountNum,
          merchantName: scannedMerchant || undefined,
          date: expenseDate,
          items: itemsToSave,
          tax: scannedTax,
          discount: scannedDiscount,
          purchasedAtIso: `${expenseDate}T00:00:00`,
          fingerprint: scannedFingerprint || undefined,
          tagNames,
          cardId,
        });
        setSavedLine('Logged to your personal ledger.');
      } else {
        await logPersonal({
          description: description.trim(),
          category,
          amount: amountNum,
          merchantName: scannedMerchant || undefined,
          date: expenseDate,
          tagNames,
          cardId,
        });
        setSavedLine('Logged to your personal ledger.');
      }
      setSavedAmount(amountNum);
      setSavedCurrency(activeCurrency);
      clearExpenseDraft(owner, { ...draft, unknownOutcome: true });
      setStage('saved');
    } catch (error) {
      if (error instanceof RequestError ? error.outcomeUnknown : !/session ended|Session expired/.test(error instanceof Error ? error.message : '')) setUnknownOutcome(true);
      setError(error instanceof Error ? error.message : 'Failed to save expense. Your draft is kept.');
    } finally {
      saveLock.current = false;
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

  // Scan failures (including the daily scan limit) used to be swallowed here; the rest of the
  // form stays usable, so the user can just type the expense in.
  const scanErrorLine = scan.error ? (
    <Typography sx={{ fontSize: 12.5, color: 'error.main', mt: 1 }}>{scan.error}</Typography>
  ) : null;

  const whoChips = groupsEnabled && (
    <Box sx={{ display: 'flex', gap: 0.75, mt: 1.25, flexWrap: 'wrap' }}>
      {[{ id: 'me', name: 'Just me' }, ...groups.map((g) => ({ id: g.group_id, name: g.name }))].map((chip) => {
        const active = who === chip.id;
        return (
          <Box
            key={chip.id}
            data-testid={`who-chip-${chip.id}`}
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

  // Design review (2026-09) — collapsed by default (see `moreOpen` above), shared between the
  // desktop dialog and mobile drawer so both stay in lockstep instead of drifting separately.
  const moreOptionsToggle = (
    <Box sx={{ mt: 1 }}>
      <Button
        size="small"
        variant="text"
        color="inherit"
        onClick={() => setMoreOpen((v) => !v)}
        endIcon={moreOpen ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
        sx={{ color: 'text.secondary', px: 0 }}
      >
        {moreOpen ? 'Fewer options' : 'More options — merchant, tags, card'}
      </Button>
    </Box>
  );

  // Plain conditional render, not <Collapse>: inside the bottom-sheet Drawer the Collapse
  // container stayed at its collapsed height after opening, so the revealed fields painted
  // over the "who was this with" chips and split summary below instead of pushing them down.
  const moreOptionsContent = moreOpen && (
    <Box>
      <Box sx={{ mt: 1 }}>
        <EntityAutocomplete
          value={scannedMerchant || ''}
          onValueChange={(v) => {
            setScannedMerchant(v || null);
            setUserPickedMerchant(true);
          }}
          fetchSuggestions={fetchMerchantSuggestions}
          textFieldProps={{ fullWidth: true, size: 'small', placeholder: 'Merchant (optional)' }}
        />

        <Box sx={{ mt: 1.25 }}>
          <CategoryPickerField
            mainCategory={scannedCategory ? findMainCategory(scannedCategory) : ''}
            subcategory={scannedCategory || ''}
            onChange={(_main, sub) => {
              setScannedCategory(sub);
              setUserPickedCategory(true);
            }}
            label="Category"
          />
        </Box>

        {tagsEnabled && (
          <Box sx={{ mt: 1.25 }}>
            <TagInput value={tagNames} onChange={setTagNames} />
          </Box>
        )}

        {cardCoachEnabled && (
          <Box sx={{ mt: 1.25 }}>
            <CardPickerField value={cardId} onChange={setCardId} />
          </Box>
        )}
      </Box>
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
        currency={activeCurrency}
      />
    </Box>
  );

  const errorLine = error && (
    <Typography role="alert" color="error" variant="caption" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
      {error}
    </Typography>
  );

  const saveButton = (
    <Button
      fullWidth
      variant="contained"
      disabled={!ready}
      onClick={handleSave}
      data-testid="quick-capture-save"
      // Quick Capture's Save is the one hero CTA on this screen (design system rule: one
      // gradient CTA per screen) — every other contained-primary button app-wide is flat.
      sx={{ mt: 1.5, height: 48, borderRadius: 1.5, fontSize: 15, ...heroButtonSx }}
    >
      {saving ? <CircularProgress size={20} sx={{ color: 'inherit' }} /> : selectedGroup ? 'Save & split' : 'Save expense'}
    </Button>
  );

  const savedPanel = (
    <Box role="status" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25, py: 2.25 }}>
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
        {formatMoney(savedAmount, savedCurrency)}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', px: 1.5 }}>
        {savedLine}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
        <Button variant="outlined" sx={{ borderRadius: 999 }} onClick={reset}>
          Log another
        </Button>
        <Button variant="contained" sx={{ borderRadius: 999 }} onClick={requestClose}>
          Done
        </Button>
      </Box>
    </Box>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onClose={requestClose} maxWidth="xs" fullWidth PaperProps={{ 'aria-label': 'New expense', sx: { borderRadius: 2, p: 2.5 } }}>
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
                <IconButton aria-label="Close" onClick={requestClose} size="small">
                  <CloseIcon />
                </IconButton>
              </Box>
            </Box>
            {scanErrorLine}
            {recoveryNotice}

            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, pt: 1.5, pb: 0.5 }}>
              <Typography
                variant="caption"
                sx={{ ...typeScale.label, color: 'text.secondary', flexShrink: 0 }}
              >
                Amount
              </Typography>
              <TextField
                variant="standard"
                value={amount}
                onChange={(e) => {
                  const next = sanitizeAmountInput(e.target.value);
                  setAmountHint(e.target.value.includes('-') ? NEGATIVE_AMOUNT_HINT : null);
                  if (next !== null) setAmount(next);
                }}
                placeholder="0.00"
                autoFocus
                slotProps={{ input: { disableUnderline: true } }}
                inputProps={{
                  'data-testid': 'quick-capture-amount',
                  // The visible "AMOUNT" caption isn't a <label>, and a placeholder isn't a name.
                  'aria-label': 'Amount',
                  style: {
                    textAlign: 'left',
                    fontFamily: "'Bricolage Grotesque', sans-serif",
                    fontWeight: 600,
                    fontSize: 24,
                    ...tabularNums,
                  },
                }}
                // Matches the Description field's height right below it — this used to render
                // at 44px font with no border, which (combined with the global focus-visible
                // outline) read as an oversized, off-center box rather than a compact field.
                sx={{ width: 160, '& .MuiInputBase-input': { py: 0.5 } }}
              />
            </Box>
            {amountHint && (
              <Typography role="alert" variant="caption" color="error" sx={{ mt: -1 }}>
                {amountHint}
              </Typography>
            )}

            <TextField
              fullWidth
              size="small"
              placeholder="Description (AI suggests from merchant)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              inputProps={{ 'data-testid': 'quick-capture-description' }}
              sx={{ mt: 1 }}
            />

            <TextField
              fullWidth
              size="small"
              label="Date"
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ mt: 1 }}
            />

            {moreOptionsToggle}
            {moreOptionsContent}

            {scannedItems.length > 0 && (
              <ScannedItemsCard
                items={scannedItems}
                onChange={setScannedItems}
                merchant={scannedMerchant}
                tax={scannedTax}
                discount={scannedDiscount}
                currentAmount={amountNum}
                currency={activeCurrency}
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
      onClose={requestClose}
      ModalProps={{ keepMounted: false }}
      PaperProps={{
        role: 'dialog',
        'aria-modal': true,
        'aria-label': 'New expense',
        sx: {
          width: '100%',
          maxWidth: '100%',
          maxHeight: 'calc(100% - 64px)', // stay below the fixed app bar
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
              <IconButton aria-label="Close" onClick={requestClose} sx={{ width: 44, height: 44, mr: -1 }}>
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
          {scanErrorLine}
            {recoveryNotice}

          <Box sx={{ textAlign: 'center', pt: 1.25, pb: 0.5 }}>
            {/* A real, labelled input (it was a plain div): keyboard, screen-reader and paste users
                can enter the amount, and the on-screen keys below remain as a shortcut. */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography component="span" aria-hidden sx={{ ...typeScale.displayHero, fontSize: 42, color: amount ? 'text.primary' : 'text.disabled' }}>
                {currencySymbol(activeCurrency)}
              </Typography>
              <InputBase
                value={amount}
                onChange={(e) => {
                  const next = sanitizeAmountInput(e.target.value);
                  setAmountHint(e.target.value.includes('-') ? NEGATIVE_AMOUNT_HINT : null);
                  if (next !== null) setAmount(next);
                }}
                placeholder="0.00"
                inputProps={{
                  'aria-label': 'Amount',
                  'data-testid': 'quick-capture-amount-display',
                  inputMode: 'decimal',
                  autoComplete: 'off',
                  style: { textAlign: 'left', width: `${Math.max(4, amount.length + 1)}ch` },
                }}
                sx={{
                  ...typeScale.displayHero,
                  fontSize: 42,
                  minHeight: 52,
                  borderBottom: '2px solid transparent',
                  '&:focus-within': { borderBottomColor: 'primary.main' },
                  '& input': { p: 0, font: 'inherit', fontSize: 42, minWidth: '4ch', maxWidth: '12ch' },
                  // The focus cue is the underline above; the global focus ring boxed the number.
                  '& input:focus-visible': { outline: 'none !important' },
                }}
              />
            </Box>
            {amountHint && (
              <Typography role="alert" variant="caption" color="error">
                {amountHint}
              </Typography>
            )}
          </Box>

          <TextField
            fullWidth
            size="small"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            inputProps={{ 'data-testid': 'quick-capture-description' }}
            sx={{ mt: 1 }}
          />

          <TextField
            fullWidth
            size="small"
            label="Date"
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 1 }}
          />

          {moreOptionsToggle}
          {moreOptionsContent}

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
              <ButtonBase
                key={k}
                data-testid={`keypad-${k === '⌫' ? 'backspace' : k === '.' ? 'decimal' : k}`}
                aria-label={k === '⌫' ? 'Backspace' : k === '.' ? 'Decimal point' : k}
                onClick={() => setAmount((a) => pressKey(a, k))}
                sx={{
                  height: 46,
                  borderRadius: 1.25,
                  bgcolor: 'action.hover',
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontSize: 20,
                  fontWeight: 600,
                  userSelect: 'none',
                  '&:active': { bgcolor: 'action.selected' },
                  '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
                }}
              >
                <span aria-hidden>{k}</span>
              </ButtonBase>
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
