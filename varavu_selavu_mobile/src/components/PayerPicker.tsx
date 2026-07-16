import React from 'react';
import { View, Text, StyleSheet, Switch, TextInput } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { MemberDTO, PayerSummaryItem } from '../api/groups';
import { memberColor } from './BalanceRow';

interface Props {
  amount: number;
  members: MemberDTO[];
  payers: PayerSummaryItem[];
  onChange: (payers: PayerSummaryItem[]) => void;
  onValidityChange?: (valid: boolean) => void;
}

const TOLERANCE = 0.01;

/** Usable without mounting the component (mirrors web's PayerPicker.tsx export) — lets a
 * parent gate its own Save button on the currently-staged payers before the picker is even
 * open. */
export function computePayersValid(payers: PayerSummaryItem[], amount: number): boolean {
  const totalEntered = payers.reduce((sum, p) => sum + p.amount_paid, 0);
  return Math.abs(totalEntered - amount) < TOLERANCE;
}

export default function PayerPicker({
  amount,
  members,
  payers,
  onChange,
  onValidityChange,
}: Props) {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  // See the matching comment in SplitEditor.tsx — `'active'`-only permanently excluded
  // placeholder (invited, no-email) members, which can never become `'active'`.
  const activeMembers = members.filter((m) => m.status !== 'left');
  const selectedIds = React.useMemo(() => new Set(payers.map((p) => p.member_id)), [payers]);
  
  const totalEntered = payers.reduce((sum, p) => sum + p.amount_paid, 0);
  const isValid = computePayersValid(payers, amount);

  React.useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  const toggleMember = (memberId: string, checked: boolean) => {
    if (checked) {
      const remaining = Math.max(0, amount - totalEntered);
      onChange([...payers, { member_id: memberId, amount_paid: remaining }]);
    } else {
      onChange(payers.filter((p) => p.member_id !== memberId));
    }
  };

  const updateAmount = (memberId: string, valStr: string) => {
    const num = parseFloat(valStr) || 0;
    onChange(
      payers.map((p) => (p.member_id === memberId ? { ...p, amount_paid: num } : p))
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Who Paid?</Text>
      {activeMembers.map((member) => {
        const isSelected = selectedIds.has(member.member_id);
        const payer = payers.find((p) => p.member_id === member.member_id);

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
            
            {isSelected && (
              <View style={styles.inputContainer}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.numberInput}
                  keyboardType="numeric"
                  value={payer?.amount_paid?.toString() ?? '0'}
                  onChangeText={(text) => updateAmount(member.member_id, text)}
                  placeholder="0.00"
                  placeholderTextColor={theme.colors.textQuaternary}
                />
              </View>
            )}
          </View>
        );
      })}

      {!isValid && (
        <Text style={styles.warning}>
          Amounts paid must equal total expense (${amount.toFixed(2)}). Currently: ${totalEntered.toFixed(2)}.
        </Text>
      )}
      {isValid && (
        <Text style={styles.success}>
          Payments reconcile ✓
        </Text>
      )}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { marginTop: 8, marginBottom: 8 },
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
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 6,
      paddingHorizontal: 8,
      backgroundColor: theme.colors.background,
    },
    currencySymbol: {
      fontFamily: 'Inter-Regular',
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginRight: 4,
    },
    numberInput: {
      paddingVertical: 6,
      minWidth: 60,
      textAlign: 'right',
      fontFamily: 'Inter-Medium',
      fontSize: 14,
      color: theme.colors.text,
    },
    warning: {
      fontFamily: 'Inter-Regular',
      fontSize: 13,
      color: theme.colors.error,
      marginTop: 8,
    },
    success: {
      fontFamily: 'Inter-Medium',
      fontSize: 13,
      color: theme.colors.success || '#34C759',
      marginTop: 8,
    },
  });
