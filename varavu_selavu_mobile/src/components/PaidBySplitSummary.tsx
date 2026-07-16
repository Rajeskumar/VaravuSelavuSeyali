import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { MemberDTO, PayerSummaryItem } from '../api/groups';
import PayerPicker, { computePayersValid } from './PayerPicker';
import SplitEditor, { SplitEditorValue, SplitType, computeSplitValid } from './SplitEditor';

interface Props {
  amount: number;
  members: MemberDTO[];
  myMemberId?: string;
  payers: PayerSummaryItem[];
  onPayersChange: (payers: PayerSummaryItem[]) => void;
  splitValue: SplitEditorValue;
  onSplitChange: (value: SplitEditorValue) => void;
  /** Restricts the split picker's type tabs — Quick Capture's itemized-receipt path only
   * supports 'equal' (member_ratios per line item has no percentage/exact/shares/adjustment
   * analog). Defaults to all 5 types. */
  allowedSplitTypes?: SplitType[];
  /** Fired after either picker's own Save commits a change — lets the parent flip a shared
   * "customized" flag without this component needing to know that concept exists. */
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
 * Splitwise-style "Paid by X and split Y" summary line — RN port of the web app's
 * PaidBySplitSummary.tsx. The picker stays hidden behind a tap instead of always rendering
 * expanded (unlike EditGroupExpenseModal.tsx's always-visible PayerPicker/SplitEditor
 * sections — too much chrome for a fast-entry surface). Picker changes are staged locally and
 * only committed to the parent on Save; Cancel discards them.
 */
const PaidBySplitSummary: React.FC<Props> = ({
  amount,
  members,
  myMemberId,
  payers,
  onPayersChange,
  splitValue,
  onSplitChange,
  allowedSplitTypes,
  onCustomized,
}) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [pickerType, setPickerType] = useState<PickerType>(null);
  const [localPayers, setLocalPayers] = useState<PayerSummaryItem[]>(payers);
  const [localSplit, setLocalSplit] = useState<SplitEditorValue>(splitValue);

  const openPicker = (type: 'payer' | 'split') => {
    setLocalPayers(payers);
    setLocalSplit(splitValue);
    setPickerType(type);
  };

  const handleCancel = () => setPickerType(null);

  const localPayersValid = computePayersValid(localPayers, amount);
  const localSplitValid = computeSplitValid(localSplit, amount);
  const saveDisabled = pickerType === 'payer' ? !localPayersValid : !localSplitValid;

  const handleSave = () => {
    if (pickerType === 'payer') {
      onPayersChange(localPayers);
    } else if (pickerType === 'split') {
      onSplitChange(localSplit);
    }
    onCustomized?.();
    setPickerType(null);
  };

  const perPerson = splitValue.type === 'equal' && splitValue.entries.length > 0 ? amount / splitValue.entries.length : null;

  return (
    <View style={styles.container}>
      <Text style={styles.summaryText}>
        Paid by{' '}
        <Text style={styles.link} onPress={() => openPicker('payer')}>
          {payerLabel(payers, members, myMemberId)}
        </Text>{' '}
        and split{' '}
        <Text style={styles.link} onPress={() => openPicker('split')}>
          {splitLabel(splitValue)}
        </Text>
        .
      </Text>
      {perPerson !== null && <Text style={styles.perPerson}>(${perPerson.toFixed(2)}/person)</Text>}

      <Modal visible={pickerType !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleCancel}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{pickerType === 'payer' ? 'Choose payer' : 'Choose how to split'}</Text>
            <TouchableOpacity onPress={handleCancel} style={styles.closeBtn}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            {pickerType === 'payer' && (
              <PayerPicker amount={amount} members={members} payers={localPayers} onChange={setLocalPayers} />
            )}
            {pickerType === 'split' && (
              <SplitEditor
                members={members}
                totalAmount={amount}
                value={localSplit}
                onChange={setLocalSplit}
                allowedTypes={allowedSplitTypes}
              />
            )}
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saveDisabled && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saveDisabled}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { paddingVertical: 2 },
    summaryText: { fontFamily: 'Inter-Regular', fontSize: 13, color: theme.colors.textSecondary },
    link: { fontFamily: 'Inter-Bold', color: theme.colors.primary, textDecorationLine: 'underline' },
    perPerson: { fontFamily: 'Inter-Regular', fontSize: 12, color: theme.colors.textTertiary, marginTop: 2 },

    modalContainer: { flex: 1, backgroundColor: theme.colors.background },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    modalTitle: { fontFamily: 'Inter-Bold', fontSize: 18, color: theme.colors.text },
    closeBtn: { padding: 8 },
    closeText: { color: theme.colors.primary, fontFamily: 'Inter-SemiBold', fontSize: 16 },
    modalScroll: { flex: 1 },
    modalContent: { padding: 20, paddingBottom: 40 },
    modalFooter: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    cancelBtn: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.borderLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: theme.colors.text },
    saveBtn: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnDisabled: { backgroundColor: theme.colors.border },
    saveBtnText: { fontFamily: 'Inter-Bold', fontSize: 15, color: '#FFFFFF' },
  });

export default PaidBySplitSummary;
