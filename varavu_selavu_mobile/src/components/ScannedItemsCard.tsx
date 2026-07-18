import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { AppTheme } from '../theme';
import TypeaheadInput from './TypeaheadInput';
import { suggestItems } from '../api/entityResolution';
import { useEntityResolutionEnabled } from '../hooks/useEntityResolutionEnabled';

export interface ScannedItem {
  line_no: number;
  item_name: string;
  line_total: number;
  quantity?: number | null;
  unit_price?: number | null;
  normalized_name?: string;
}

interface ScannedItemsCardProps {
  theme: AppTheme;
  items: ScannedItem[];
  onChange: (items: ScannedItem[]) => void;
  merchant?: string | null;
  tax?: number;
  discount?: number;
  /** AddExpenseScreen's editable top amount — used only to flag drift in the footer caption,
   * never to block saving (mirrors the web app's ScannedItemsCard for the same reason: a
   * receipt total the user tweaks by a few cents shouldn't stop them from logging it). */
  currentAmount: number;
}

function fmt(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/**
 * Price field for one scanned item. Not a plain controlled TextInput bound to
 * `item.line_total` — coercing the text to a Number() on every keystroke drops a trailing
 * "." the instant it's typed (Number("5.") === 5, redisplayed as "5"), so typing "5.98"
 * collapses to "598" one keystroke later (hit this exact bug building the web equivalent,
 * varavu_selavu_ui/src/components/expenses/ScannedItemsCard.tsx). Keeping a local draft
 * string while focused lets the user type a decimal normally.
 */
const ItemPriceInput: React.FC<{ theme: AppTheme; style: any; value: number; onCommit: (n: number) => void }> = ({
  theme,
  style,
  value,
  onCommit,
}) => {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  return (
    <TextInput
      style={style}
      value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        const n = Number(text.replace(/[^0-9.-]/g, '')) || 0;
        setText(String(n));
        onCommit(n);
      }}
      onChangeText={(t) => {
        const cleaned = t.replace(/[^0-9.-]/g, '');
        setText(cleaned);
        const n = Number(cleaned);
        if (cleaned !== '' && cleaned !== '-' && !Number.isNaN(n)) onCommit(n);
      }}
      keyboardType="decimal-pad"
      placeholder="0.00"
      placeholderTextColor={theme.colors.textQuaternary}
    />
  );
};

/**
 * Review surface for a scanned receipt's line items — mobile port of the web app's
 * ScannedItemsCard (same reconciliation/edit model), styled to match AddExpenseScreen's
 * existing pill/row conventions instead of MUI.
 */
