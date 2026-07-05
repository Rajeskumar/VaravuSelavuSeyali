/**
 * SettleUpSheet.tsx — Bottom sheet to record a payment between two members.
 *
 * The settlement amount field is pre-populated with the absolute value of
 * the "from" member's net debt to the "to" member, but the user can override.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { MemberDTO, MemberBalance, recordSettlement } from '../api/groups';
import CustomButton from './CustomButton';
import { showToast } from './Toast';

interface Props {
  visible: boolean;
  groupId: string;
  members: MemberDTO[];
  balances: MemberBalance[];
  /** Pre-selected payer (the one who owes) */
  fromMemberId?: string | null;
  /** Pre-selected payee (the one who is owed) */
  toMemberId?: string | null;
  /** Pre-populated suggestion amount */
  suggestedAmount?: number;
  onClose: () => void;
  onSettled: () => void;
}

export default function SettleUpSheet({
  visible,
  groupId,
  members,
  balances,
  fromMemberId,
  toMemberId,
  suggestedAmount = 0,
  onClose,
  onSettled,
}: Props) {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [amount, setAmount] = useState(
    suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '',
  );
  const [loading, setLoading] = useState(false);

  const fromMember = members.find((m) => m.member_id === fromMemberId);
  const toMember = members.find((m) => m.member_id === toMemberId);

  React.useEffect(() => {
    if (visible) {
      setAmount(suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '');
    }
  }, [visible, suggestedAmount]);

  const handleSubmit = async () => {
    const parsedAmount = parseFloat(amount);
    if (!fromMemberId || !toMemberId) {
      showToast({ message: 'Please select payer and payee', type: 'warning' });
      return;
    }
    if (!parsedAmount || parsedAmount <= 0) {
      showToast({ message: 'Please enter a valid amount', type: 'warning' });
      return;
    }
    setLoading(true);
    try {
      await recordSettlement(groupId, {
        from_member_id: fromMemberId,
        to_member_id: toMemberId,
        amount: parsedAmount,
      });
      showToast({ message: 'Settlement recorded', type: 'success' });
      onSettled();
      onClose();
    } catch (e: any) {
      showToast({ message: e.message ?? 'Failed to record settlement', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.pill} />
          <Text style={styles.title}>Settle Up</Text>

          {fromMember && toMember ? (
            <Text style={styles.subtitle}>
              {fromMember.display_name} pays {toMember.display_name}
            </Text>
          ) : null}

          <View style={styles.amountRow}>
            <Text style={styles.currencySymbol}>$</Text>
            <TextInput
              style={styles.amountInput}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.colors.textTertiary}
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />
          </View>

          <CustomButton
            title={loading ? 'Recording…' : 'Record Payment'}
            onPress={handleSubmit}
            disabled={loading}
          />
          <CustomButton
            title="Cancel"
            onPress={onClose}
            variant="outline"
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingTop: 12,
      gap: 12,
    },
    pill: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.borderLight,
      alignSelf: 'center',
      marginBottom: 12,
    },
    title: {
      fontFamily: 'Inter-Bold',
      fontSize: 20,
      color: theme.colors.text,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: 'Inter-Regular',
      fontSize: 15,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 8,
    },
    currencySymbol: {
      fontFamily: 'Inter-Bold',
      fontSize: 32,
      color: theme.colors.text,
      marginRight: 4,
    },
    amountInput: {
      fontFamily: 'Inter-Bold',
      fontSize: 42,
      color: theme.colors.text,
      minWidth: 120,
      textAlign: 'center',
    },
  });
