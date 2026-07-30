import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getExpenseItems, ExpenseItemDTO, ExpenseRecord } from '../api/expenses';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { formatCurrency } from '../utils/currencyMath';

interface Props {
  visible: boolean;
  expense: ExpenseRecord | null;
  onClose: () => void;
}

/**
 * Read-only line-item breakdown for a saved, receipt-scanned personal expense — the
 * counterpart to the group flow's `ExpenseDetailSheet` items section, which had no personal
 * equivalent (the only place items rendered was inside the editable `ScannedItemsCard`, one
 * tap deeper in the Edit flow).
 */
export default function ExpenseItemsViewSheet({ visible, expense, onClose }: Props) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [items, setItems] = useState<ExpenseItemDTO[]>([]);
  const [tax, setTax] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !expense) return;
    setItems([]);
    setTax(0);
    setDiscount(0);
    setLoading(true);
    getExpenseItems(expense.row_id)
      .then((res) => {
        setItems(res.items);
        setTax(res.tax);
        setDiscount(res.discount);
      })
      .catch(() => { /* leaves items empty — shown as "no itemized details" below */ })
      .finally(() => setLoading(false));
  }, [visible, expense?.row_id]);

  if (!expense) return null;

  const subtotal = items.reduce((s, it) => s + (Number(it.line_total) || 0), 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.pill} />
          <View style={styles.header}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>{expense.description}</Text>
              <Text style={styles.headerMeta} numberOfLines={1}>
                {expense.merchant_name ? `${expense.merchant_name} · ` : ''}{expense.date}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {loading ? (
              <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 24 }} />
            ) : items.length === 0 ? (
              <Text style={styles.emptyText}>No itemized details for this expense.</Text>
            ) : (
              <>
                {items.map((it) => (
                  <View key={it.id ?? it.line_no} style={styles.itemRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.itemName} numberOfLines={2}>{it.item_name}</Text>
                      {!!it.quantity && it.quantity !== 1 && (
                        <Text style={styles.itemQty}>
                          {it.quantity}{it.unit ? ` ${it.unit}` : ''} × {formatCurrency(it.unit_price || 0)}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.itemTotal}>{formatCurrency(it.line_total)}</Text>
                  </View>
                ))}

                <View style={styles.divider} />

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
                </View>
                {tax > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Tax</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(tax)}</Text>
                  </View>
                )}
                {discount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Discount</Text>
                    <Text style={styles.summaryValue}>-{formatCurrency(discount)}</Text>
                  </View>
                )}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryTotalLabel}>Total</Text>
                  <Text style={styles.summaryTotalValue}>{formatCurrency(expense.cost)}</Text>
                </View>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    maxHeight: '80%',
    flexShrink: 1,
    ...theme.shadows.lg,
  },
  pill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderLight,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: 17,
    color: theme.colors.text,
  },
  headerMeta: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  // Not `flex: 1` — see the equivalent comment in EditGroupExpenseModal.tsx. `sheet` only has a
  // maxHeight cap, not a definite height, so a flexBasis:0 flexGrow:1 child collapses to 0.
  scroll: {
    flexShrink: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  emptyText: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginVertical: 24,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  itemName: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: 14,
    color: theme.colors.text,
  },
  itemQty: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  itemTotal: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 14,
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  summaryValue: {
    fontFamily: theme.typography.fontFamily.medium,
    fontSize: 13,
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  summaryTotalLabel: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 15,
    color: theme.colors.text,
    marginTop: 4,
  },
  summaryTotalValue: {
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: 15,
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
});