const ScannedItemsCard: React.FC<ScannedItemsCardProps> = ({
  theme,
  items,
  onChange,
  merchant,
  tax = 0,
  discount = 0,
  currentAmount,
}) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [expanded, setExpanded] = useState(true);
  const { enabled: entityResolutionEnabled } = useEntityResolutionEnabled();
  const fetchItemSuggestions = useCallback(
    (q: string) => (entityResolutionEnabled ? suggestItems(q) : Promise.resolve([])),
    [entityResolutionEnabled]
  );

  const subtotal = items.reduce((s, it) => s + (Number(it.line_total) || 0), 0);
  const computedTotal = subtotal + tax - discount;
  const delta = computedTotal - currentAmount;
  const reconciled = Math.abs(delta) <= 0.02;

  const updateItem = (lineNo: number, patch: Partial<ScannedItem>) => {
    onChange(items.map((it) => (it.line_no === lineNo ? { ...it, ...patch } : it)));
  };

  const removeItem = (lineNo: number) => {
    onChange(items.filter((it) => it.line_no !== lineNo));
  };

  const addItem = () => {
    const nextLineNo = items.reduce((max, it) => Math.max(max, it.line_no), 0) + 1;
    onChange([...items, { line_no: nextLineNo, item_name: '', line_total: 0 }]);
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded((e) => !e)} activeOpacity={0.7}>
        <Text style={styles.headerIcon}>🧾</Text>
        <Text style={styles.headerText} numberOfLines={1}>
          {items.length} item{items.length === 1 ? '' : 's'} scanned{merchant ? ` · ${merchant}` : ''}
        </Text>
        <Text style={styles.headerAmount}>{fmt(subtotal)}</Text>
        <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          <ScrollView style={styles.itemsScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {items.map((item) => (
              <View key={item.line_no} style={styles.itemRow}>
                <TypeaheadInput
                  theme={theme}
                  value={item.item_name}
                  onChangeValue={(t) => updateItem(item.line_no, { item_name: t })}
                  fetchSuggestions={fetchItemSuggestions}
                  placeholder="Item name"
                  containerStyle={styles.itemNameInputWrap}
                  inputStyle={styles.itemNameInput}
                />
                <View style={styles.priceWrap}>
                  <Text style={styles.dollarSign}>$</Text>
                  <ItemPriceInput
                    theme={theme}
                    style={styles.itemPriceInput}
                    value={item.line_total}
                    onCommit={(n) => updateItem(item.line_no, { line_total: n })}
                  />
                </View>
                <TouchableOpacity onPress={() => removeItem(item.line_no)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.removeX}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.addItemRow} onPress={addItem} activeOpacity={0.7}>
            <Text style={styles.addItemText}>+ Add item</Text>
          </TouchableOpacity>

          {(tax > 0 || discount > 0) && (
            <View style={styles.summaryBlock}>
              {tax > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Tax</Text>
                  <Text style={styles.summaryValue}>{fmt(tax)}</Text>
                </View>
              )}
              {discount > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Discount</Text>
                  <Text style={styles.summaryValue}>-{fmt(discount)}</Text>
                </View>
              )}
            </View>
          )}

          <Text style={[styles.reconcileText, { color: reconciled ? theme.colors.success : theme.colors.warning }]}>
            {reconciled ? 'Matches total' : `Items total ${fmt(computedTotal)} — off by ${fmt(Math.abs(delta))}`}
          </Text>
        </View>
      )}
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: theme.colors.borderLight,
      borderRadius: 10,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.colors.surfaceSecondary,
    },
    headerIcon: { fontSize: 14 },
    headerText: { flex: 1, fontFamily: 'Inter-SemiBold', fontSize: 12.5, color: theme.colors.text },
    headerAmount: {
      fontFamily: 'SpaceGrotesk-SemiBold',
      fontSize: 13,
      color: theme.colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    chevron: { color: theme.colors.textSecondary, fontSize: 12, marginLeft: 2 },

    body: { paddingHorizontal: 12, paddingVertical: 10 },
    itemsScroll: { maxHeight: 170 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
    itemNameInputWrap: { flex: 1 },
    itemNameInput: {
      fontFamily: 'Inter-Regular',
      fontSize: 13,
      color: theme.colors.text,
      paddingVertical: 2,
    },
    priceWrap: { flexDirection: 'row', alignItems: 'center' },
    dollarSign: { fontFamily: 'Inter-Regular', fontSize: 13, color: theme.colors.textSecondary, marginRight: 1 },
    itemPriceInput: {
      width: 56,
      textAlign: 'right',
      fontFamily: 'SpaceGrotesk-SemiBold',
      fontSize: 13,
      color: theme.colors.text,
      fontVariant: ['tabular-nums'],
      paddingVertical: 2,
    },
    removeX: { color: theme.colors.textTertiary, fontSize: 13, paddingHorizontal: 4 },

    addItemRow: { paddingVertical: 6 },
    addItemText: { fontFamily: 'Inter-SemiBold', fontSize: 12.5, color: theme.colors.primary },

    summaryBlock: { marginTop: 4, gap: 2 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
    summaryLabel: { fontFamily: 'Inter-Regular', fontSize: 11.5, color: theme.colors.textSecondary },
    summaryValue: {
      fontFamily: 'Inter-Regular',
      fontSize: 11.5,
      color: theme.colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },

    reconcileText: { marginTop: 6, textAlign: 'right', fontFamily: 'Inter-Regular', fontSize: 11.5 },
  });

export default ScannedItemsCard;
