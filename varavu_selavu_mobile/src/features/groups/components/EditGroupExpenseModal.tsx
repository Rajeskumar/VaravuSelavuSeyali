import { noMinus } from '../../expenses/utils/noMinus';
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Pressable, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { updateGroupExpense, getGroupExpenseItems, updateGroupExpenseItems, GroupExpenseRow, MemberDTO, PayerSummaryItem } from '../api/groups';
import { applyTagsToExpense, removeTagFromExpense } from '../../tags/api/tags';
import { useAppTheme } from '../../../core/theme/ThemeContext';
import { useTagsEnabled } from '../../tags/hooks/useTagsEnabled';
import { AppTheme } from '../../../core/theme/theme';
import CustomInput from '../../../core/ui/CustomInput';
import CustomButton from '../../../core/ui/CustomButton';
import { MAIN_CATEGORIES, CATEGORY_GROUPS, findMainCategory } from '../../expenses/utils/categories';
import SplitEditor, { SplitEntry as SplitEditorEntry, SplitType } from './SplitEditor';
import PayerPicker from './PayerPicker';
import ScannedItemsCard, { ScannedItem } from '../../receipts/components/ScannedItemsCard';
import TagChipsDisplay from '../../tags/components/TagChipsDisplay';
import TagPickerModal from '../../tags/components/TagPickerModal';
import CardPickerField from '../../cards/components/CardPickerField';
import { useCardCoachEnabled } from '../../cards/hooks/useCardCoachEnabled';
import { showToast } from '../../../core/ui/Toast';
import { RECEIPT_SPLIT_TYPES, fromServerLine, receiptTotals, toSaveLine } from '../../receipts/utils/receiptLines';

interface EditGroupExpenseModalProps {
  visible: boolean;
  groupId: string;
  expense: GroupExpenseRow | null;
  members: MemberDTO[];
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditGroupExpenseModal({
  visible,
  groupId,
  expense,
  members,
  onClose,
  onUpdated,
}: EditGroupExpenseModalProps) {
  const { theme } = useAppTheme();
  const { enabled: tagsEnabled } = useTagsEnabled();
  const { enabled: cardCoachEnabled } = useCardCoachEnabled();
  // useWindowDimensions (not Dimensions.get(), and not a module-level constant) — reading
  // window size at module load time returns 0/stale on native before the bridge is ready,
  // which made the sheet's maxHeight resolve to 0 and rendered nothing at all.
  const { height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme, windowHeight), [theme, windowHeight]);
  const insets = useSafeAreaInsets();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [mainCategory, setMainCategory] = useState(MAIN_CATEGORIES[0]);
  const [subcategory, setSubcategory] = useState(CATEGORY_GROUPS[MAIN_CATEGORIES[0]][0]);
  const [date, setDate] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [currency, setCurrency] = useState('');

  const [payers, setPayers] = useState<PayerSummaryItem[]>([]);
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [splitEntries, setSplitEntries] = useState<SplitEditorEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // Payers and split are sent only when the user changed them; otherwise the server keeps the stored ones,
  // rescaled to a new amount (TS-FIX-103; an Equal/Shares receipt stays so, TS-FIX-102 D8), instead of
  // saving this exact pre-fill. Web does this for receipts only so far (ROADMAP).
  const [splitTouched, setSplitTouched] = useState(false);

  // Itemized expenses (receipt-scanned) get a line-item review/edit section, reusing the
  // same ScannedItemsCard the create flow uses. itemsLoaded distinguishes "no items to
  // show" from "haven't fetched yet" so handleSave knows whether to also call
  // updateGroupExpenseItems.
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [itemsTax, setItemsTax] = useState(0);
  const [itemsTip, setItemsTip] = useState(0);
  const [legacyFormat, setLegacyFormat] = useState(false);
  // TS-FIX-102: new receipts are split Equal/Exact/Shares on the total and flagged by has_items.
  const isReceipt = !!expense && (expense.split_type === 'itemized' || !!expense.has_items);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  // The editors still show the old figures; when the server will adjust them, say so instead of flagging them.
  // An Exact or old item-split receipt can't be adjusted, so its checks stay.
  const amountEdited = !!expense && Math.round((parseFloat(amount) || 0) * 100) !== Math.round(expense.cost * 100);
  const needsNewSplit = isReceipt && (expense?.split_type === 'exact' || expense?.split_type === 'itemized');
  const adjustsStored = amountEdited && !splitTouched && !needsNewSplit;

