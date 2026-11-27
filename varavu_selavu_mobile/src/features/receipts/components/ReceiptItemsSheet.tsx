/**
 * ReceiptItemsSheet.tsx — the V2 "Items" review after a receipt scan: what was read (paid prices,
 * with any saving), the tax and tip, your share and Save. Lines are for tracking only (TS-FIX-102):
 * a group receipt is split on its total (Equal, Exact or Shares) in the split sheet, never item by
 * item. There's no confidence figure — the receipt parser doesn't return one, so none is shown.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../core/theme/ThemeContext';
import { AppTheme } from '../../../core/theme/theme';
import Sheet from '../../../core/ui/Sheet';
import CustomButton from '../../../core/ui/CustomButton';
import { ScannedItem } from './ScannedItemsCard';
import { formatCurrency } from '../../expenses/utils/currencyMath';
import { lineDiscount, receiptTotals } from '../utils/receiptLines';

interface Props {
  visible: boolean;
  onClose: () => void;
  merchant: string;
  items: ScannedItem[];
  tax: number;
  tip: number;
  /** The expense amount; Save stays off until paid prices + tax + tip match it. */
  amount: number;
  /** True for a group receipt: the footer shows the caller's share of the split total. */
  grouped: boolean;
  /** e.g. "Split equally among 3" — how the total is divided (set in the split sheet). */
  splitLabel?: string;
  yourShare: number;
  saving: boolean;
  canSave: boolean;
  onSave: () => void;
  /** Close and edit names/prices in the capture sheet. */
  onEditItems: () => void;
}

const money = (n: number) => `${formatCurrency(Math.abs(n))}`;

function qtyLine(it: ScannedItem): string {
  if (it.quantity != null && it.unit_price != null) return `${it.quantity} × ${money(it.unit_price)}`;
  if (it.quantity != null) return `${it.quantity} ×`;
  return '';
}

export default function ReceiptItemsSheet({
  visible, onClose, merchant, items, tax, tip, amount, grouped, splitLabel, yourShare, saving, canSave, onSave, onEditItems,
}: Props) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const n = items.length;
  const totals = receiptTotals(items, tax, tip, amount);

  return (
    <Sheet visible={visible} onClose={onClose} tall>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{merchant || 'Receipt'}</Text>
          <Text style={styles.eyebrow}>{n} ITEM{n === 1 ? '' : 'S'} READ</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.help}>
        {grouped && splitLabel ? `${splitLabel}. ` : ''}Check what was read before saving.{' '}
        <Text style={styles.link} onPress={onEditItems} accessibilityRole="button">Edit items</Text>
      </Text>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {items.map((it) => {
          const saved = lineDiscount(it);
          return (
            <View key={it.line_no} style={styles.rowWrap}>
              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{it.item_name}</Text>
                  {!!qtyLine(it) && <Text style={styles.qty}>{qtyLine(it)}</Text>}
                  {saved > 0 && <Text style={styles.saved}>Saved {money(saved)}</Text>}
                </View>
                <Text style={styles.amount}>{money(it.line_total)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.foot}>
        {tax > 0 && (
          <View style={styles.footRow}>
            <Text style={styles.footLabel}>Tax</Text>
            <Text style={styles.footLabel}>{money(tax)}</Text>
          </View>
        )}
        {tip > 0 && (
          <View style={styles.footRow}>
            <Text style={styles.footLabel}>Tip</Text>
            <Text style={styles.footLabel}>{money(tip)}</Text>
          </View>
        )}
        {totals.savings > 0 && (
          <View style={styles.footRow}>
            <Text style={styles.footLabel}>You saved (already in prices)</Text>
            <Text style={styles.footLabel}>{money(totals.savings)}</Text>
          </View>
        )}
        {!totals.reconciled && (
          <Text style={styles.mismatch} accessibilityLiveRegion="polite">
            Items{tax > 0 || tip > 0 ? ' plus tax and tip' : ''} come to {money(totals.computed)}, not {money(amount)}. Make them match to save.
          </Text>
        )}
        <View style={styles.footRow}>
          <Text style={styles.share}>{grouped ? 'Your share' : 'Total'}</Text>
          <Text style={styles.share}>{money(yourShare)}</Text>
        </View>
        <CustomButton title={saving ? 'Saving…' : `Save ${n} item${n === 1 ? '' : 's'}`} onPress={onSave} disabled={!canSave || saving || !totals.reconciled} />
      </View>
    </Sheet>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: theme.typography.fontFamily.bold, fontSize: 19, letterSpacing: -0.3, color: theme.colors.text },
  eyebrow: { fontFamily: theme.typography.fontFamily.mono, fontSize: 10, letterSpacing: 1.4, color: theme.colors.secondary, marginTop: 4 },
  close: { width: 32, height: 32, borderRadius: 11, backgroundColor: theme.colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  help: { fontFamily: theme.typography.fontFamily.regular, fontSize: 13, lineHeight: 19, color: theme.colors.textTertiary, marginTop: 10, marginBottom: 6 },
  link: { fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.primary },
  rowWrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 },
  name: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 14.5, color: theme.colors.text },
  qty: { fontFamily: theme.typography.fontFamily.regular, fontSize: 11.5, color: theme.colors.textTertiary, marginTop: 2 },
  amount: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 14.5, color: theme.colors.text, width: 62, textAlign: 'right', fontVariant: ['tabular-nums'] },
  saved: { fontFamily: theme.typography.fontFamily.regular, fontSize: 11.5, color: theme.colors.success, marginTop: 2 },
  mismatch: { fontFamily: theme.typography.fontFamily.regular, fontSize: 13, color: theme.colors.warning },
  foot: { gap: 10, paddingTop: 12 },
  footRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footLabel: { fontFamily: theme.typography.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary, fontVariant: ['tabular-nums'] },
  share: { fontFamily: theme.typography.fontFamily.bold, fontSize: 17, color: theme.colors.text, fontVariant: ['tabular-nums'] },
});
