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
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, inkOnPastel } from '../theme';
import { MemberDTO, MemberBalance, BalanceTransfer, recordSettlement } from '../api/groups';
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
  /** All the transfers the current user owes — switches the sheet to the V2 list layout (one row
   * per transfer, one "Record $total paid" for the lot). Omit for the single-payment form. */
  transfers?: BalanceTransfer[];
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
  transfers,
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
  const listMode = !!transfers && transfers.length > 0;
  // Payment method recorded with each transfer in list mode; null = not specified.
  const [method, setMethod] = useState<string | null>(null);
  const listTotal = (transfers ?? []).reduce((sum, t) => sum + t.amount, 0);
  const nameOf = (id: string) => members.find((m) => m.member_id === id)?.display_name ?? 'Someone';

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
      setMethod(null);
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

  // List mode: record every transfer in order. Stops at the first failure so nothing is recorded
  // twice on retry — the ones already recorded drop out of the group's suggested transfers.
  const handleRecordAll = async () => {
    if (!transfers || loading) return;
    setLoading(true);
    let recorded = 0;
    try {
      for (const t of transfers) {
        await recordSettlement(groupId, {
          from_member_id: t.from_member_id,
          to_member_id: t.to_member_id,
          amount: t.amount,
          ...(method ? { method } : {}),
        });
        recorded += 1;
      }
      showToast({ message: `Recorded $${listTotal.toFixed(2)} paid`, type: 'success' });
      onSettled();
      onClose();
    } catch (e: any) {
      if (recorded > 0) onSettled();
      showToast({
        message: recorded > 0 ? `Recorded ${recorded} of ${transfers.length}; the rest failed` : (e.message ?? 'Failed to record settlement'),
        type: 'error',
      });
      if (recorded > 0) onClose();
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
          <View style={styles.titleRow}>
            <Text style={styles.title}>Settle up</Text>
            {stage !== 'settling' && (
              <Pressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
              </Pressable>
            )}
          </View>
          {listMode && (
            <>
              <Text style={styles.subtitle}>
                Simplified to the fewest transfers. Recording a payment never changes anyone's spend totals.
              </Text>
              <View>
                {transfers!.map((t, i) => (
                  <View key={`${t.from_member_id}-${t.to_member_id}-${i}`} style={styles.transferRow}>
                    <View style={[styles.transferAvatar, { backgroundColor: memberColor(t.from_member_id) }]}>
                      <Text style={styles.previewAvatarText}>{initialsFromName(nameOf(t.from_member_id))}</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color={theme.colors.textTertiary} />
                    <View style={[styles.transferAvatar, { backgroundColor: memberColor(t.to_member_id) }]}>
                      <Text style={styles.previewAvatarText}>{initialsFromName(nameOf(t.to_member_id))}</Text>
                    </View>
                    <Text style={styles.transferText} numberOfLines={1}>
                      {nameOf(t.from_member_id)} pays {nameOf(t.to_member_id)}
                    </Text>
                    <Text style={styles.transferAmount}>${t.amount.toFixed(2)}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.methodRow}>
                {['Venmo', 'PayPal', 'Cash'].map((label) => {
                  const active = method === label.toLowerCase();
                  return (
                    <Pressable
                      key={label}
                      style={[styles.methodChip, active && styles.methodChipActive]}
                      onPress={() => setMethod(active ? null : label.toLowerCase())}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.methodChipText, active && { color: theme.colors.primaryLight }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <CustomButton
                title={loading ? 'Recording…' : `Record $${listTotal.toFixed(2)} paid`}
                onPress={handleRecordAll}
                disabled={loading}
              />
            </>
          )}

          {!listMode && stage === 'review' && (
            <Text style={styles.subtitle}>
              Recording a payment never changes anyone's spend totals.
            </Text>
          )}

          {!listMode && ((fromMember && toMember) || stage === 'done') ? (
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

          {listMode ? null : stage === 'done' ? (
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
                      <Text style={styles.paymentButtonText}>{b.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <CustomButton
                title={stage === 'settling' ? 'Settling…' : parsedAmountForLinks > 0 ? `Record $${parsedAmountForLinks.toFixed(2)} paid` : 'Record payment'}
                onPress={handleSubmit}
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
      backgroundColor: theme.colors.overlay,
    },
    // V2 sheet panel: elevated surface, 26px radius, 22px gutter (see components/Sheet.tsx).
    sheet: {
      backgroundColor: theme.colors.surfaceElevated,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      paddingHorizontal: 22,
      paddingTop: 12,
      gap: 14,
      ...theme.shadows.lg,
    },
    transferRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
    },
    transferAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    transferText: { flex: 1, fontFamily: 'InstrumentSans-Regular', fontSize: 14, color: theme.colors.textSecondary },
    transferAmount: { fontFamily: 'BricolageGrotesque-SemiBold', fontSize: 16, color: theme.colors.text, fontVariant: ['tabular-nums'] },
    methodRow: { flexDirection: 'row', gap: 10 },
    methodChip: {
      flex: 1, height: 44, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    methodChipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySurface },
    methodChipText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14, color: theme.colors.text },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    closeBtn: {
      width: 32, height: 32, borderRadius: 11, backgroundColor: theme.colors.surfaceSecondary,
      alignItems: 'center', justifyContent: 'center',
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
      fontFamily: 'InstrumentSans-Bold',
      fontSize: 19,
      letterSpacing: -0.3,
      color: theme.colors.text,
    },
    subtitle: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 13.5,
      lineHeight: 19,
      color: theme.colors.textTertiary,
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
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    heroAmountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
    },
    heroAmount: {
      fontFamily: 'BricolageGrotesque-SemiBold',
      fontSize: 36,
      fontVariant: ['tabular-nums'],
    },
    doneSubtext: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: 8,
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.borderLight,
      paddingVertical: 14,
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
    // memberColor() avatar palette is fixed pastel in both modes — ink text always.
    previewAvatarText: { color: inkOnPastel, fontFamily: 'InstrumentSans-Bold', fontSize: 16 },
    previewName: {
      fontFamily: 'InstrumentSans-SemiBold',
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
      fontFamily: 'InstrumentSans-Bold',
      fontSize: 32,
      color: theme.colors.text,
      marginRight: 4,
    },
    amountInput: {
      fontFamily: 'InstrumentSans-Bold',
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
      flex: 1,
      minWidth: 90,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    paymentButtonText: {
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 14,
      color: theme.colors.text,
    },
  });
