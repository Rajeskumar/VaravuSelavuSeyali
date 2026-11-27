/**
 * AddExpenseScreen.tsx — TrackSpense v3 Mobile "Quick Capture" sheet (see
 * `TrackSpense v3 Mobile.dc.html`'s `capIsEntry`/`capIsSaved` blocks). File path and the exported
 * `AddExpenseContext`/`AddExpenseProvider` shell are kept as-is — six call sites across the app
 * (`App.tsx`'s FAB, `HomeScreen`/`AnalysisScreen`/`ItemDetailScreen`/`MerchantDetailScreen`'s
 * empty-state CTAs, `GroupDetailScreen`'s "+ Add expense") depend on
 * `useContext(AddExpenseContext).openAddExpense` — only the internal sheet changed.
 *
 * This replaces what used to be a 759-line rich form (full category picker, date field, currency
 * override, multi-payer, itemized receipt split) with the mock's much simpler keypad-driven flow:
 * amount via a 12-key pad, one description field, "who" chips (Just me + real groups, equal-split
 * only), Save, then a success screen. Verified before rewriting that this form was create-only —
 * group expense edits go through `EditGroupExpenseModal.tsx`, personal edits through
 * `ExpensesScreen.tsx`'s own inline modal — so nothing is lost for *editing*; only the *creation*
 * flow's power-user controls (multi-payer, itemized splits, currency override, explicit category
 * picker) are gone, the same trade-off already accepted for the web app's own Quick Capture — a
 * date field was reintroduced (defaults to today, editable via a native date picker) so past
 * bills can be backdated. Category (and merchant) are AI-suggested via the existing debounced
 * `categorizeExpense()` call and now surfaced live via CategoryPickerField / the merchant
 * TypeaheadInput — previously these were silently resolved but never shown or editable before
 * being persisted. `userPickedCategory`/`userPickedMerchant` stop the debounce from clobbering a
 * receipt scan's values or the user's own manual pick once either has happened.
 */
import { expenseDateMin, expenseDateProblem } from '../utils/expenseDates';
import { readExpenseDraft, writeExpenseDraft, clearExpenseDraft } from '../utils/expenseDraft';
import { RequestError } from '../../../core/api/request';
import { analytics } from '../../../core/analytics';
import { categoryDisposition, durationBucket, ExpenseCapture, safeFailure, track } from '../../shared/analytics/operations';
import { reportPermission } from '../../shared/analytics/permissions';
import React, { useState, useRef, useCallback, createContext, useMemo } from 'react';
import {
  Alert,
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput as RNTextInput, ActivityIndicator, Modal, Animated,
  Dimensions, Pressable, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useAuth } from '../../../core/auth/AuthContext';
import { addExpense, addExpenseWithItems, categorizeExpense, parseReceiptOcr, uploadReceipt } from '../api/expenses';
import { recognizeReceipt, toUploadableJpeg } from '../../receipts/utils/onDeviceOcr';
import {
  listGroups, getGroupDetail, addGroupExpense, addGroupExpenseWithItems,
  GroupSummary, GroupDetail, GroupExpenseItemEntry, PayerSummaryItem, ApiError,
} from '../../groups/api/groups';
import { upsertRecurringTemplate } from '../../recurring/api/recurring';
import { useAppTheme } from '../../../core/theme/ThemeContext';
import { AppTheme, inkOnPastel } from '../../../core/theme/theme';
import Chip from '../../../core/ui/Chip';
import { showToast } from '../../../core/ui/Toast';
import ScannedItemsCard, { ScannedItem } from '../../receipts/components/ScannedItemsCard';
import TypeaheadInput from '../../../core/ui/TypeaheadInput';
import CategoryPickerField from '../components/CategoryPickerField';
import OptionSheet from '../../../core/ui/OptionSheet';
import ToggleSwitch from '../../../core/ui/ToggleSwitch';
import { listMyCards } from '../../cards/api/cards';
import { useCardCoachEnabled } from '../../cards/hooks/useCardCoachEnabled';
import { useTagsEnabled } from '../../tags/hooks/useTagsEnabled';
import { applyTagsToExpense } from '../../tags/api/tags';
import TagPickerModal from '../../tags/components/TagPickerModal';
import { suggestMerchants } from '../../receipts/api/entityResolution';
import { useEntityResolutionEnabled } from '../../receipts/hooks/useEntityResolutionEnabled';
import SplitSheet, { paidByName } from '../../groups/components/SplitSheet';
import ReceiptScanScreen from '../../receipts/components/ReceiptScanScreen';
import ReceiptItemsSheet from '../../receipts/components/ReceiptItemsSheet';
import { RECEIPT_SPLIT_TYPES, ReceiptReviewLine, fromServerLine, receiptShareFor, receiptTotals, toSaveLine } from '../../receipts/utils/receiptLines';
import { SplitEditorValue, computeSplitValid } from '../../groups/components/SplitEditor';
import { computePayersValid } from '../../groups/components/PayerPicker';
import { notifyExpenseChanged } from '../utils/expenseEvents';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import KeyboardLift from '../../../core/ui/KeyboardLift';

const { height: SCREEN_H } = Dimensions.get('window');

function formatMMDDYYYY(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

/** "Aug 4, 2026" (year omitted when it's the current one) for the compact date row. */
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatShortDate(d: Date): string {
  const includeYear = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: includeYear ? 'numeric' : undefined });
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** "1st"/"2nd"/"3rd"/"4th" — matches the mock's "Repeats monthly on the 15th." copy. */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const GROUP_TYPE_EMOJI: Record<string, string> = { other: '👥', trip: '✈️', home: '🏠', couple: '💑' };

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
// Stable ASCII ids for the native E2E suite (a '.' or '⌫' in a testID is a regex trap in Maestro).
const KEY_TEST_ID: Record<string, string> = { '.': 'dot', '⌫': 'backspace' };
// Spoken names for the two keys that are only glyphs (digits are read as themselves).
const KEY_A11Y_LABEL: Record<string, string> = { '.': 'Decimal point', '⌫': 'Delete' };

