/**
 * SplitSheet.tsx — the V2 "Split $24.50" sheet: segmented Equal / Exact / Percent / Shares, a
 * "PAID BY · NAME" line, one row per member, and Done. Changes are staged locally and committed
 * on Done; closing the sheet discards them (same contract the old PaidBySplitSummary picker had).
 * Tapping the paid-by line swaps the sheet's body to the payer picker instead of stacking a
 * second modal on top.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { MemberDTO, PayerSummaryItem } from '../api/groups';
import Sheet from './Sheet';
import SectionLabel from './SectionLabel';
import CustomButton from './CustomButton';
import PayerPicker, { computePayersValid } from './PayerPicker';
import SplitEditor, { SplitEditorValue, SplitType, computeSplitValid } from './SplitEditor';

interface Props {
  visible: boolean;
  onClose: () => void;
  amount: number;
  members: MemberDTO[];
  myMemberId?: string;
  payers: PayerSummaryItem[];
  splitValue: SplitEditorValue;
  /** Itemised receipts only support an equal split — pass ['equal'] to hide the rest. */
  allowedTypes?: SplitType[];
  onDone: (payers: PayerSummaryItem[], split: SplitEditorValue) => void;
}

/** "RAJESH" / "YOU" / "3 PEOPLE" — the name half of the PAID BY label. */
export function paidByName(payers: PayerSummaryItem[], members: MemberDTO[], myMemberId?: string, meLabel: string | null = 'You'): string {
  if (payers.length === 0) return 'Someone';
  if (payers.length > 1) return `${payers.length} people`;
  const p = payers[0];
  if (meLabel && p.member_id === myMemberId) return meLabel;
  return members.find((m) => m.member_id === p.member_id)?.display_name || 'Someone';
}

export default function SplitSheet({ visible, onClose, amount, members, myMemberId, payers, splitValue, allowedTypes, onDone }: Props) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [localPayers, setLocalPayers] = useState(payers);
  const [localSplit, setLocalSplit] = useState(splitValue);
  const [choosingPayer, setChoosingPayer] = useState(false);

  // Re-stage from the committed values every time the sheet opens.
  useEffect(() => {
    if (visible) {
      setLocalPayers(payers);
      setLocalSplit(splitValue);
      setChoosingPayer(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const payersValid = computePayersValid(localPayers, amount);
  const splitValid = computeSplitValid(localSplit, amount);
  const canDone = payersValid && splitValid;
  const money = `$${amount.toFixed(2)}`;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.head}>
        {choosingPayer ? (
          <TouchableOpacity onPress={() => setChoosingPayer(false)} style={styles.backRow} accessibilityRole="button" accessibilityLabel="Back to split">
            <Ionicons name="arrow-back" size={18} color={theme.colors.text} />
            <Text style={styles.title}>Paid by</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.title}>Split {money}</Text>
        )}
        <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {choosingPayer ? (
          <PayerPicker amount={amount} members={members} payers={localPayers} onChange={setLocalPayers} />
        ) : (
          <>
            <SectionLabel style={styles.paidBy}>
              Paid by ·{' '}
              <Text onPress={() => setChoosingPayer(true)} style={{ color: theme.colors.primary }} accessibilityRole="button">
                {paidByName(localPayers, members, myMemberId, null).toUpperCase()}
              </Text>
            </SectionLabel>
            <SplitEditor members={members} totalAmount={amount} value={localSplit} onChange={setLocalSplit} allowedTypes={allowedTypes} />
          </>
        )}
      </ScrollView>

      {choosingPayer && !payersValid && (
        <Text style={styles.warning}>Amounts paid must total {money}.</Text>
      )}
      <CustomButton
        title="Done"
        style={styles.done}
        disabled={choosingPayer ? !payersValid : !canDone}
        onPress={() => {
          if (choosingPayer) { setChoosingPayer(false); return; }
          onDone(localPayers, localSplit);
        }}
      />
    </Sheet>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: theme.typography.fontFamily.bold, fontSize: 19, letterSpacing: -0.3, color: theme.colors.text },
  close: { width: 32, height: 32, borderRadius: 11, backgroundColor: theme.colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  body: { maxHeight: 420 },
  paidBy: { fontSize: 10, letterSpacing: 1.4, marginTop: 14, marginBottom: 2 },
  warning: { fontFamily: theme.typography.fontFamily.regular, fontSize: 13, color: theme.colors.error, marginTop: 8 },
  done: { marginTop: 16 },
});
