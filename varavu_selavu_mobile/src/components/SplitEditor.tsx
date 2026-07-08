/**
 * SplitEditor.tsx — Phase 1: equal-only split selector.
 *
 * Phase 1 constraint: only "equal" split is surfaced. The component is
 * architected to accept `allowedTypes` so Phase 2 can unlock percentage/exact
 * splits without changing GroupDetailScreen or AddExpenseScreen.
 */
import React from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { MemberDTO } from '../api/groups';
import { memberColor } from './BalanceRow';

export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares' | 'adjustment';

export interface SplitEntry {
  member_id: string;
  value?: number;
}

export interface SplitEditorValue {
  type: SplitType;
  entries: SplitEntry[];
}

interface Props {
  members: MemberDTO[];
  totalAmount: number;
  value: SplitEditorValue;
  onChange: (val: SplitEditorValue) => void;
  allowedTypes?: SplitType[];
}

/**
 * Invariant (§3.3): the sum of all member shares must equal the total amount.
 * For equal split: each share = totalAmount / memberCount (rounded to 2dp).
 */
export function computeEqualShares(
  members: MemberDTO[],
  totalAmount: number,
): number[] {
  if (members.length === 0) return [];
  const perMember = Math.floor((totalAmount * 100) / members.length) / 100;
  const shares = members.map(() => perMember);
  // Assign the rounding remainder to the first member
  const distributed = shares.reduce((a, b) => a + b, 0);
  const remainder = Math.round((totalAmount - distributed) * 100) / 100;
  if (shares.length > 0) shares[0] = Math.round((shares[0] + remainder) * 100) / 100;
  return shares;
}

export function previewPercentageSplit(entries: SplitEntry[], amount: number): number[] {
  const result = entries.map(() => 0);
  if (entries.length === 0) return result;
  
  let exactTotal = 0;
  const exactShares = entries.map((e) => {
    const s = amount * ((e.value || 0) / 100.0);
    exactTotal += s;
    return s;
  });
  
  // Distribute based on largest remainder
  let remaining = Math.round((amount - exactTotal) * 100); // working in cents
  const floored = exactShares.map((s) => Math.floor(s * 100) / 100);
  const diffs = exactShares.map((s, i) => ({ i, diff: s - floored[i] })).sort((a, b) => b.diff - a.diff);
  
  const finalCents = floored.map((s) => Math.round(s * 100));
  
  let diffSum = Math.round(amount * 100) - finalCents.reduce((a, b) => a + b, 0);
  
  for (let idx = 0; idx < diffSum && idx < diffs.length; idx++) {
    finalCents[diffs[idx].i] += 1;
  }
  
  return finalCents.map((c) => c / 100);
}

export function previewExactSplit(entries: SplitEntry[], amount: number): number[] {
  return entries.map((e) => e.value || 0);
}

export function previewSharesSplit(entries: SplitEntry[], amount: number): number[] {
  const result = entries.map(() => 0);
  if (entries.length === 0) return result;

  const totalShares = entries.reduce((sum, e) => sum + (e.value || 0), 0);
  if (totalShares <= 0) return result;

  const exactShares = entries.map((e) => amount * ((e.value || 0) / totalShares));
  
  const floored = exactShares.map((s) => Math.floor(s * 100) / 100);
  const diffs = exactShares.map((s, i) => ({ i, diff: s - floored[i] })).sort((a, b) => b.diff - a.diff);
  
  const finalCents = floored.map((s) => Math.round(s * 100));
  let diffSum = Math.round(amount * 100) - finalCents.reduce((a, b) => a + b, 0);
  
  for (let idx = 0; idx < diffSum && idx < diffs.length; idx++) {
    finalCents[diffs[idx].i] += 1;
  }
  
  return finalCents.map((c) => c / 100);
}

export function previewAdjustmentSplit(entries: SplitEntry[], amount: number): number[] {
  const result = entries.map(() => 0);
  if (entries.length === 0) return result;

  const totalAdjustments = entries.reduce((sum, e) => sum + (e.value || 0), 0);
  const baseAmount = amount - totalAdjustments;
  
  const equalShares = computeEqualShares(entries.map(() => ({} as any)), baseAmount);
  return equalShares.map((base, i) => Math.round((base + (entries[i].value || 0)) * 100) / 100);
}