export interface AddExpenseContextType {
  /** `initialGroupId` pre-selects that group's "who" chip on open — used by GroupDetailScreen's
   * own "+ Add expense" button so Quick Capture opens already scoped to that group. */
  openAddExpense: (initialGroupId?: string) => void;
  closeAddExpense: () => void;
}

export const AddExpenseContext = createContext<AddExpenseContextType>({
  openAddExpense: () => {},
  closeAddExpense: () => {},
});

export default function AddExpenseProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const saveLock = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [restored, setRestored] = useState(false);
  const restoringSplit = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [stage, setStage] = useState<'entry' | 'saved'>('entry');
  const [amt, setAmt] = useState('');
  const [desc, setDesc] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => startOfDay(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  // V2 keypad-first: category / merchant / card / repeat live behind a "More" chip so the default
  // path is amount → one description → Save. Split target and scanned items stay visible when set.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Who / Card chips each open a small option sheet.
  const [pickerSheet, setPickerSheet] = useState<'who' | 'card' | null>(null);
  const [who, setWho] = useState('me');
  const [merchantName, setMerchantName] = useState('');
  const [mainCategory, setMainCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  // Set once a value came from a receipt scan or the user's own edit — stops the debounced
  // auto-suggest in handleDescChange from overwriting either with a lower-confidence guess after.
  const [userPickedCategory, setUserPickedCategory] = useState(false);
  const [userPickedMerchant, setUserPickedMerchant] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);
  const { enabled: cardCoachEnabled } = useCardCoachEnabled();
  const { enabled: tagsEnabled } = useTagsEnabled();
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [tagPickerVisible, setTagPickerVisible] = useState(false);
  const { data: myCards = [] } = useQuery({ queryKey: ['cards-mine'], queryFn: listMyCards, enabled: cardCoachEnabled });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [scannedTax, setScannedTax] = useState(0);
  const [scannedTip, setScannedTip] = useState(0);
  const [scannedReview, setScannedReview] = useState<ReceiptReviewLine[]>([]);
  const [scannedPurchasedAt, setScannedPurchasedAt] = useState<string | null>(null);
  const [scannedFingerprint, setScannedFingerprint] = useState<string | null>(null);
  // Full-screen scanner, the itemised review sheet, and the split sheet.
  const [scanVisible, setScanVisible] = useState(false);
  const [itemsVisible, setItemsVisible] = useState(false);
  const [splitVisible, setSplitVisible] = useState(false);
  // Who each scanned line belongs to (group expenses); missing = split among everyone.
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null);
  const [payers, setPayers] = useState<PayerSummaryItem[]>([]);
  const [splitValue, setSplitValue] = useState<SplitEditorValue>({ type: 'equal', entries: [] });
  // Tracks whether the user has explicitly saved a change out of the split sheet's payer or
  // split picker — while false, payers/splitValue auto-track the live amount/group so the fast
  // "just me, split equally" default needs no interaction; once true, amount edits stop
  // silently rewriting a customized payer/split (see the effects below).
  const [customized, setCustomized] = useState(false);
  const [savedAmt, setSavedAmt] = useState(0);
  const [savedLine, setSavedLine] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The category the server last suggested for this form, as "main/sub" (analytics only; never sent).
  const suggestedCategoryRef = useRef<string | undefined>(undefined);
  const suggestSeq = useRef(0);
  // One suggestion outcome per draft: a draft is typed with pauses, and each pause would otherwise count.
  const suggestionReported = useRef(false);

  const { accessToken, userEmail } = useAuth();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { enabled: entityResolutionEnabled } = useEntityResolutionEnabled();
  const fetchMerchantSuggestions = useCallback(
    (q: string) => (entityResolutionEnabled ? suggestMerchants(q) : Promise.resolve([])),
    [entityResolutionEnabled]
  );

  const resetForm = (initialWho: string) => {
    clearExpenseDraft().catch(() => {});
    suggestedCategoryRef.current = undefined; suggestSeq.current++; suggestionReported.current = false;
    restoringSplit.current = null;
    setRestored(false); setUnknownOutcome(false);
    setDetailsOpen(false);
    setStage('entry');
    setAmt('');
    setDesc('');
    setExpenseDate(startOfDay(new Date()));
    setShowDatePicker(false);
    setMerchantName('');
    setMainCategory('');
    setSubcategory('');
    setUserPickedCategory(false);
    setUserPickedMerchant(false);
    setRecurring(false);
    setCardId(null);
    setWho(initialWho);
    setScannedItems([]);
    setScannedTax(0);
    setScannedTip(0);
    setScannedReview([]);
    setScannedPurchasedAt(null);
    setScannedFingerprint(null);
    setScanVisible(false);
    setItemsVisible(false);
    setSplitVisible(false);
    setTagNames([]);
    setTagPickerVisible(false);
    setGroupDetail(null);
    setPayers([]);
    setSplitValue({ type: 'equal', entries: [] });
    setCustomized(false);
  };

  const draft = { amt, desc, merchantName, mainCategory, subcategory, userPickedCategory, userPickedMerchant, recurring, cardId, who, scannedItems, scannedTax, scannedTip, scannedReview, scannedPurchasedAt, scannedFingerprint, tagNames, payers, splitValue, customized, expenseDate: expenseDate.getTime(), unknownOutcome: unknownOutcome || loading };
  const dirty = stage === 'entry' && !!(amt || desc || scannedItems.length);
  React.useEffect(() => {
    let mounted = true;
    if (!userEmail) return;
    readExpenseDraft<typeof draft>(userEmail).then((saved) => {
      if (!mounted) return;
      if (saved && typeof saved.amt === 'string' && typeof saved.desc === 'string' && Number.isFinite(saved.expenseDate) && Array.isArray(saved.scannedItems) && Array.isArray(saved.payers) && Array.isArray(saved.tagNames) && typeof saved.who === 'string' && Array.isArray(saved.splitValue?.entries)) {
      setAmt(saved.amt);
      setDesc(saved.desc);
      setMerchantName(saved.merchantName);
      setMainCategory(saved.mainCategory);
      setSubcategory(saved.subcategory);
      setUserPickedCategory(saved.userPickedCategory);
      setUserPickedMerchant(saved.userPickedMerchant);
      setRecurring(saved.recurring);
      setCardId(saved.cardId);
      setWho(saved.who);
      setScannedItems(saved.scannedItems);
      setScannedTax(saved.scannedTax);
      setScannedTip(Number(saved.scannedTip) || 0);
      setScannedReview(Array.isArray(saved.scannedReview) ? saved.scannedReview : []);
      setScannedPurchasedAt(saved.scannedPurchasedAt);
      setScannedFingerprint(saved.scannedFingerprint);
      setTagNames(saved.tagNames);
      setPayers(saved.payers);
      setSplitValue(saved.splitValue);
      setCustomized(saved.customized);
        setExpenseDate(new Date(saved.expenseDate)); setUnknownOutcome(saved.unknownOutcome);
        restoringSplit.current = saved.customized ? saved.who : null;
        setRestored(true); setVisible(true); translateY.setValue(0); backdropOpacity.setValue(1);
      }
      setHydrated(true);
    }).catch(() => {
      if (mounted) { setHydrated(true); showToast({ message: 'Draft recovery is unavailable on this device.', type: 'warning' }); }
    });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);
  React.useEffect(() => {
    if (!hydrated || !userEmail || stage !== 'entry' || !dirty) return;
    writeExpenseDraft(userEmail, draft).catch(() => showToast({ message: 'Could not keep a draft. Keep the app open until you save.', type: 'warning' }));
    // The serialized value limits writes to actual form changes, including the save outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, userEmail, stage, JSON.stringify(draft)]);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const openAddExpense = useCallback((initialGroupId?: string) => {
    if (!dirtyRef.current) resetForm(initialGroupId ?? 'me');
    setVisible(true);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeAddExpense = useCallback(() => {
    if (saveLock.current) return;
    Animated.parallel([
      Animated.timing(translateY, { toValue: SCREEN_H, duration: 300, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setVisible(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDescChange = useCallback((text: string) => {
    setDesc(text);
    suggestSeq.current++; // every edit makes an in-flight suggestion stale
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length >= 3) {
      debounceRef.current = setTimeout(async () => {
        const seq = suggestSeq.current;
        const startedAt = Date.now();
        try {
          const result = await categorizeExpense(text.trim());
          if (seq === suggestSeq.current) {
            if (result.main_category) suggestedCategoryRef.current = `${result.main_category}/${result.subcategory || 'General'}`;
            if (!suggestionReported.current) {
              suggestionReported.current = true;
              track('category_suggestion_completed', { duration_bucket: durationBucket(Date.now() - startedAt) });
            }
          }
          if (!userPickedCategory) {
            if (result.main_category) setMainCategory(result.main_category);
            if (result.subcategory) setSubcategory(result.subcategory);
          }
          if (!userPickedMerchant && result.merchant_name) setMerchantName(result.merchant_name);
        } catch (error) {
          /* best-effort — falls back to defaults at save time */
          if (seq === suggestSeq.current && !suggestionReported.current) {
            suggestionReported.current = true;
            track('category_suggestion_failed', { ...safeFailure(error), duration_bucket: durationBucket(Date.now() - startedAt) });
          }
        }
      }, 800);
    }
  }, [userPickedCategory, userPickedMerchant]);

  const capPress = (k: string) => {
    setAmt((prev) => {
      if (k === '⌫') return prev.slice(0, -1);
      if (k === '.') return prev.includes('.') ? prev : (prev || '0') + '.';
      const dec = prev.split('.')[1];
      if (dec && dec.length >= 2) return prev;
      if (prev.replace('.', '').length >= 7) return prev;
      return prev + k;
    });
  };

  // Applies a parsed receipt (personal `/ingest/receipt/parse` header + items) onto the
  // Quick Capture form fields — mirrors the web app's QuickCaptureSheet onAutoParse handler.
  const applyParseResult = (res: any) => {
    const hdr = res.header || {};
    if (hdr.amount) setAmt(Number(hdr.amount).toFixed(2));
    const merchant = hdr.merchant_name || hdr.merchant || '';
    const description = hdr.description || (merchant ? `Receipt from ${merchant}` : '');
    if (description) setDesc(description);
    if (merchant) {
      setMerchantName(merchant);
      setUserPickedMerchant(true);
    }
    if (hdr.main_category_name) setMainCategory(hdr.main_category_name);
    if (hdr.category_name) {
      setSubcategory(hdr.category_name);
      setUserPickedCategory(true);
    }
    setScannedTax(Number(hdr.tax) || 0);
    // TS-FIX-102: the server already folded coupons and whole-receipt discounts into the line
    // prices; the tip is kept, and returns/refunds come back separately for review.
    setScannedTip(Number(hdr.tip) || 0);
    setScannedReview(Array.isArray(res.review) ? res.review : []);
    setScannedPurchasedAt(hdr.purchased_at || null);
    if (hdr.purchased_at) {
      // Parse the "YYYY-MM-DD" calendar date directly rather than via `new
      // Date(string)`, which JS treats as UTC midnight — reading that back
      // through local getters (what startOfDay/formatMMDDYYYY do) rolls the
      // date back a day in any negative-UTC-offset timezone.
      const [y, m, d] = String(hdr.purchased_at).split('T')[0].split('-').map((n) => parseInt(n, 10));
      if (y && m && d) setExpenseDate(new Date(y, m - 1, d));
    }
    setScannedFingerprint(res.fingerprint || null);
    // A receipt is split on its total by Equal, Exact or Shares (TS-FIX-102); a Percentage or
    // Adjustment split chosen before scanning drops back to Equal over the same people.
    setSplitValue((v) => ((RECEIPT_SPLIT_TYPES as readonly string[]).includes(v.type) ? v : { type: 'equal', entries: v.entries }));
    setScannedItems(
      (res.items || []).map((it: any, idx: number) => ({ ...fromServerLine(it, idx), category_name: it.category_name }))
    );
  };

  // Reads a receipt photo into the form. On success the scanner closes and — when line items were
  // found — the Items review sheet opens; otherwise the filled-in capture sheet is left showing.
  const parseReceiptUri = async (uri: string, width?: number) => {
    setScanning(true);
    const operation = analytics.beginOperation();
    const startedAt = Date.now();
    track('receipt_parse_started', {}, operation);
    try {
      // On-device OCR first: only the recognized text leaves the phone. When ML Kit is
      // unavailable or the server can't vouch for that read (needs_image), upload the photo so
      // server OCR — and, if needed, its metered AI fallback — get a turn.
      let res: any = null;
      const ocr = await recognizeReceipt(uri);
      if (ocr) {
        try {
          const parsed = await parseReceiptOcr(ocr);
          if (!parsed.needs_image) res = parsed;
        } catch {
          // fall through to the upload
        }
      }
      if (!res) res = await uploadReceipt(await toUploadableJpeg(uri, width), accessToken || '');
      applyParseResult(res);
      track('receipt_parse_completed', { duration_bucket: durationBucket(Date.now() - startedAt) }, operation);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScanVisible(false);
      if ((res.items || []).length > 0) setItemsVisible(true);
    } catch (error: any) {
      // Declining the AI prompt is a user choice, not a service failure.
      track('receipt_parse_failed', { ...safeFailure(error, false, error?.name === 'AiConsentDeclined'), duration_bucket: durationBucket(Date.now() - startedAt) }, operation);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast({ message: error.message || 'Failed to parse receipt', type: 'error' });
    } finally {
      setScanning(false);
    }
  };

  const pickReceipt = async (source: 'camera' | 'library') => {
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      reportPermission(source === 'camera' ? 'camera' : 'photos', permission);
      if (!permission.granted) {
        showToast({ message: 'Permission needed to scan a receipt', type: 'error' });
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled || !result.assets?.[0]) return;
      track('receipt_image_selected', { source });
      await parseReceiptUri(result.assets[0].uri, result.assets[0].width);
    } catch {
      showToast({ message: 'Failed to open camera or photo library', type: 'error' });
    }
  };

  // Same query key useQuickLogBar.ts uses for its group list — shared cache, no duplicate fetch.
  const { data: groupsData } = useQuery({
    queryKey: ['groups', false],
    queryFn: () => listGroups(false),
    retry: (count, err) => (err instanceof ApiError && err.status === 404 ? false : count < 1),
    staleTime: 60_000,
    enabled: !!accessToken,
  });
  const groupsEnabled = Array.isArray(groupsData);
  const myGroups: GroupSummary[] = groupsData ?? [];

  const numAmount = parseFloat(amt || '0') || 0;
  const isGroup = who !== 'me';
  const selectedGroup = myGroups.find((g) => g.group_id === who);
  const myMemberId = groupDetail?.members.find((m) => m.user_email === userEmail)?.member_id;

  // Fetch fresh membership before saving. Preserve recovered/customized splits on reopen;
  // the readiness guard rejects stale members rather than silently changing their shares.
  React.useEffect(() => {
    if (!visible) {
      // Keep the editable split while the sheet is closed; revalidate membership on reopen.
      if (customized && who !== 'me') restoringSplit.current = who;
      return;
    }
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
        const detail = await getGroupDetail(selectedGroup.group_id);
        if (!mounted) return;
        setGroupDetail(detail);
        if (restoringSplit.current === selectedGroup.group_id) { restoringSplit.current = null; return; }
        const mine = detail.members.find((m) => m.user_email === userEmail);
        setPayers(mine ? [{ member_id: mine.member_id, amount_paid: numAmount }] : []);
        setSplitValue({ type: 'equal', entries: detail.members.map((m) => ({ member_id: m.member_id })) });
        setCustomized(false);
      } catch {
        if (mounted) setGroupDetail(null);
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedGroup?.group_id]);

  // Keeps the default single "just me" payer's amount tracking the keypad total. Only while
  // unpicked — once the user has saved a change out of the payer/split picker (`customized`),
  // amount edits stop silently rewriting it; a stale split just shows as invalid (see
  // payersValid/splitValid below) until the user reopens the picker to fix it.
  React.useEffect(() => {
    if (customized) return;
    setPayers((prev) => (prev.length === 1 ? [{ ...prev[0], amount_paid: numAmount }] : prev));
  }, [numAmount, customized]);

  const payersValid = !selectedGroup || (!!groupDetail && computePayersValid(payers, numAmount));
  const splitValid = !selectedGroup || (!!groupDetail && computeSplitValid(splitValue, numAmount));
  const knownMembers = !isGroup || (!!groupDetail && [...payers, ...splitValue.entries].every((entry) => groupDetail.members.some((member) => member.member_id === entry.member_id)));
  // A scanned receipt or restored draft can carry a date outside the allowed window.
  const dateProblem = expenseDateProblem(`${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}-${String(expenseDate.getDate()).padStart(2, '0')}`);
  // Receipts must match their total: paid prices + tax + tip, ±2¢ (server rule, TS-FIX-102).
  // Discounts are already in the prices and are never subtracted again.
  const itemsMismatch = (() => {
    const named = scannedItems.filter((it) => it.item_name.trim() !== '');
    if (!named.length) return false;
    return !receiptTotals(named, scannedTax, scannedTip, numAmount).reconciled;
  })();
  const capReady = !dateProblem && !itemsMismatch && hydrated && !unknownOutcome && (!isGroup || !!selectedGroup) && knownMembers && numAmount > 0 && desc.trim().length > 0 && payersValid && splitValid;
  const amtDisplay = amt ? '$' + amt : '$0.00';

  // Items with a blank name (a row the user cleared rather than deleted) are dropped rather
  // than sent to the itemized endpoints, which require a non-empty item_name. Hoisted out of
  // handleSave so the split-type restriction below (SplitSheet's allowedTypes)
  // can see it too.
  const itemsToSave = scannedItems.filter((it) => it.item_name.trim() !== '');

  // Items-sheet inputs: a group receipt is split on its total (TS-FIX-102), so "your share" comes
  // from the split chosen in the split sheet, not from the lines.
  const splitPeople = splitValue.entries.length;
  const splitLabel = splitValue.type === 'equal'
    ? `Split equally among ${splitPeople}`
    : splitValue.type === 'shares' ? `Split by shares among ${splitPeople}` : `Split by exact amounts among ${splitPeople}`;
  const itemsYourShare = isGroup ? receiptShareFor(splitValue, numAmount, myMemberId) : numAmount;

  const handleSave = async () => {
    if (!capReady || !accessToken || !userEmail || loading || saveLock.current) return;
    saveLock.current = true;
    setLoading(true);
    // One operation per save attempt: a retry after a definite failure is a new attempt, a transport retry is not.
    const capture: ExpenseCapture = {
      method: scannedFingerprint || itemsToSave.length > 0 ? 'receipt' : 'manual',
      operation: analytics.beginOperation(),
      categoryDisposition: categoryDisposition(suggestedCategoryRef.current, `${mainCategory || 'Other'}/${subcategory || 'General'}`),
    };
    const pendingDraft = { ...draftRef.current, unknownOutcome: true };
    writeExpenseDraft(userEmail, pendingDraft).catch(() => {});
    const today = new Date();
    const recurringLine = recurring ? ` Repeats monthly on the ${ordinal(today.getDate())}.` : '';
    try {
      if (!isGroup && itemsToSave.length > 0) {
        const header = {
          merchant_name: merchantName || undefined,
          // MM/DD/YYYY, not toISOString() — matches the plain addExpense() call
          // below and avoids shifting the date a day via UTC conversion for
          // users in a positive UTC-offset timezone.
          purchased_at: formatMMDDYYYY(expenseDate),
          amount: numAmount,
          tax: scannedTax || 0,
          // The scanned tip is kept; no header discount (savings are already in the line prices).
          tip: scannedTip || 0,
          description: desc.trim(),
          main_category_name: mainCategory || 'Other',
          category_name: subcategory || 'General',
          fingerprint: scannedFingerprint || '',
        };
        const items = itemsToSave.map((it, idx) => ({ ...toSaveLine(it, idx), category_name: it.category_name }));
        await addExpenseWithItems({
          user_email: userEmail, header, items,
          card_id: cardCoachEnabled ? cardId : undefined,
          tag_names: tagsEnabled && tagNames.length > 0 ? tagNames : undefined,
        }, capture);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        notifyExpenseChanged();
        setSavedAmt(numAmount);
        setSavedLine(`Logged to your personal ledger.${recurringLine}`);
      } else if (!isGroup) {
        await addExpense(
          {
            description: desc.trim(),
            cost: numAmount,
            category: mainCategory || 'Other',
            sub_category: subcategory || 'General',
            date: formatMMDDYYYY(expenseDate),
            user_id: userEmail,
            merchant_name: merchantName || undefined,
            card_id: cardCoachEnabled ? cardId : undefined,
            tag_names: tagsEnabled && tagNames.length > 0 ? tagNames : undefined,
          },
          accessToken,
          capture,
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        notifyExpenseChanged();
        if (recurring) {
          // Best-effort: the expense itself already saved, so a template failure here shouldn't
          // surface as a save error — just skip the "Repeats monthly" line.
          try {
            await upsertRecurringTemplate({
              description: desc.trim(),
              category: mainCategory || 'Other',
              day_of_month: today.getDate(),
              default_cost: numAmount,
              status: 'Active',
            });
          } catch { /* non-fatal */ }
        }
        setSavedAmt(numAmount);
        setSavedLine(`Logged to your personal ledger.${recurringLine}`);
      } else {
        const detail = await getGroupDetail(who);
        const myMember = detail.members.find((m) => m.user_email === userEmail);
        if (!myMember) {
          throw new Error("You don't appear to be an active member of that group.");
        }
        // `payers`/`splitValue` reflect the split sheet's committed state — either the
        // auto-tracked "just me, split equally" default or the user's customization; capReady
        // already required a loaded groupDetail plus both computeXValid checks to pass before
        // Save was even enabled, so both are guaranteed populated and valid here.
        let myShare: number;
        let groupExpenseRowId: string;
        if (itemsToSave.length > 0) {
          // A group receipt is split on its TOTAL by the split sheet's Equal/Exact/Shares
          // (TS-FIX-102); the lines are for tracking only, with tax and tip on the receipt itself.
          const items: GroupExpenseItemEntry[] = itemsToSave.map((it, idx) => toSaveLine(it, idx));
          const row = await addGroupExpenseWithItems(who, {
            date: formatMMDDYYYY(expenseDate),
            description: desc.trim(),
            category: mainCategory || 'Other',
            amount: numAmount,
            merchant_name: merchantName || undefined,
            payers,
            split: splitValue,
            tax: scannedTax || 0,
            tip: scannedTip || 0,
            items,
            card_id: cardCoachEnabled ? cardId : undefined,
          }, capture);
          myShare = row.my_share;
          groupExpenseRowId = row.row_id;
        } else {
          const row = await addGroupExpense(who, {
            date: formatMMDDYYYY(expenseDate),
            description: desc.trim(),
            category: mainCategory || 'Other',
            amount: numAmount,
            merchant_name: merchantName || undefined,
            payers,
            split: splitValue,
            card_id: cardCoachEnabled ? cardId : undefined,
          }, capture);
          myShare = row.my_share;
          groupExpenseRowId = row.row_id;
        }
        if (tagsEnabled && tagNames.length > 0) {
          await applyTagsToExpense(groupExpenseRowId, { tag_names: tagNames });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        notifyExpenseChanged();
        // GroupsScreen/PeopleList/GroupDetailScreen aren't subscribed to notifyExpenseChanged and
        // the app's QueryClient has refetchOnWindowFocus: false — same invalidation set
        // useQuickLogBar.ts's group-save path already uses.
        qc.invalidateQueries({ queryKey: ['group-expenses', who] });
        qc.invalidateQueries({ queryKey: ['group-balances', who] });
        qc.invalidateQueries({ queryKey: ['groups'] });
        qc.invalidateQueries({ queryKey: ['friend-balances'] });
        if (recurring) {
          try {
            await upsertRecurringTemplate({
              description: desc.trim(),
              category: mainCategory || 'Other',
              day_of_month: today.getDate(),
              default_cost: numAmount,
              status: 'Active',
              group_id: who,
              split_config: { type: 'equal', entries: detail.members.map((m) => ({ member_id: m.member_id })) },
            });
          } catch { /* non-fatal */ }
        }
        setSavedAmt(numAmount);
        setSavedLine(
          `Logged to ${detail.name} — your share ${fmt(myShare)} joins your personal total automatically.${recurringLine}`
        );
      }
      await clearExpenseDraft(userEmail, pendingDraft).catch(() => {});
      setStage('saved');
    } catch (error: any) {
      if (error instanceof RequestError ? error.outcomeUnknown : !/session ended|Session expired/.test(error instanceof Error ? error.message : '')) setUnknownOutcome(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast({ message: error.message || 'Failed to save', type: 'error' });
    } finally {
      saveLock.current = false;
      setLoading(false);
    }
  };

  React.useEffect(() => { if (stage === 'saved') setItemsVisible(false); }, [stage]);

  const handleAgain = () => resetForm('me');

  return (
    <AddExpenseContext.Provider value={{ openAddExpense, closeAddExpense }}>
      {children}

      <Modal transparent visible={visible && hydrated && !!accessToken} animationType="none" onRequestClose={closeAddExpense} statusBarTranslucent>
        <View style={styles.modalRoot} onAccessibilityEscape={closeAddExpense}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAddExpense} accessible={false} onAccessibilityEscape={closeAddExpense}>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity, backgroundColor: theme.colors.overlay }]} />
          </Pressable>

          {/* box-none: taps beside the sheet still reach the backdrop underneath */}
          <KeyboardLift style={styles.modalRoot} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.sheet,
                { paddingBottom: Math.max(insets.bottom, 20), transform: [{ translateY }] },
              ]}
            >
              {/* accessible={false}: a Pressable is an accessibility element by default, and on iOS that collapses the whole
                  sheet (keypad, Save, chips) into one element, unreachable for VoiceOver. It only swallows backdrop taps. */}
              <Pressable onPress={(e) => e.stopPropagation()} accessible={false} focusable={false} testID="addExpense.sheet" style={styles.sheetBody}>
                <View style={styles.dragPillWrap}>
                  <View style={styles.dragPill} />
                </View>

                {stage === 'entry' ? (
                  <ScrollView
                    contentContainerStyle={styles.body}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    keyboardDismissMode="on-drag"
                  >
                    {restored && <Text accessibilityRole="text" style={styles.savedLine}>Your unsaved expense was restored. Review it before saving.</Text>}
                    {unknownOutcome && <>
                      <Text accessibilityRole="alert" style={styles.savedLine}>The save outcome is unknown. Check Expenses before saving again to avoid a duplicate.</Text>
                      <TouchableOpacity accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => setUnknownOutcome(false)}><Text style={styles.savedLine}>I checked Expenses — allow another save</Text></TouchableOpacity>
                    </>}
                    <TouchableOpacity accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} disabled={!dirty || loading} onPress={() => Alert.alert('Discard this expense?', 'This removes your unsaved entry.', [
                      { text: 'Keep draft', style: 'cancel' },
                      { text: 'Discard', style: 'destructive', onPress: () => { resetForm('me'); closeAddExpense(); } },
                    ])}><Text style={styles.savedLine}>Discard draft</Text></TouchableOpacity>

                    <View style={styles.entryHeader}>
                      <View style={styles.modeToggle}>
                        <View style={[styles.modeBtn, styles.modeBtnActive]}>
                          <Text style={[styles.modeBtnText, styles.modeBtnTextActive]}>Type</Text>
                        </View>
                        <TouchableOpacity style={styles.modeBtn} onPress={() => setScanVisible(true)} activeOpacity={0.7} disabled={scanning}>
                          {scanning ? (
                            <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                          ) : (
                            <Text style={styles.modeBtnText}>Scan</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={styles.closeBtn}
                        onPress={closeAddExpense}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                      >
                        <Text style={styles.closeX}>✕</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.amountDisplayWrap}>
                      <Text style={styles.amountDisplay} testID="addExpense.amount">{amtDisplay}</Text>
                    </View>

                    <RNTextInput
                      style={styles.descInput}
                      testID="addExpense.description"
                      placeholder="What was it? (AI suggests the category)"
                      placeholderTextColor={theme.colors.textQuaternary}
                      value={desc}
                      onChangeText={handleDescChange}
                      selectionColor={theme.colors.primary}
                    />

                    {dateProblem ? (
                      <Text accessibilityRole="alert" style={{ color: theme.colors.error, marginBottom: 8, fontSize: 13 }}>{dateProblem}</Text>
                    ) : null}

                    {/* Chips: category (auto-suggested), date, and "More" for the rest. */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      <Chip
                        label={subcategory || mainCategory || 'Category'}
                        variant={subcategory || mainCategory ? 'accent' : 'outline'}
                        style={styles.captureChip}
                        onPress={() => setDetailsOpen(true)}
                      />
                      <Chip
                        label={isSameDay(expenseDate, new Date()) ? 'Today' : formatShortDate(expenseDate)}
                        style={styles.captureChip}
                        onPress={() => setShowDatePicker(true)}
                      />
                      {groupsEnabled && myGroups.length > 0 && (
                        <Chip
                          label={who === 'me' ? 'Just me' : (selectedGroup?.name ?? 'Just me')}
                          variant={who === 'me' ? 'outline' : 'accent'}
                          style={styles.captureChip}
                          onPress={() => setPickerSheet('who')}
                        />
                      )}
                      {isGroup && groupDetail && (
                        <Chip
                          label={`${paidByName(payers, groupDetail.members, myMemberId)} paid · ${splitValue.type === 'equal' ? 'Equal' : 'Custom'}`}
                          variant={customized ? 'accent' : 'outline'}
                          style={styles.captureChip}
                          onPress={() => setSplitVisible(true)}
                        />
                      )}
                      {scannedItems.length > 0 && (
                        <Chip
                          label={`${scannedItems.length} item${scannedItems.length === 1 ? '' : 's'}`}
                          variant="accent"
                          style={styles.captureChip}
                          onPress={() => setItemsVisible(true)}
                        />
                      )}
                      {cardCoachEnabled && myCards.length > 0 && (
                        <Chip
                          label={myCards.find((c) => c.card_id === cardId)?.card_name ?? 'Card'}
                          variant={cardId ? 'accent' : 'outline'}
                          style={styles.captureChip}
                          onPress={() => setPickerSheet('card')}
                        />
                      )}
                      {tagsEnabled && (
                        <Chip
                          label={tagNames.length > 0 ? `Tags · ${tagNames.length}` : 'Tags'}
                          variant={tagNames.length > 0 ? 'accent' : 'outline'}
                          style={styles.captureChip}
                          onPress={() => setTagPickerVisible(true)}
                        />
                      )}
                      <Chip
                        label={detailsOpen ? 'Less' : 'More'}
                        style={styles.captureChip}
                        onPress={() => setDetailsOpen((v) => !v)}
                      />
                    </ScrollView>
                    <TagPickerModal
                      visible={tagPickerVisible}
                      value={tagNames}
                      onChange={setTagNames}
                      onClose={() => setTagPickerVisible(false)}
                    />
                    <SplitSheet
                      visible={splitVisible}
                      onClose={() => setSplitVisible(false)}
                      amount={numAmount}
                      members={groupDetail?.members ?? []}
                      myMemberId={myMemberId}
                      payers={payers}
                      splitValue={splitValue}
                      allowedTypes={itemsToSave.length > 0 ? [...RECEIPT_SPLIT_TYPES] : undefined}
                      onDone={(nextPayers, nextSplit) => {
                        setPayers(nextPayers);
                        setSplitValue(nextSplit);
                        setCustomized(true);
                        setSplitVisible(false);
                      }}
                    />
                    <ReceiptScanScreen
                      visible={scanVisible}
                      busy={scanning}
                      onClose={() => setScanVisible(false)}
                      onShutter={() => pickReceipt('camera')}
                      onLibrary={() => pickReceipt('library')}
                    />
                    <ReceiptItemsSheet
                      visible={itemsVisible}
                      onClose={() => setItemsVisible(false)}
                      merchant={merchantName}
                      items={itemsToSave}
                      tax={scannedTax}
                      tip={scannedTip}
                      amount={numAmount}
                      grouped={isGroup}
                      splitLabel={splitLabel}
                      yourShare={itemsYourShare}
                      saving={loading}
                      canSave={capReady}
                      onSave={handleSave}
                      onEditItems={() => setItemsVisible(false)}
                    />
                    <OptionSheet
                      visible={pickerSheet === 'who'}
                      title="Who was this for?"
                      options={[
                        { value: 'me', label: 'Just me' },
                        ...myGroups.map((g) => ({ value: g.group_id, label: `${GROUP_TYPE_EMOJI[g.group_type] ?? '👥'} ${g.name}`, hint: 'Split equally' })),
                      ]}
                      selected={who}
                      onSelect={(v) => { setWho(v); setPickerSheet(null); }}
                      onClose={() => setPickerSheet(null)}
                    />
                    <OptionSheet
                      visible={pickerSheet === 'card'}
                      title="Card used"
                      options={[
                        { value: '', label: 'Default card' },
                        ...myCards.map((c) => ({ value: c.card_id, label: c.card_name, hint: c.issuer })),
                      ]}
                      selected={cardId ?? ''}
                      onSelect={(v) => { setCardId(v || null); setPickerSheet(null); }}
                      onClose={() => setPickerSheet(null)}
                    />
                    {showDatePicker && (
                      Platform.OS === 'ios' ? (
                        <Modal transparent animationType="slide" visible={showDatePicker} onRequestClose={() => setShowDatePicker(false)}>
                          <Pressable style={styles.datePickerBackdrop} onPress={() => setShowDatePicker(false)} accessible={false} onAccessibilityEscape={() => setShowDatePicker(false)}>
                            <Pressable style={styles.datePickerSheet} onPress={(e) => e.stopPropagation()} accessible={false} focusable={false}>
                              <View style={styles.datePickerHeader}>
                                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                  <Text style={styles.datePickerDone}>Done</Text>
                                </TouchableOpacity>
                              </View>
                              <DateTimePicker
                                value={expenseDate}
                                mode="date"
                                display="inline"
                                maximumDate={new Date()}
                                minimumDate={expenseDateMin()}
                                onChange={(_event: DateTimePickerEvent, selected?: Date) => {
                                  if (selected) setExpenseDate(startOfDay(selected));
                                }}
                              />
                            </Pressable>
                          </Pressable>
                        </Modal>
                      ) : (
                        <DateTimePicker
                          value={expenseDate}
                          mode="date"
                          display="default"
                          maximumDate={new Date()}
                          minimumDate={expenseDateMin()}
                          onChange={(event: DateTimePickerEvent, selected?: Date) => {
                            setShowDatePicker(false);
                            if (event.type === 'set' && selected) setExpenseDate(startOfDay(selected));
                          }}
                        />
                      )
                    )}

                    {scannedItems.length > 0 && (
                      <ScannedItemsCard
                        theme={theme}
                        items={scannedItems}
                        onChange={setScannedItems}
                        merchant={merchantName}
                        tax={scannedTax}
                        tip={scannedTip}
                        review={scannedReview}
                        currentAmount={numAmount}
                      />
                    )}

                    {detailsOpen && (
                      <>
                        <TypeaheadInput
                          theme={theme}
                          value={merchantName}
                          onChangeValue={(v) => {
                            setMerchantName(v);
                            setUserPickedMerchant(true);
                          }}
                          fetchSuggestions={fetchMerchantSuggestions}
                          placeholder="Merchant (optional)"
                          containerStyle={styles.merchantInputWrap}
                          inputStyle={styles.merchantInput}
                        />

                        <CategoryPickerField
                          theme={theme}
                          mainCategory={mainCategory}
                          subcategory={subcategory}
                          onChange={(main, sub) => {
                            setMainCategory(main);
                            setSubcategory(sub);
                            setUserPickedCategory(true);
                          }}
                          label="Category ✨"
                          containerStyle={styles.categoryFieldWrap}
                        />

                        <View style={styles.recurringRow}>
                          <Text style={styles.recurringRowText}>🔁 Repeat monthly on the {ordinal(new Date().getDate())}</Text>
                          <ToggleSwitch value={recurring} onValueChange={setRecurring} accessibilityLabel="Repeat monthly" />
                        </View>
                      </>
                    )}

                    <View style={styles.keypad}>
                      {KEYS.map((k) => (
                        <TouchableOpacity key={k} style={styles.key} onPress={() => capPress(k)} activeOpacity={0.6} testID={`addExpense.key.${KEY_TEST_ID[k] ?? k}`} accessibilityRole="button" accessibilityLabel={KEY_A11Y_LABEL[k]}>
                          <Text style={styles.keyLabel}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity
                      onPress={handleSave}
                      disabled={!capReady || loading}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      testID="addExpense.save"
                    >
                      <LinearGradient
                        colors={theme.gradients.primary}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.saveBtn, !capReady && styles.saveBtnDisabled]}
                      >
                        {loading ? (
                          <ActivityIndicator color={inkOnPastel} />
                        ) : (
                          <Text style={styles.saveBtnText}>{isGroup ? 'Save & split' : 'Save'}</Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </ScrollView>
                ) : (
                  <View style={styles.savedWrap} testID="addExpense.saved">
                    <View style={styles.savedCheck}>
                      <Text style={styles.savedCheckText}>✓</Text>
                    </View>
                    <Text style={styles.savedAmount}>{fmt(savedAmt)}</Text>
                    <Text style={styles.savedLine}>{savedLine}</Text>
                    <View style={styles.savedActions}>
                      <TouchableOpacity style={styles.savedSecondaryBtn} onPress={handleAgain} activeOpacity={0.8}>
                        <Text style={styles.savedSecondaryText}>Log another</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.savedPrimaryBtn} onPress={closeAddExpense} activeOpacity={0.8}>
                        <Text style={styles.savedPrimaryText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </Pressable>
            </Animated.View>
          </KeyboardLift>
        </View>
      </Modal>
    </AddExpenseContext.Provider>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    // No `position: 'absolute'` / fixed height here (that was inherited from the old rich
    // form, which genuinely needed ~88% of the screen) — this sheet is much shorter now, so it
    // sits in normal flex flow, sized to its own content and anchored to the bottom purely via
    // `modalRoot`'s `justifyContent: 'flex-end'`. A fixed-height absolute box regardless of
    // content was the bug behind "opens from near the top with empty space at the bottom".
    // lets the form scroll inside the sheet when the Android keyboard takes part of the screen
    sheetBody: { flexShrink: 1 },
    sheet: {
      maxHeight: '92%',
      backgroundColor: theme.colors.surfaceElevated,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      ...theme.shadows.lg,
    },
    dragPillWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
    dragPill: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border },

    body: { paddingHorizontal: 22, paddingBottom: 24 },

    entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    modeToggle: { flexDirection: 'row', gap: 6, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 11, padding: 3 },
    modeBtn: { height: 30, minWidth: 54, paddingHorizontal: 13, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    modeBtnActive: { backgroundColor: theme.colors.text },
    modeBtnText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13, color: theme.colors.textSecondary },
    modeBtnTextActive: { fontFamily: 'InstrumentSans-Bold', color: theme.colors.background },
    closeBtn: { width: 32, height: 32, borderRadius: 11, backgroundColor: theme.colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
    closeX: { color: theme.colors.textSecondary, fontSize: 14 },

    amountDisplayWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 2 },
    amountDisplay: {
      fontFamily: 'BricolageGrotesque-SemiBold', fontSize: 56, color: theme.colors.text,
      letterSpacing: -2.8, minHeight: 64, fontVariant: ['tabular-nums'],
    },

    // Borderless and centered under the figure — the description is a caption, not a form field.
    descInput: {
      paddingHorizontal: 12, paddingVertical: 8, fontFamily: 'InstrumentSans-Regular', fontSize: 14,
      color: theme.colors.text, marginTop: 2, textAlign: 'center',
    },
    chipRow: { gap: 8, paddingVertical: 10 },
    captureChip: { height: 34, borderRadius: 11 },

    datePickerBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: theme.colors.overlay },
    datePickerSheet: { backgroundColor: theme.colors.surfaceElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 16 },
    datePickerHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 12 },
    datePickerDone: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14, color: theme.colors.primary },

    merchantInputWrap: { marginTop: 8 },
    merchantInput: {
      borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'InstrumentSans-Regular', fontSize: 13.5,
      color: theme.colors.text,
    },

    categoryFieldWrap: { marginTop: 8 },

    recurringRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 9, marginTop: 8,
    },
    recurringRowText: { fontFamily: 'InstrumentSans-Regular', fontSize: 12, color: theme.colors.textSecondary },

    keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    key: {
      width: '31.6%', height: 52, borderRadius: 14, backgroundColor: theme.colors.surfaceSecondary,
      alignItems: 'center', justifyContent: 'center',
    },
    keyLabel: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 23, color: theme.colors.text },

    saveBtn: { marginTop: 14, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { fontFamily: 'InstrumentSans-Bold', fontSize: 17, color: inkOnPastel },

    savedWrap: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 24 },
    savedCheck: {
      width: 56, height: 56, borderRadius: 999, backgroundColor: theme.colors.successSurface,
      alignItems: 'center', justifyContent: 'center',
    },
    savedCheckText: { color: theme.colors.success, fontSize: 26, fontFamily: 'InstrumentSans-Bold' },
    savedAmount: { fontFamily: 'BricolageGrotesque-SemiBold', fontSize: 26, color: theme.colors.text },
    savedLine: { fontFamily: 'InstrumentSans-Regular', fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 19 },
    savedActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
    savedSecondaryBtn: {
      borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10,
    },
    savedSecondaryText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13, color: theme.colors.text },
    savedPrimaryBtn: { backgroundColor: theme.colors.text, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
    savedPrimaryText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13, color: theme.colors.background },
  });