  // TS-TAG-112 — group expenses have no tag_names write-through field (personal-only by
  // design), so a changed selection here is synced via the association endpoints in
  // handleSave rather than sent as part of the updateGroupExpense payload.
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [tagPickerVisible, setTagPickerVisible] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);

  // Seeded from `expense.splits` (each member's actual current dollar share, as an 'exact'
  // split) so editing starts from what's really on the expense instead of resetting to an
  // equal-split guess — matches the web app's `ExpenseDetailDialog.tsx` `startEdit`. Keyed only
  // on `visible`/the expense identity, not on `members`/`expense` by reference — those are
  // React Query results that can get a new array/object reference on any background refetch
  // while this modal is open (any mutation elsewhere in the group can invalidate `group-detail`),
  // which was silently wiping whatever the user had just typed.
  useEffect(() => {
    if (visible && expense) {
      setDescription(expense.description);
      setAmount(String(expense.cost));
      const mc = findMainCategory(expense.category);
      setMainCategory(mc);
      setSubcategory(expense.category);
      setDate(expense.date);
      setMerchantName(expense.merchant_name || '');
      setCurrency(expense.currency || '');
      setPayers(expense.payer_summary.map((p) => ({ ...p })));
      setSplitTouched(false);
      setSplitType('exact');
      setSplitEntries(expense.splits.map((s) => ({ member_id: s.member_id, value: s.share })));
      setTagNames((expense.tags || []).map((t) => t.name));
      setCardId(expense.card?.id || null);

      setItems([]);
      setItemsLoaded(false);
      if (expense.split_type === 'itemized' || expense.has_items) {
        getGroupExpenseItems(groupId, expense.row_id)
          .then((res) => {
            setItems(res.items.map(fromServerLine));
            setItemsTax(res.tax);
            setItemsTip(res.tip || 0);
            setLegacyFormat(!!res.legacy_discount_format);
            setItemsLoaded(true);
          })
          .catch(() => { /* falls back to the flat amount field only */ });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, expense?.row_id]);

  // A single payer paid the whole total, so their amount follows it (web parity).
  const changeAmount = (text: string) => {
    setAmount(text);
    setPayers((prev) => (prev.length === 1 ? [{ ...prev[0], amount_paid: parseFloat(text) || 0 }] : prev));
  };

  const handleSave = async () => {
    if (!expense) return;
    const amountValue = parseFloat(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      showToast({ message: 'Enter an amount greater than 0', type: 'warning' });
      return;
    }
    setLoading(true);
    try {
      if (itemsLoaded && items.length > 0) {
        // A changed amount carries the split chosen below (Equal/Exact/Shares), which the server
        // needs for Exact and old item-split receipts; ids keep edited lines in place.
        const amountChanged = Math.round((parseFloat(amount) || 0) * 100) !== Math.round(expense.cost * 100);
        await updateGroupExpenseItems(groupId, expense.row_id, {
          items: items.map((it, idx) => toSaveLine(it, idx, true)),
          amount: parseFloat(amount) || 0,
          tax: itemsTax,
          tip: itemsTip,
          ...(amountChanged && splitTouched
            ? { split: { type: splitType, entries: splitEntries.map((e) => ({ member_id: e.member_id, value: e.value })) } }
            : {}),
        });
      }
      await updateGroupExpense(groupId, expense.row_id, {
        description,
        amount: parseFloat(amount),
        category: subcategory,
        date,
        merchant_name: merchantName || undefined,
        currency: currency || undefined,
        ...(splitTouched
          ? {
              split: { type: splitType, entries: splitEntries.map(e => ({ member_id: e.member_id, value: e.value })) },
              payers: payers.map(p => ({ member_id: p.member_id, amount_paid: p.amount_paid })),
            }
          : {}),
        card_id: cardCoachEnabled ? cardId : undefined,
      });
      if (tagsEnabled) {
        const before = new Set((expense.tags || []).map((t) => t.name.toLowerCase()));
        const after = new Set(tagNames.map((n) => n.toLowerCase()));
        const toAdd = tagNames.filter((n) => !before.has(n.toLowerCase()));
        const toRemove = (expense.tags || []).filter((t) => !after.has(t.name.toLowerCase()));
        if (toAdd.length > 0) {
          await applyTagsToExpense(expense.row_id, { tag_names: toAdd });
        }
        await Promise.all(toRemove.map((t) => removeTagFromExpense(expense.row_id, t.id)));
      }
      showToast({ message: 'Expense updated!', type: 'success' });
      onUpdated();
      onClose();
    } catch (e: any) {
      showToast({ message: e.message || 'Failed to update expense', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { paddingTop: insets.top }]} onPress={onClose} accessible={false} onAccessibilityEscape={onClose}>
        <KeyboardAvoidingView behavior="padding" style={styles.avoider}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} accessible={false} focusable={false}>
            <View style={styles.pill} />
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Edit Expense</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {/* `flexShrink: 1` here, not `flex: 1`. `flex: 1` sets flexBasis:0, which needs a
                definite parent height to resolve against — `sheet` only has maxHeight (a cap,
                not a definite size), so that collapsed this to 0 and hid everything but the
                header. Plain (no style) let it size to full natural content instead, which for
                this screen (Who-Paid + Split sections add a member row each, on top of the
                personal-expense fields) routinely exceeds `sheet`'s maxHeight — and since RN
                Views don't clip overflow by default, the tail of that content (the Save button)
                rendered past the bottom of the screen instead of being scrollable to. flexShrink:1
                keeps the natural content size when it fits, but lets this shrink to whatever room
                is actually left under maxHeight when it doesn't — which is what makes a ScrollView
                actually scroll (it needs a final size smaller than its content). The button itself
                now lives outside the ScrollView, in `footer` below, so it's always visible instead
                of being one more thing you have to scroll to find. */}
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <CustomInput label="Description" value={description} onChangeText={setDescription} icon="📝" />
              <CustomInput testID="groupEdit.amount" label="Amount" value={amount} onChangeText={noMinus(changeAmount)} icon="💰" keyboardType="numeric" />
              <CustomInput label="Merchant / Store Name" value={merchantName} onChangeText={setMerchantName} icon="🏪" />
              <CustomInput label="Date (MM/DD/YYYY)" value={date} onChangeText={setDate} icon="📅" />

              <Text style={styles.pickerLabel}>📁 Main Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                {MAIN_CATEGORIES.map(mc => (
                  <TouchableOpacity
                    key={mc}
                    style={[styles.pickerChip, mainCategory === mc && styles.pickerChipActive]}
                    onPress={() => {
                      setMainCategory(mc);
                      setSubcategory(CATEGORY_GROUPS[mc][0]);
                    }}
                  >
                    <Text style={[styles.pickerChipText, mainCategory === mc && styles.pickerChipTextActive]}>{mc}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.pickerLabel}>📂 Subcategory</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                {(CATEGORY_GROUPS[mainCategory] || []).map(sub => (
                  <TouchableOpacity
                    key={sub}
                    style={[styles.pickerChip, subcategory === sub && styles.pickerChipActive]}
                    onPress={() => setSubcategory(sub)}
                  >
                    <Text style={[styles.pickerChipText, subcategory === sub && styles.pickerChipTextActive]}>{sub}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {adjustsStored && (
                <Text style={styles.adjustNote} accessibilityLiveRegion="polite">
                  The saved split and payments will adjust to the new total unless you change them below.
                </Text>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Who Paid?</Text>
                <PayerPicker quiet={adjustsStored} members={members} amount={parseFloat(amount) || 0} payers={payers} onChange={(next) => { setPayers(next); setSplitTouched(true); }} />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>How to Split?</Text>
                <SplitEditor
                  quiet={adjustsStored}
                  members={members}
                  totalAmount={parseFloat(amount) || 0}
                  value={{ type: splitType, entries: splitEntries }}
                  onChange={(val) => {
                    setSplitTouched(true);
                    setSplitType(val.type);
                    setSplitEntries(val.entries);
                  }}
                  allowedTypes={isReceipt ? [...RECEIPT_SPLIT_TYPES] : undefined}
                />
              </View>

              {itemsLoaded && items.length > 0 && (
                <ScannedItemsCard
                  theme={theme}
                  items={items}
                  onChange={setItems}
                  merchant={merchantName}
                  tax={itemsTax}
                  tip={itemsTip}
                  legacyFormat={legacyFormat}
                  currentAmount={parseFloat(amount) || 0}
                />
              )}

              {tagsEnabled && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Tags</Text>
                  <TouchableOpacity onPress={() => setTagPickerVisible(true)}>
                    {tagNames.length > 0 ? (
                      <TagChipsDisplay tags={tagNames.map((n) => ({ id: n, name: n, color: theme.colors.primary }))} />
                    ) : (
                      <Text style={{ fontFamily: theme.typography.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary }}>
                        + Add tag
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.section}>
                <CardPickerField value={cardId} onChange={setCardId} />
              </View>
            </ScrollView>
            <View style={styles.footer}>
              <CustomButton title={loading ? 'Saving...' : 'Save Changes'} onPress={handleSave} disabled={loading || (itemsLoaded && items.length > 0 && !receiptTotals(items, itemsTax, itemsTip, parseFloat(amount) || 0).reconciled)} />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>

      <TagPickerModal
        visible={tagPickerVisible}
        value={tagNames}
        onChange={setTagNames}
        onClose={() => setTagPickerVisible(false)}
      />
    </Modal>
  );
}

const createStyles = (theme: AppTheme, windowHeight: number) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  avoider: { flexShrink: 1 },
  sheet: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    maxHeight: windowHeight * 0.92,
    flexShrink: 1,
    ...theme.shadows.lg,
  },
  pill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderLight,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: 18,
    color: theme.colors.text,
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    // Not `flex: 1` — see the comment above the ScrollView in the JSX.
    flexShrink: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  pickerLabel: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  pickerScroll: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  pickerChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 16, backgroundColor: theme.colors.surfaceSecondary,
    marginRight: 8,
  },
  pickerChipActive: {
    backgroundColor: theme.colors.primary,
  },
  pickerChipText: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  pickerChipTextActive: {
    color: theme.colors.textInverse,
  },
  section: {
    marginTop: 24,
  },
  adjustNote: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 16,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 12,
  },
});
