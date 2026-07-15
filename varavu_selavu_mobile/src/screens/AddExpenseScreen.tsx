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
  Dimensions, Pressable,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { addExpense, categorizeExpense } from '../api/expenses';
import { listGroups, getGroupDetail, addGroupExpense, GroupSummary, ApiError } from '../api/groups';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { showToast } from '../components/Toast';
import { notifyExpenseChanged } from '../utils/expenseEvents';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const { height: SCREEN_H } = Dimensions.get('window');

function todayMMDDYYYY(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
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
  const [loading, setLoading] = useState(false);
  const [savedAmt, setSavedAmt] = useState(0);
  const [savedLine, setSavedLine] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { accessToken, userEmail } = useAuth();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const resetForm = (initialWho: string) => {
    setStage('entry');
    setAmt('');
    setDesc('');
    setMerchantName('');
    setMainCategory('');
    setSubcategory('');
    setWho(initialWho);
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

  const handleScan = () => {
    // Real receipt-scan/OCR wiring is a separate, bounded feature (expo-image-picker is an
    // installed-but-unused dependency that could support it) — deliberately out of scope here,
    // consistent with the earlier decision not to build it as part of matching the v3 design.
    showToast({ message: 'Receipt scanning coming soon', type: 'info' });
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
  const shareAmount = isGroup && selectedGroup ? numAmount / Math.max(selectedGroup.member_count, 1) : numAmount;
  const capReady = numAmount > 0 && desc.trim().length > 0;
  const amtDisplay = amt ? '$' + amt : '$0.00';

  const handleSave = async () => {
    if (!capReady || !accessToken || !userEmail || loading) return;
    setLoading(true);
    try {
      if (!isGroup) {
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
        setSavedAmt(numAmount);
        setSavedLine('Logged to your personal ledger.');
      } else {
        const detail = await getGroupDetail(who);
        const myMember = detail.members.find((m) => m.user_email === userEmail);
        if (!myMember) {
          throw new Error("You don't appear to be an active member of that group.");
        }
        const share = numAmount / Math.max(detail.members.length, 1);
        await addGroupExpense(who, {
          date: todayMMDDYYYY(),
          description: desc.trim(),
          category: mainCategory || 'Other',
          amount: numAmount,
          merchant_name: merchantName || undefined,
          payers: [{ member_id: myMember.member_id, amount_paid: numAmount }],
          split: { type: 'equal', entries: detail.members.map((m) => ({ member_id: m.member_id })) },
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        notifyExpenseChanged();
        // GroupsScreen/PeopleList/GroupDetailScreen aren't subscribed to notifyExpenseChanged and
        // the app's QueryClient has refetchOnWindowFocus: false — same invalidation set
        // useQuickLogBar.ts's group-save path already uses.
        qc.invalidateQueries({ queryKey: ['group-expenses', who] });
        qc.invalidateQueries({ queryKey: ['group-balances', who] });
        qc.invalidateQueries({ queryKey: ['groups'] });
        qc.invalidateQueries({ queryKey: ['friend-balances'] });
        setSavedAmt(numAmount);
        setSavedLine(
          `Logged to ${detail.name} — your share ${fmt(share)} joins your personal total automatically.`
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
                      <TouchableOpacity style={styles.scanBtn} onPress={handleScan} activeOpacity={0.7}>
                        <Text style={styles.scanBtnText}>📷 Scan</Text>
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

                  {isGroup && selectedGroup && (
                    <View style={styles.splitPreview}>
                      <Text style={styles.splitPreviewText}>
                        Split equally · {selectedGroup.member_count} people · your share{' '}
                        <Text style={styles.splitPreviewShare}>{fmt(shareAmount)}</Text>
                      </Text>
                    </View>
                  )}

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
    splitPreviewText: { fontFamily: 'Inter-Regular', fontSize: 12, color: theme.colors.textSecondary },
    splitPreviewShare: { fontFamily: 'Inter-Bold', color: theme.colors.text },

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
