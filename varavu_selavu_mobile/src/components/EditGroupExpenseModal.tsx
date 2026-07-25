import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Pressable, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { updateGroupExpense, getGroupExpenseItems, updateGroupExpenseItems, GroupExpenseRow, MemberDTO, PayerSummaryItem } from '../api/groups';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import CustomInput from './CustomInput';
import CustomButton from './CustomButton';
import { MAIN_CATEGORIES, CATEGORY_GROUPS, findMainCategory } from '../constants/categories';
import SplitEditor, { SplitEntry as SplitEditorEntry, SplitType } from './SplitEditor';
import PayerPicker from './PayerPicker';
import ScannedItemsCard, { ScannedItem } from './ScannedItemsCard';
import { showToast } from './Toast';

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
  // useWindowDimensions (not Dimensions.get(), and not a module-level constant) — reading
  // window size at module load time returns 0/stale on native before the bridge is ready,
  // which made the sheet's maxHeight resolve to 0 and rendered nothing at all.
  const { height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme, windowHeight), [theme, windowHeight]);

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

  // Itemized expenses (receipt-scanned) get a line-item review/edit section, reusing the
  // same ScannedItemsCard the create flow uses. itemsLoaded distinguishes "no items to
  // show" from "haven't fetched yet" so handleSave knows whether to also call
  // updateGroupExpenseItems.
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [itemsTax, setItemsTax] = useState(0);
  const [itemsDiscount, setItemsDiscount] = useState(0);
  const [itemsLoaded, setItemsLoaded] = useState(false);

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
      setSplitType('exact');
      setSplitEntries(expense.splits.map((s) => ({ member_id: s.member_id, value: s.share })));

      setItems([]);
      setItemsLoaded(false);
      if (expense.split_type === 'itemized') {
        getGroupExpenseItems(groupId, expense.row_id)
          .then((res) => {
            setItems(res.items.map((it) => ({
              line_no: it.line_no,
              item_name: it.item_name,
              line_total: it.line_total,
              quantity: it.quantity,
              unit_price: it.unit_price,
              normalized_name: it.normalized_name || undefined,
            })));
            setItemsTax(res.tax);
            setItemsDiscount(res.discount);
            setItemsLoaded(true);
          })
          .catch(() => { /* falls back to the flat amount field only */ });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, expense?.row_id]);

  const handleSave = async () => {
    if (!expense) return;
    setLoading(true);
    try {
      if (itemsLoaded && items.length > 0) {
        await updateGroupExpenseItems(groupId, expense.row_id, {
          items: items.map((it) => ({
            line_no: it.line_no,
            item_name: it.item_name,
            normalized_name: it.normalized_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            line_total: it.line_total,
          })),
          amount: parseFloat(amount) || 0,
          tax: itemsTax,
          discount: itemsDiscount,
        });
      }
      await updateGroupExpense(groupId, expense.row_id, {
        description,
        amount: parseFloat(amount),
        category: subcategory,
        date,
        merchant_name: merchantName || undefined,
        currency: currency || undefined,
        split: {
          type: splitType,
          entries: splitEntries.map(e => ({ member_id: e.member_id, value: e.value })),
        },
        payers: payers.map(p => ({ member_id: p.member_id, amount_paid: p.amount_paid })),
      });
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
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
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
              <CustomInput label="Amount" value={amount} onChangeText={setAmount} icon="💰" keyboardType="numeric" />
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

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Who Paid?</Text>
                <PayerPicker members={members} amount={parseFloat(amount) || 0} payers={payers} onChange={setPayers} />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>How to Split?</Text>
                <SplitEditor
                  members={members}
                  totalAmount={parseFloat(amount) || 0}
                  value={{ type: splitType, entries: splitEntries }}
                  onChange={(val) => {
                    setSplitType(val.type);
                    setSplitEntries(val.entries);
                  }}
                />
              </View>

              {itemsLoaded && items.length > 0 && (
                <ScannedItemsCard
                  theme={theme}
                  items={items}
                  onChange={setItems}
                  merchant={merchantName}
                  tax={itemsTax}
                  discount={itemsDiscount}
                  currentAmount={parseFloat(amount) || 0}
                />
              )}
            </ScrollView>
            <View style={styles.footer}>
              <CustomButton title={loading ? 'Saving...' : 'Save Changes'} onPress={handleSave} disabled={loading} />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: AppTheme, windowHeight: number) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
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
  sectionTitle: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 12,
  },
});