export default function SplitEditor({ members, value, onChange, totalAmount, allowedTypes }: Props) {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const activeMembers = members.filter((m) => m.status === 'active');
  const allTypes: SplitType[] = allowedTypes || ['equal', 'exact', 'percentage', 'shares', 'adjustment'];

  const typeLabels: Record<SplitType, string> = {
    equal: '=',
    exact: '$',
    percentage: '%',
    shares: 'Shares',
    adjustment: '+/-',
  };

  const setType = (newType: SplitType) => {
    let newEntries = value.entries;
    if (newType !== 'equal' && newEntries.length === 0) {
      newEntries = activeMembers.map((m) => ({ member_id: m.member_id, value: newType === 'shares' ? 1 : 0 }));
    }
    onChange({ type: newType, entries: newEntries });
  };

  const toggleMember = (memberId: string, enabled: boolean) => {
    if (enabled) {
      let defaultValue: number | undefined;
      if (value.type === 'shares') defaultValue = 1;
      else if (value.type === 'adjustment' || value.type === 'exact' || value.type === 'percentage') defaultValue = 0;
      else defaultValue = undefined;
      
      onChange({ ...value, entries: [...value.entries, { member_id: memberId, value: defaultValue }] });
    } else {
      onChange({ ...value, entries: value.entries.filter((e) => e.member_id !== memberId) });
    }
  };

  const updateEntryValue = (memberId: string, valStr: string) => {
    const num = parseFloat(valStr);
    onChange({
      ...value,
      entries: value.entries.map((e) => (e.member_id === memberId ? { ...e, value: isNaN(num) ? 0 : num } : e)),
    });
  };

  const selectedIds = new Set(value.entries.map((e) => e.member_id));
  const selectedMembers = activeMembers.filter((m) => selectedIds.has(m.member_id));

  // Compute preview
  let preview: number[] = [];
  let isValid = true;
  let validationMessage = '';

  if (value.type === 'equal') {
    preview = computeEqualShares(selectedMembers, totalAmount);
  } else if (value.type === 'percentage') {
    preview = previewPercentageSplit(value.entries, totalAmount);
    const sum = value.entries.reduce((acc, e) => acc + (e.value || 0), 0);
    if (Math.abs(sum - 100) > 0.01) {
      isValid = false;
      validationMessage = `Percentages must total 100 (currently ${sum.toFixed(2)})`;
    }
  } else if (value.type === 'exact') {
    preview = previewExactSplit(value.entries, totalAmount);
    const sum = value.entries.reduce((acc, e) => acc + (e.value || 0), 0);
    if (Math.abs(sum - totalAmount) > 0.01) {
      isValid = false;
      validationMessage = `Exact amounts must total $${totalAmount.toFixed(2)} (currently $${sum.toFixed(2)})`;
    }
  } else if (value.type === 'shares') {
    preview = previewSharesSplit(value.entries, totalAmount);
    const sum = value.entries.reduce((acc, e) => acc + (e.value || 0), 0);
    if (sum <= 0) {
      isValid = false;
      validationMessage = 'Total shares must be greater than 0';
    }
  } else if (value.type === 'adjustment') {
    preview = previewAdjustmentSplit(value.entries, totalAmount);
    const sum = value.entries.reduce((acc, e) => acc + (e.value || 0), 0);
    if (Math.abs(sum) > 0.01) {
      isValid = false;
      validationMessage = `Adjustments must sum to 0 (currently ${sum > 0 ? '+' : ''}${sum.toFixed(2)})`;
    }
  }

  return (
    <View style={styles.container}>
      {allTypes.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeSelector}>
          {allTypes.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, value.type === t && styles.typeBtnActive]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.typeBtnText, value.type === t && styles.typeBtnTextActive]}>
                {typeLabels[t] || t}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {activeMembers.map((member) => {
        const isSelected = selectedIds.has(member.member_id);
        const entryIndex = value.entries.findIndex((e) => e.member_id === member.member_id);
        const entry = entryIndex >= 0 ? value.entries[entryIndex] : null;
        const memberPreview = entryIndex >= 0 ? preview[entryIndex] : 0;

        return (
          <View key={member.member_id} style={[styles.row, !isSelected && styles.rowDisabled]}>
            <Switch
              value={isSelected}
              onValueChange={(v) => toggleMember(member.member_id, v)}
              trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
              thumbColor="#fff"
              style={{ marginRight: 12, transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
            <View style={[styles.avatarBox, { backgroundColor: memberColor(member.member_id) }]}>
              <Text style={styles.avatarText}>
                {member.display_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.memberName} numberOfLines={1}>
              {member.display_name}
            </Text>
            
            <View style={styles.rightContent}>
              {isSelected && value.type !== 'equal' && (
                <TextInput
                  style={styles.numberInput}
                  keyboardType="numeric"
                  value={entry?.value?.toString() ?? ''}
                  onChangeText={(text) => updateEntryValue(member.member_id, text)}
                  placeholder="0"
                  placeholderTextColor={theme.colors.textQuaternary}
                />
              )}
              {isSelected && totalAmount > 0 && (
                <Text style={styles.shareAmount}>${memberPreview.toFixed(2)}</Text>
              )}
            </View>
          </View>
        );
      })}
      {!isValid && (
        <Text style={styles.warning}>{validationMessage}</Text>
      )}
      {selectedMembers.length === 0 && (
        <Text style={styles.warning}>Select at least one member.</Text>
      )}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { marginTop: 8 },
    label: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 8,
    },
    typeSelector: {
      flexDirection: 'row',
      marginBottom: 12,
      gap: 8,
    },
    typeBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 16,
      backgroundColor: theme.colors.surfaceSecondary,
    },
    typeBtnActive: {
      backgroundColor: theme.colors.primary,
    },
    typeBtnText: {
      fontFamily: 'Inter-Medium',
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    typeBtnTextActive: {
      color: '#fff',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.borderLight,
    },
    rowDisabled: {
      opacity: 0.5,
    },
    avatarBox: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    avatarText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 14 },
    memberName: {
      flex: 1,
      fontFamily: 'Inter-Regular',
      fontSize: 15,
      color: theme.colors.text,
    },
    rightContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    numberInput: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      width: 60,
      textAlign: 'center',
      marginRight: 12,
      fontFamily: 'Inter-Medium',
      fontSize: 14,
      color: theme.colors.text,
    },
    shareAmount: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 14,
      color: theme.colors.primary,
      minWidth: 60,
      textAlign: 'right',
    },
    warning: {
      fontFamily: 'Inter-Regular',
      fontSize: 13,
      color: theme.colors.error,
      marginTop: 8,
    },
  });
