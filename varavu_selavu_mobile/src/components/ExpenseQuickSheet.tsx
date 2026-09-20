/**
 * ExpenseQuickSheet.tsx — V2 "Expense detail" (Flows 4.2) for a personal expense. Replaces the old
 * Alert action list: a bottom sheet with the tile/title/amount header, an "above your usual" note
 * when there's history to compare against, key/value rows, and Edit / View items / Move / Delete.
 * (Group expenses keep ExpenseDetailSheet — comments, history and settle-my-share live there.)
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, withAlpha } from '../theme';
import { ExpenseRecord } from '../api/expenses';
import { categoryCode, categoryTone } from '../utils/categoryCode';
import { anomalyNote, shortDate } from '../utils/expenseInsights';
import { formatCurrency } from '../utils/currencyMath';
import Sheet from './Sheet';

interface Props {
  expense: ExpenseRecord | null;
  /** Everything currently loaded — the baseline for the anomaly note. */
  allExpenses: ExpenseRecord[];
  onClose: () => void;
  onEdit: (e: ExpenseRecord) => void;
  onViewItems: (e: ExpenseRecord) => void;
  /** Omit when groups are disabled. */
  onMove?: (e: ExpenseRecord) => void;
  onDelete: (e: ExpenseRecord) => void;
}

export default function ExpenseQuickSheet({ expense, allExpenses, onClose, onEdit, onViewItems, onMove, onDelete }: Props) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const anomaly = useMemo(() => (expense ? anomalyNote(expense, allExpenses) : null), [expense, allExpenses]);
  if (!expense) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const tone = categoryTone(expense.category);
  const isItemized = expense.split_type === 'itemized' || (expense.item_count || 0) > 1;
  const metaParts = [shortDate(expense.date), expense.category, expense.card?.card_name].filter(Boolean);
  const rows: { k: string; v: string }[] = [
    ...(expense.merchant_name ? [{ k: 'Merchant', v: expense.merchant_name }] : []),
    { k: 'Split', v: 'Just me' },
    ...((expense.tags || []).length > 0 ? [{ k: 'Tags', v: expense.tags!.map((t) => t.name).join(', ') }] : []),
    ...(isItemized ? [{ k: 'Receipt', v: `${expense.item_count ?? 'Multiple'} items read` }] : []),
  ];

  return (
    <Sheet visible onClose={onClose}>
      <View style={styles.head}>
        <View style={[styles.tile, { backgroundColor: withAlpha(tone, 0.16) }]}>
          <Text style={[styles.code, { color: tone }]}>{categoryCode(expense.category)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>{expense.description}</Text>
          <Text style={styles.meta} numberOfLines={1}>{metaParts.join(' · ')}</Text>
        </View>
        <Text style={styles.amount}>{formatCurrency(expense.cost)}</Text>
      </View>

      {anomaly && (
        <View style={styles.note}>
          <Text style={styles.noteText}>{anomaly.text}</Text>
        </View>
      )}

      <View>
        {rows.map((r, i) => (
          <View key={r.k} style={[styles.kv, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={styles.k}>{r.k}</Text>
            <Text style={styles.v} numberOfLines={1}>{r.v}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} activeOpacity={0.7} onPress={() => { onClose(); onEdit(expense); }}>
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>
        {isItemized && (
          <TouchableOpacity style={styles.action} activeOpacity={0.7} onPress={() => { onClose(); onViewItems(expense); }}>
            <Text style={styles.actionText}>View items</Text>
          </TouchableOpacity>
        )}
        {onMove && (
          <TouchableOpacity style={styles.action} activeOpacity={0.7} onPress={() => { onClose(); onMove(expense); }}>
            <Text style={styles.actionText}>Move</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.delete}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Delete expense"
          onPress={() => { onClose(); onDelete(expense); }}
        >
          <Ionicons name="trash-outline" size={19} color={theme.colors.error} />
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  tile: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  code: { fontFamily: theme.typography.fontFamily.mono, fontSize: 13 },
  title: { fontFamily: theme.typography.fontFamily.bold, fontSize: 19, color: theme.colors.text, letterSpacing: -0.3 },
  meta: { fontFamily: theme.typography.fontFamily.regular, fontSize: 13, color: theme.colors.textTertiary, marginTop: 3 },
  amount: { fontFamily: theme.typography.fontFamily.display, fontSize: 26, color: theme.colors.text, fontVariant: ['tabular-nums'] },
  note: {
    borderWidth: 1, borderColor: withAlpha(theme.colors.warning, 0.28), backgroundColor: withAlpha(theme.colors.warning, 0.08),
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  noteText: { fontFamily: theme.typography.fontFamily.regular, fontSize: 13.5, lineHeight: 19, color: theme.colors.warning },
  kv: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
  },
  k: { flex: 1, fontFamily: theme.typography.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary },
  v: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 14, color: theme.colors.text, maxWidth: '65%' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  action: {
    flex: 1, height: 48, borderRadius: 15, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  actionText: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 15, color: theme.colors.text },
  delete: {
    width: 48, height: 48, borderRadius: 15, borderWidth: 1, borderColor: withAlpha(theme.colors.error, 0.3),
    backgroundColor: withAlpha(theme.colors.error, 0.08), alignItems: 'center', justifyContent: 'center',
  },
});
