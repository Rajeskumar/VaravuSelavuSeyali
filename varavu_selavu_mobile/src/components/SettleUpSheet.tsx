/**
 * SettleUpSheet.tsx — Bottom sheet to record a payment between two members.
 *
 * The settlement amount field is pre-populated with the absolute value of
 * the "from" member's net debt to the "to" member, but the user can override.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { MemberDTO, MemberBalance, recordSettlement } from '../api/groups';
import CustomButton from './CustomButton';
import { showToast } from './Toast';
import { memberColor, initialsFromName } from './BalanceRow';
import { venmoLink, paypalMeLink, upiLink } from '../utils/paymentDeepLinks';

type Stage = 'review' | 'settling' | 'done';

/** 900ms cubic-ease-out count-down, matching docs/design/prototypes/SettleUp.jsx's resolution moment. */
function useCountDown() {
  const [displayValue, setDisplayValue] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);

  const runFrom = useCallback((from: number, onDone: () => void) => {
    const start = Date.now();
    const duration = 900;
    function step() {
      const progress = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(from * (1 - eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        onDone();
      }
    }
    rafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  return { displayValue, setDisplayValue, runFrom };
}

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
  const [stage, setStage] = useState<Stage>('review');
  const { displayValue, setDisplayValue, runFrom } = useCountDown();

  const fromMember = members.find((m) => m.member_id === fromMemberId);
  const toMember = members.find((m) => m.member_id === toMemberId);
  const toBalance = balances.find((b) => b.member_id === toMemberId);

  // TS-GRP-130: payment deep links — opens the user's own payment app with
  // the amount pre-filled; never auto-records the settlement.
  const paymentButtons: { label: string; url: string }[] = [];
  const parsedAmountForLinks = parseFloat(amount) || 0;
  if (parsedAmountForLinks > 0 && toBalance) {
    const note = 'TrackSpense settlement';
    if (toBalance.venmo_handle) paymentButtons.push({ label: 'Venmo', url: venmoLink(toBalance.venmo_handle, parsedAmountForLinks, note) });
    if (toBalance.paypal_handle) paymentButtons.push({ label: 'PayPal', url: paypalMeLink(toBalance.paypal_handle, parsedAmountForLinks) });
    if (toBalance.upi_id) paymentButtons.push({ label: 'UPI', url: upiLink(toBalance.upi_id, parsedAmountForLinks, note) });
  }

  React.useEffect(() => {
    if (visible) {
      const initial = suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '';
      setAmount(initial);
      setStage('review');
      setDisplayValue(suggestedAmount > 0 ? suggestedAmount : 0);
    }
  }, [visible, suggestedAmount, setDisplayValue]);

  React.useEffect(() => {
    if (stage === 'review') setDisplayValue(parseFloat(amount) || 0);
  }, [amount, stage, setDisplayValue]);

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
    setStage('settling');
    try {
      await recordSettlement(groupId, {
        from_member_id: fromMemberId,
        to_member_id: toMemberId,
        amount: parsedAmount,
      });
      onSettled();
      runFrom(parsedAmount, () => setStage('done'));
    } catch (e: any) {
      showToast({ message: e.message ?? 'Failed to record settlement', type: 'error' });
      setStage('review');
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    onClose();
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
        <Pressable style={StyleSheet.absoluteFill} onPress={stage === 'settling' ? undefined : onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.pill} />
          <Text style={styles.title}>Settle Up</Text>

          {(fromMember && toMember) || stage === 'done' ? (
            <View style={styles.heroBlock}>
              <Text style={styles.heroLabel}>{stage === 'done' ? 'All squared up' : 'Settling'}</Text>
              <View style={styles.heroAmountRow}>
                {stage === 'done' && (
                  <Ionicons name="checkmark-circle" size={26} color={theme.colors.gold} style={{ marginRight: 6 }} />
                )}
                <Text style={[styles.heroAmount, { color: stage === 'done' ? theme.colors.gold : theme.colors.success }]}>
                  ${(stage === 'done' ? 0 : displayValue).toFixed(2)}
                </Text>
              </View>
            </View>
          ) : null}

          {stage === 'done' ? (
            <>
              <Text style={styles.doneSubtext}>
                {fromMember?.display_name} paid {toMember?.display_name} — balances updated.
              </Text>
              <CustomButton title="Done" onPress={handleDone} />
            </>
          ) : (
            <>
              {fromMember && toMember ? (
                <View style={[styles.previewRow, stage === 'settling' && styles.previewRowSettling]}>
                  <View style={styles.previewPerson}>
                    <View style={[styles.previewAvatar, { backgroundColor: memberColor(fromMember.member_id) }]}>
                      <Text style={styles.previewAvatarText}>{initialsFromName(fromMember.display_name)}</Text>
                    </View>
                    <Text style={styles.previewName} numberOfLines={1}>{fromMember.display_name}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={20} color={theme.colors.textTertiary} style={{ marginHorizontal: 12 }} />
                  <View style={styles.previewPerson}>
                    <View style={[styles.previewAvatar, { backgroundColor: memberColor(toMember.member_id) }]}>
                      <Text style={styles.previewAvatarText}>{initialsFromName(toMember.display_name)}</Text>
                    </View>
                    <Text style={styles.previewName} numberOfLines={1}>{toMember.display_name}</Text>
                  </View>
                </View>
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
                  editable={stage === 'review'}
                  autoFocus
                />
              </View>

              {paymentButtons.length > 0 && (
                <View style={styles.paymentButtonsRow}>
                  {paymentButtons.map((b) => (
                    <Pressable
                      key={b.label}
                      style={styles.paymentButton}
                      onPress={() => Linking.openURL(b.url).catch(() => showToast({ message: `Couldn't open ${b.label}`, type: 'error' }))}
                    >
                      <Text style={styles.paymentButtonText}>Pay with {b.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <CustomButton
                title={stage === 'settling' ? 'Settling…' : 'Record Payment'}
                onPress={handleSubmit}
                disabled={loading}
              />
              <CustomButton
                title="Cancel"
                onPress={onClose}
                variant="outline"
                disabled={loading}
              />
            </>
          )}
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
    heroBlock: {
      alignItems: 'center',
      paddingVertical: 20,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderLight,
      marginTop: 4,
    },
    heroLabel: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    heroAmountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
    },
    heroAmount: {
      fontFamily: 'SpaceGrotesk-SemiBold',
      fontSize: 36,
      fontVariant: ['tabular-nums'],
    },
    doneSubtext: {
      fontFamily: 'Inter-Regular',
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: 8,
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySurface,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 12,
      marginTop: 4,
    },
    previewRowSettling: {
      opacity: 0.6,
    },
    previewPerson: { alignItems: 'center', maxWidth: 90 },
    previewAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    previewAvatarText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 16 },
    previewName: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 13,
      color: theme.colors.text,
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
    paymentButtonsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'center',
      marginBottom: 4,
    },
    paymentButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    paymentButtonText: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 13,
      color: theme.colors.primary,
    },
  });
