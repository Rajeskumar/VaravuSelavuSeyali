/**
 * SplitEditor.tsx — full equal/exact/percentage/shares/adjustment split selector, gated per
 * call site via `allowedTypes` (e.g. Quick Capture's itemized-receipt path only supports
 * 'equal' — member_ratios per line item has no percentage/exact/shares/adjustment analog).
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, inkOnPastel } from '../theme';
import { MemberDTO } from '../api/groups';
import { memberColor } from './BalanceRow';
import { formatCurrency } from '../utils/currencyMath';

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

/**
 * Pure validity check, usable without mounting the component — lets a parent (e.g. the new
 * SplitSheet.tsx) gate its own Save button on the currently-staged split. At least as
 * strict as the component's own inline isValid computation below (which this mirrors), plus a
 * participant-count requirement for equal/shares/adjustment that the inline version leaves to
 * a separate, non-blocking "Select at least one member" warning (matches the web app's
 * PayerPicker/SplitEditor.tsx computeSplitValid convention of actually gating on that).
 */
export function computeSplitValid(value: SplitEditorValue, totalAmount: number): boolean {
  if (
    (value.type === 'equal' || value.type === 'shares' || value.type === 'adjustment') &&
    value.entries.length === 0
  ) {
    return false;
  }
  const sum = value.entries.reduce((acc, e) => acc + (e.value || 0), 0);
  if (value.type === 'percentage') return Math.abs(sum - 100) <= 0.01;
  if (value.type === 'exact') return Math.abs(sum - totalAmount) <= 0.01;
  if (value.type === 'shares') return sum > 0;
  if (value.type === 'adjustment') return Math.abs(sum) <= 0.01;
  return true; // equal
}

export default function SplitEditor({ members, value, onChange, totalAmount, allowedTypes }: Props) {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  // `'active'`-only excluded placeholder members permanently — the backend sets a member's
  // status to `'invited'` (not `'active'`) whenever they were added without an email, and there's
  // no path for that to ever change since they have no account to log into and "accept" with.
  // Splitting with people who haven't signed up is a core use case, so only `'left'` (someone who
  // actually left the group) should be excluded — matches the web app's `SplitEditor.tsx`, which
  // doesn't filter by status at all.
  const activeMembers = members.filter((m) => m.status !== 'left');
  const allTypes: SplitType[] = allowedTypes || ['equal', 'exact', 'percentage', 'shares', 'adjustment'];

  const typeLabels: Record<SplitType, string> = {
    equal: 'Equal',
    exact: 'Exact',
    percentage: 'Percent',
    shares: 'Shares',
    adjustment: 'Adjust',
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
      validationMessage = `Exact amounts must total ${formatCurrency(totalAmount)} (currently ${formatCurrency(sum)})`;
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

  // Whatever the current preview doesn't account for (exact amounts still to allocate, or a
  // percentage/shares total that doesn't reconcile) — the "$X left" figure under the rows.
  const allocated = Math.round(preview.reduce((acc, n) => acc + n, 0) * 100) / 100;
  const left = Math.round((totalAmount - allocated) * 100) / 100;
  const balanced = Math.abs(left) < 0.005;

  return (
    <View style={styles.container}>
      {allTypes.length > 1 && (
        <View style={styles.typeSelector}>
          {allTypes.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, value.type === t && styles.typeBtnActive]}
              onPress={() => setType(t)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: value.type === t }}
            >
              <Text style={[styles.typeBtnText, value.type === t && styles.typeBtnTextActive]} numberOfLines={1}>
                {typeLabels[t] || t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {activeMembers.map((member) => {
        const isSelected = selectedIds.has(member.member_id);
        const entryIndex = value.entries.findIndex((e) => e.member_id === member.member_id);
        const entry = entryIndex >= 0 ? value.entries[entryIndex] : null;
        const memberPreview = entryIndex >= 0 ? preview[entryIndex] : 0;

        return (
          <View key={member.member_id} style={styles.row}>
            <View style={[styles.avatarBox, { backgroundColor: memberColor(member.member_id) }]}>
              <Text style={styles.avatarText}>
                {member.display_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.memberName, !isSelected && styles.dim]} numberOfLines={1}>
              {member.display_name}
            </Text>

            {isSelected && value.type !== 'equal' && (
              <TextInput
                style={styles.numberInput}
                keyboardType="numeric"
                value={entry?.value?.toString() ?? ''}
                onChangeText={(text) => updateEntryValue(member.member_id, text)}
                placeholder="0"
                placeholderTextColor={theme.colors.textQuaternary}
                selectTextOnFocus
              />
            )}
            {isSelected && totalAmount > 0 && (
              <Text style={styles.shareAmount}>{formatCurrency(memberPreview)}</Text>
            )}
            <TouchableOpacity
              onPress={() => toggleMember(member.member_id, !isSelected)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={`Include ${member.display_name}`}
              style={[styles.check, isSelected ? styles.checkOn : styles.checkOff]}
            >
              {isSelected && <Ionicons name="checkmark" size={14} color={inkOnPastel} />}
            </TouchableOpacity>
          </View>
        );
      })}
      {selectedMembers.length > 0 && totalAmount > 0 && (
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>Rounding cents are balanced automatically</Text>
          <Text style={[styles.footerLeft, { color: balanced ? theme.colors.success : theme.colors.error }]}>
            {balanced ? '$0.00' : `${left < 0 ? '−' : ''}${formatCurrency(Math.abs(left))}`} left
          </Text>
        </View>
      )}
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
    container: { marginTop: 4 },
    // V2 segmented control: hairline-filled track, the active option is the light "ink" pill.
    typeSelector: {
      flexDirection: 'row', gap: 4, padding: 3, marginBottom: 6,
      borderRadius: 12, backgroundColor: theme.colors.surfaceSecondary,
    },
    typeBtn: { flex: 1, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
    typeBtnActive: { backgroundColor: theme.colors.text },
    typeBtnText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13, color: theme.colors.textSecondary },
    typeBtnTextActive: { fontFamily: 'InstrumentSans-Bold', color: theme.colors.background },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
    },
    avatarBox: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    // memberColor() is a fixed pastel palette in both modes — ink text always.
    avatarText: { color: inkOnPastel, fontFamily: 'InstrumentSans-Bold', fontSize: 13 },
    memberName: { flex: 1, fontFamily: 'InstrumentSans-SemiBold', fontSize: 15, color: theme.colors.text },
    dim: { color: theme.colors.textTertiary },
    numberInput: {
      borderWidth: 1, borderColor: theme.colors.border, borderRadius: 9,
      paddingHorizontal: 8, paddingVertical: 5, width: 62, textAlign: 'center',
      fontFamily: 'InstrumentSans-Medium', fontSize: 14, color: theme.colors.text,
    },
    shareAmount: {
      fontFamily: 'InstrumentSans-Bold', fontSize: 15, color: theme.colors.text,
      minWidth: 58, textAlign: 'right', fontVariant: ['tabular-nums'],
    },
    check: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
    checkOn: { backgroundColor: theme.colors.success },
    checkOff: { borderWidth: 1.5, borderColor: theme.colors.border },
    footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
    footerText: { fontFamily: 'InstrumentSans-Regular', fontSize: 13, color: theme.colors.textTertiary, flex: 1 },
    footerLeft: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13, fontVariant: ['tabular-nums'] },
    warning: { fontFamily: 'InstrumentSans-Regular', fontSize: 13, color: theme.colors.error, marginTop: 8 },
  });
