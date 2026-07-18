/**
 * AddExpenseScreen.tsx — TrackSpense v3 Mobile "Quick Capture" sheet (see
 * `TrackSpense v3 Mobile.dc.html`'s `capIsEntry`/`capIsSaved` blocks). File path and the exported
 * `AddExpenseContext`/`AddExpenseProvider` shell are kept as-is — six call sites across the app
 * (`App.tsx`'s FAB, `HomeScreen`/`AnalysisScreen`/`ItemInsightsScreen`/`MerchantInsightsScreen`'s
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
 * picker, custom date) are gone, the same trade-off already accepted for the web app's own Quick
 * Capture. Category is still set — via the existing debounced `categorizeExpense()` call, just
 * with no visible picker, matching the mock (which has no category UI either).
 */
import React, { useState, useRef, useCallback, createContext, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput as RNTextInput, ActivityIndicator, Modal, Animated,
  Dimensions, Pressable, Switch, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import { addExpense, addExpenseWithItems, categorizeExpense, uploadReceipt } from '../api/expenses';
import {
  listGroups, getGroupDetail, addGroupExpense, addGroupExpenseWithItems,
  GroupSummary, GroupDetail, GroupExpenseItemEntry, PayerSummaryItem, ApiError,
} from '../api/groups';
import { upsertRecurringTemplate } from '../api/recurring';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { showToast } from '../components/Toast';
import ScannedItemsCard, { ScannedItem } from '../components/ScannedItemsCard';
import TypeaheadInput from '../components/TypeaheadInput';
import { suggestMerchants } from '../api/entityResolution';
import { useEntityResolutionEnabled } from '../hooks/useEntityResolutionEnabled';
import PaidBySplitSummary from '../components/PaidBySplitSummary';
import { SplitEditorValue, computeSplitValid } from '../components/SplitEditor';
import { computePayersValid } from '../components/PayerPicker';
import { notifyExpenseChanged } from '../utils/expenseEvents';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const { height: SCREEN_H } = Dimensions.get('window');

function todayMMDDYYYY(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
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
  const [visible, setVisible] = useState(false);
  const translateY = useRef(new Animated.Value(SCREEN_H)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [stage, setStage] = useState<'entry' | 'saved'>('entry');
  const [amt, setAmt] = useState('');
  const [desc, setDesc] = useState('');
  const [who, setWho] = useState('me');
  const [merchantName, setMerchantName] = useState('');
  const [mainCategory, setMainCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [scannedTax, setScannedTax] = useState(0);
  const [scannedDiscount, setScannedDiscount] = useState(0);
  const [scannedPurchasedAt, setScannedPurchasedAt] = useState<string | null>(null);
  const [scannedFingerprint, setScannedFingerprint] = useState<string | null>(null);
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null);
  const [payers, setPayers] = useState<PayerSummaryItem[]>([]);
  const [splitValue, setSplitValue] = useState<SplitEditorValue>({ type: 'equal', entries: [] });
  // Tracks whether the user has explicitly saved a change out of PaidBySplitSummary's payer or
  // split picker — while false, payers/splitValue auto-track the live amount/group so the fast
  // "just me, split equally" default needs no interaction; once true, amount edits stop
  // silently rewriting a customized payer/split (see the effects below).
  const [customized, setCustomized] = useState(false);
  const [savedAmt, setSavedAmt] = useState(0);
  const [savedLine, setSavedLine] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { accessToken, userEmail } = useAuth();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { enabled: entityResolutionEnabled } = useEntityResolutionEnabled();
  const fetchMerchantSuggestions = useCallback(
    (q: string) => (entityResolutionEnabled ? suggestMerchants(q) : Promise.resolve([])),
    [entityResolutionEnabled]
  );

  const resetForm = (initialWho: string) => {
    setStage('entry');
    setAmt('');
    setDesc('');
    setMerchantName('');
    setMainCategory('');
    setSubcategory('');
    setRecurring(false);
    setWho(initialWho);
    setScannedItems([]);
    setScannedTax(0);
    setScannedDiscount(0);
    setScannedPurchasedAt(null);
    setScannedFingerprint(null);
    setGroupDetail(null);
    setPayers([]);
    setSplitValue({ type: 'equal', entries: [] });
    setCustomized(false);
  };

  const openAddExpense = useCallback((initialGroupId?: string) => {
    resetForm(initialGroupId ?? 'me');
    setVisible(true);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeAddExpense = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: SCREEN_H, duration: 300, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setVisible(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDescChange = useCallback((text: string) => {
    setDesc(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length >= 3) {
      debounceRef.current = setTimeout(async () => {
        try {
          const result = await categorizeExpense(text.trim());
          if (result.main_category) setMainCategory(result.main_category);
          if (result.subcategory) setSubcategory(result.subcategory);
          if (result.merchant_name) setMerchantName(result.merchant_name);
        } catch { /* best-effort — falls back to defaults at save time */ }
      }, 800);
    }
  }, []);

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
    if (hdr.amount) setAmt(String(Number(hdr.amount)));
    const merchant = hdr.merchant_name || hdr.merchant || '';
    const description = hdr.description || (merchant ? `Receipt from ${merchant}` : '');
    if (description) setDesc(description);
    if (merchant) setMerchantName(merchant);
    if (hdr.main_category_name) setMainCategory(hdr.main_category_name);
    if (hdr.category_name) setSubcategory(hdr.category_name);
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
  };

  const parseReceiptUri = async (uri: string) => {
    setScanning(true);
    try {
      const res = await uploadReceipt(uri, accessToken || '');
      applyParseResult(res);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
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
      if (!permission.granted) {
        showToast({ message: 'Permission needed to scan a receipt', type: 'error' });
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled || !result.assets?.[0]) return;
      await parseReceiptUri(result.assets[0].uri);
    } catch {
      showToast({ message: 'Failed to open camera or photo library', type: 'error' });
    }
  };

  const handleScan = () => {
    Alert.alert('Scan receipt', undefined, [
      { text: 'Take Photo', onPress: () => pickReceipt('camera') },
      { text: 'Choose from Library', onPress: () => pickReceipt('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
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

  // Fetches the full member list (GroupSummary only has member_count) and resets payers/split
  // to "just me, split equally among everyone" whenever the selected group changes, or the
  // sheet is reopened against the same group — a fresh default every time, since a prior
  // session's customization may reference members no longer in the group (or just shouldn't
  // silently carry over).
  React.useEffect(() => {
    if (!visible || !selectedGroup) {
      setGroupDetail(null);
      setPayers([]);
      setSplitValue({ type: 'equal', entries: [] });
      setCustomized(false);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const detail = await getGroupDetail(selectedGroup.group_id);
        if (!mounted) return;
        setGroupDetail(detail);
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
  const capReady = numAmount > 0 && desc.trim().length > 0 && payersValid && splitValid;
  const amtDisplay = amt ? '$' + amt : '$0.00';

  // Items with a blank name (a row the user cleared rather than deleted) are dropped rather
  // than sent to the itemized endpoints, which require a non-empty item_name. Hoisted out of
  // handleSave so the split-type restriction below (PaidBySplitSummary's allowedSplitTypes)
  // can see it too.
  const itemsToSave = scannedItems.filter((it) => it.item_name.trim() !== '');

  const handleSave = async () => {
    if (!capReady || !accessToken || !userEmail || loading) return;
    setLoading(true);
    const today = new Date();
    const recurringLine = recurring ? ` Repeats monthly on the ${ordinal(today.getDate())}.` : '';
    try {
      if (!isGroup && itemsToSave.length > 0) {
        const header = {
          merchant_name: merchantName || undefined,
          purchased_at: scannedPurchasedAt || new Date().toISOString(),
          amount: numAmount,
          tax: scannedTax || 0,
          tip: 0,
          discount: scannedDiscount || 0,
          description: desc.trim(),
          main_category_name: mainCategory || 'Other',
          category_name: subcategory || 'General',
          fingerprint: scannedFingerprint || '',
        };
        const items = itemsToSave.map((it, idx) => ({
          line_no: idx + 1,
          item_name: it.item_name,
          normalized_name: it.normalized_name,
          quantity: it.quantity ?? null,
          unit_price: it.unit_price ?? null,
          line_total: it.line_total,
        }));
        await addExpenseWithItems({ user_email: userEmail, header, items });
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
            date: todayMMDDYYYY(),
            user_id: userEmail,
            merchant_name: merchantName || undefined,
          },
          accessToken
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
        // `payers`/`splitValue` reflect PaidBySplitSummary's live state — either the
        // auto-tracked "just me, split equally" default or the user's customization; capReady
        // already required a loaded groupDetail plus both computeXValid checks to pass before
        // Save was even enabled, so both are guaranteed populated and valid here.
        let myShare: number;
        if (itemsToSave.length > 0) {
          // No per-item person-assignment UI here (that's ItemSplitBoard.tsx's job, reachable
          // only from the full editor) and no whole-expense `split` concept either — split
          // every item equally across the chosen participant subset so the line items
          // themselves are preserved instead of silently dropped, while still letting
          // PaidBySplitSummary's participant-subset editing apply.
          const participantIds = splitValue.entries.map((e) => e.member_id);
          const ratio = participantIds.length > 0 ? 1 / participantIds.length : 1;
          const memberRatios = Object.fromEntries(participantIds.map((id) => [id, ratio]));
          const items: GroupExpenseItemEntry[] = itemsToSave.map((it, idx) => ({
            line_no: idx + 1,
            item_name: it.item_name,
            normalized_name: it.normalized_name,
            quantity: it.quantity ?? null,
            unit_price: it.unit_price ?? null,
            line_total: it.line_total,
            member_ratios: memberRatios,
            // tax/discount are per-item fields server-side but resolve_itemized_split pools
            // and prorates them across every assigned member regardless of which item carries
            // them — attaching the header-level scan values to just the first item is
            // equivalent to a true header-level tax/discount.
            ...(idx === 0 ? { tax: scannedTax || 0, discount: scannedDiscount || 0 } : {}),
          }));
          const row = await addGroupExpenseWithItems(who, {
            date: todayMMDDYYYY(),
            description: desc.trim(),
            category: mainCategory || 'Other',
            amount: numAmount,
            merchant_name: merchantName || undefined,
            payers,
            items,
          });
          myShare = row.my_share;
        } else {
          const row = await addGroupExpense(who, {
            date: todayMMDDYYYY(),
            description: desc.trim(),
            category: mainCategory || 'Other',
            amount: numAmount,
            merchant_name: merchantName || undefined,
            payers,
            split: splitValue,
          });
          myShare = row.my_share;
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
      setStage('saved');
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast({ message: error.message || 'Failed to save', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAgain = () => resetForm('me');

  return (
    <AddExpenseContext.Provider value={{ openAddExpense, closeAddExpense }}>
      {children}

      <Modal transparent visible={visible} animationType="none" onRequestClose={closeAddExpense} statusBarTranslucent>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAddExpense}>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity, backgroundColor: 'rgba(24,24,27,0.4)' }]} />
          </Pressable>

          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 20), transform: [{ translateY }] },
            ]}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
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
                  <View style={styles.entryHeader}>
                    <Text style={styles.entryTitle}>New expense</Text>
                    <View style={styles.headerActions}>
                      <TouchableOpacity style={styles.scanBtn} onPress={handleScan} activeOpacity={0.7} disabled={scanning}>
                        {scanning ? (
                          <ActivityIndicator size="small" color={theme.colors.text} />
                        ) : (
                          <Text style={styles.scanBtnText}>📷 Scan</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={closeAddExpense} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Text style={styles.closeX}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.amountDisplayWrap}>
                    <Text style={styles.amountDisplay}>{amtDisplay}</Text>
                  </View>

                  <RNTextInput
                    style={styles.descInput}
                    placeholder="Description (AI suggests from merchant)"
                    placeholderTextColor={theme.colors.textQuaternary}
                    value={desc}
                    onChangeText={handleDescChange}
                    selectionColor={theme.colors.primary}
                  />

                  <TypeaheadInput
                    theme={theme}
                    value={merchantName}
                    onChangeValue={setMerchantName}
                    fetchSuggestions={fetchMerchantSuggestions}
                    placeholder="Merchant (optional)"
                    containerStyle={styles.merchantInputWrap}
                    inputStyle={styles.merchantInput}
                  />

                  {groupsEnabled && myGroups.length > 0 && (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.whoRow}
                    >
                      <TouchableOpacity
                        style={[styles.whoChip, who === 'me' && styles.whoChipActive]}
                        onPress={() => setWho('me')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.whoChipText, who === 'me' && styles.whoChipTextActive]}>Just me</Text>
                      </TouchableOpacity>
                      {myGroups.map((g) => (
                        <TouchableOpacity
                          key={g.group_id}
                          style={[styles.whoChip, who === g.group_id && styles.whoChipActive]}
                          onPress={() => setWho(g.group_id)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.whoChipText, who === g.group_id && styles.whoChipTextActive]}>
                            {GROUP_TYPE_EMOJI[g.group_type] ?? '👥'} {g.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}

                  {scannedItems.length > 0 && (
                    <ScannedItemsCard
                      theme={theme}
                      items={scannedItems}
                      onChange={setScannedItems}
                      merchant={merchantName}
                      tax={scannedTax}
                      discount={scannedDiscount}
                      currentAmount={numAmount}
                    />
                  )}

                  {isGroup && selectedGroup && groupDetail && (
                    <View style={styles.splitPreview}>
                      <PaidBySplitSummary
                        amount={numAmount}
                        members={groupDetail.members}
                        myMemberId={myMemberId}
                        payers={payers}
                        onPayersChange={setPayers}
                        splitValue={splitValue}
                        onSplitChange={setSplitValue}
                        allowedSplitTypes={itemsToSave.length > 0 ? ['equal'] : undefined}
                        onCustomized={() => setCustomized(true)}
                      />
                    </View>
                  )}

                  <View style={styles.recurringRow}>
                    <Text style={styles.recurringRowText}>🔁 Repeat monthly on the {ordinal(new Date().getDate())}</Text>
                    <Switch
                      value={recurring}
                      onValueChange={setRecurring}
                      trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>

                  <View style={styles.keypad}>
                    {KEYS.map((k) => (
                      <TouchableOpacity key={k} style={styles.key} onPress={() => capPress(k)} activeOpacity={0.6}>
                        <Text style={styles.keyLabel}>{k}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.saveBtn, !capReady && styles.saveBtnDisabled]}
                    onPress={handleSave}
                    disabled={!capReady || loading}
                    activeOpacity={0.85}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveBtnText}>{isGroup ? 'Save & split' : 'Save'}</Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              ) : (
                <View style={styles.savedWrap}>
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
    sheet: {
      maxHeight: '85%',
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 24,
    },
    dragPillWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
    dragPill: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.borderLight },

    body: { paddingHorizontal: 18, paddingBottom: 24 },

    entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    entryTitle: { fontFamily: 'Inter-Bold', fontSize: 16, color: theme.colors.text },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    scanBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 999,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    scanBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 12, color: theme.colors.text },
    closeX: { color: theme.colors.textTertiary, fontSize: 16, paddingHorizontal: 6, paddingVertical: 2 },

    amountDisplayWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
    amountDisplay: {
      fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 42, color: theme.colors.text,
      letterSpacing: -0.5, minHeight: 52,
    },

    descInput: {
      borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Inter-Regular', fontSize: 13.5,
      color: theme.colors.text, marginTop: 8,
    },

    merchantInputWrap: { marginTop: 8 },
    merchantInput: {
      borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Inter-Regular', fontSize: 13.5,
      color: theme.colors.text,
    },

    whoRow: { gap: 6, marginTop: 10, paddingRight: 4 },
    whoChip: {
      paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999,
      borderWidth: 1, borderColor: theme.colors.borderLight, backgroundColor: theme.colors.surface,
    },
    whoChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    whoChipText: { fontFamily: 'Inter-SemiBold', fontSize: 12.5, color: theme.colors.text },
    whoChipTextActive: { color: '#FFFFFF' },

    splitPreview: {
      marginTop: 8, borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 9,
    },

    recurringRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 9, marginTop: 8,
    },
    recurringRowText: { fontFamily: 'Inter-Regular', fontSize: 12, color: theme.colors.textSecondary },

    keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    key: {
      width: '31.5%', height: 46, borderRadius: 10, backgroundColor: theme.colors.surfaceSecondary,
      alignItems: 'center', justifyContent: 'center',
    },
    keyLabel: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 20, color: theme.colors.text },

    saveBtn: {
      marginTop: 12, height: 48, borderRadius: 12, backgroundColor: theme.colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    saveBtnDisabled: { backgroundColor: theme.colors.border },
    saveBtnText: { fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF' },

    savedWrap: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 24 },
    savedCheck: {
      width: 56, height: 56, borderRadius: 999, backgroundColor: theme.colors.successSurface,
      alignItems: 'center', justifyContent: 'center',
    },
    savedCheckText: { color: theme.colors.success, fontSize: 26, fontFamily: 'Inter-Bold' },
    savedAmount: { fontFamily: 'SpaceGrotesk-SemiBold', fontSize: 26, color: theme.colors.text },
    savedLine: { fontFamily: 'Inter-Regular', fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 19 },
    savedActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
    savedSecondaryBtn: {
      borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10,
    },
    savedSecondaryText: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: theme.colors.text },
    savedPrimaryBtn: { backgroundColor: theme.colors.text, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
    savedPrimaryText: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: theme.colors.background },
  });
