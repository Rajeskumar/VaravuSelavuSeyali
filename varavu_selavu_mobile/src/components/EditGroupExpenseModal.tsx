import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { updateGroupExpense, GroupExpenseRow, MemberDTO, PayerSummaryItem } from '../api/groups';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import CustomInput from './CustomInput';
import CustomButton from './CustomButton';
import { MAIN_CATEGORIES, CATEGORY_GROUPS, findMainCategory } from '../constants/categories';
import SplitEditor, { SplitEntry as SplitEditorEntry, SplitType } from './SplitEditor';
import PayerPicker from './PayerPicker';
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
  const styles = useMemo(() => createStyles(theme), [theme]);

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, expense?.row_id]);

  const handleSave = async () => {
    if (!expense) return;
    setLoading(true);
    try {
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Edit Expense</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
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

          <CustomButton title={loading ? 'Saving...' : 'Save Changes'} onPress={handleSave} disabled={loading} style={{ marginTop: 20 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  closeBtn: {
    padding: 8,
  },
  closeText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  pickerLabel: {
    fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary,
    marginBottom: 6, marginTop: 12,
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
    fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary,
  },
  pickerChipTextActive: {
    color: theme.colors.textInverse,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
});
