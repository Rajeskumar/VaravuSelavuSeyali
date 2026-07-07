/**
 * SplitEditor.tsx — Phase 1: equal-only split selector.
 *
 * Phase 1 constraint: only "equal" split is surfaced. The component is
 * architected to accept `allowedTypes` so Phase 2 can unlock percentage/exact
 * splits without changing GroupDetailScreen or AddExpenseScreen.
 */
import React from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { MemberDTO } from '../api/groups';
import { memberColor } from './BalanceRow';

export type SplitType = 'equal'; // Phase 2 will add: | 'exact' | 'percentage'

export interface SplitEntry {
  member_id: string;
  value?: number; // unused for equal, used for exact/percentage in Phase 2
}

export interface SplitEditorValue {
  type: SplitType;
  entries: SplitEntry[];
}

interface Props {
  members: MemberDTO[];
  value: SplitEditorValue;
  onChange: (val: SplitEditorValue) => void;
  totalAmount: number;
  /** Phase 1: only 'equal' is allowed. Expand in Phase 2. */
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

export default function SplitEditor({ members, value, onChange, totalAmount }: Props) {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const activeMembers = members.filter((m) => m.status === 'active');
  const shares = computeEqualShares(activeMembers, totalAmount);

  const toggleMember = (memberId: string, enabled: boolean) => {
    const current = value.entries.map((e) => e.member_id);
    let next: string[];
    if (enabled) {
      next = [...current, memberId];
    } else {
      next = current.filter((id) => id !== memberId);
    }
    onChange({ type: 'equal', entries: next.map((id) => ({ member_id: id })) });
  };

  const selectedIds = new Set(value.entries.map((e) => e.member_id));
  const selectedMembers = activeMembers.filter((m) => selectedIds.has(m.member_id));
  const perShare =
    selectedMembers.length > 0
      ? (totalAmount / selectedMembers.length).toFixed(2)
      : '0.00';

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Split equally among</Text>
      {activeMembers.map((member, idx) => {
        const isSelected = selectedIds.has(member.member_id);
        return (
          <View key={member.member_id} style={styles.row}>
            <View style={[styles.avatarBox, { backgroundColor: memberColor(member.member_id) }]}>
              <Text style={styles.avatarText}>
                {member.display_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.memberName} numberOfLines={1}>
              {member.display_name}
            </Text>
            {isSelected && totalAmount > 0 && (
              <Text style={styles.shareAmount}>${perShare}</Text>
            )}
            <Switch
              value={isSelected}
              onValueChange={(v) => toggleMember(member.member_id, v)}
              trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
              thumbColor="#fff"
            />
          </View>
        );
      })}
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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.borderLight,
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
    shareAmount: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 14,
      color: theme.colors.primary,
      marginRight: 8,
    },
    warning: {
      fontFamily: 'Inter-Regular',
      fontSize: 13,
      color: theme.colors.error,
      marginTop: 4,
    },
  });
