import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { AppTheme } from '../../../core/theme/theme';
import TypeaheadInput from '../../../core/ui/TypeaheadInput';
import { suggestItems } from '../api/entityResolution';
import { useEntityResolutionEnabled } from '../hooks/useEntityResolutionEnabled';
import { formatCurrency } from '../../expenses/utils/currencyMath';
import { ReceiptLine, ReceiptReviewLine, lineDiscount, receiptTotals } from '../utils/receiptLines';
import { TWO_DECIMALS, withDecimalDot } from '../../groups/utils/splitAmounts';

/** A receipt line being reviewed: `line_total` is the paid price (TS-FIX-102). */
export interface ScannedItem extends ReceiptLine {
  /** Per-item subcategory from the parser (e.g. paper towels on a grocery receipt). */
  category_name?: string;
}

interface ScannedItemsCardProps {
  theme: AppTheme;
  items: ScannedItem[];
  onChange: (items: ScannedItem[]) => void;
  merchant?: string | null;
  tax?: number;
  tip?: number;
  /** The expense amount. Paid prices + tax + tip must match it within 0.02; the caller blocks
   * Save until they do, and the footer says by how much (same as web). */
  currentAmount: number;
  /** Returns/refunds the scanner left out of the items, for the person to account for. */
  review?: ReceiptReviewLine[];
  /** Saved in the old discount format; prices were adjusted for checking. */
  legacyFormat?: boolean;
}

function fmt(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}${formatCurrency(Math.abs(n))}`;
}

/**
 * The price text to keep, or null to ignore the edit. Minus signs and symbols are dropped (TS-FIX-101/102); a comma is
 * the decimal mark, never removed ("15,00" became 1500); anything with two marks or three decimals is ignored.
 */
function priceText(typed: string): string | null {
  const text = withDecimalDot(typed.replace(/[^0-9.,]/g, ''));
  return TWO_DECIMALS.test(text) ? text : null;
}

/**
 * Price field for one scanned item. Not a plain controlled TextInput bound to
 * `item.line_total` — coercing the text to a Number() on every keystroke drops a trailing
 * "." the instant it's typed (Number("5.") === 5, redisplayed as "5"), so typing "5.98"
 * collapses to "598" one keystroke later (hit this exact bug building the web equivalent,
 * varavu_selavu_ui/src/components/expenses/ScannedItemsCard.tsx). Keeping a local draft
 * string while focused lets the user type a decimal normally.
 */
const ItemPriceInput: React.FC<{
  theme: AppTheme; style: any; value: number | null; onCommit: (n: number | null) => void; label: string; allowEmpty?: boolean;
}> = ({ theme, style, value, onCommit, label, allowEmpty = false }) => {
  const [text, setText] = useState(value == null ? '' : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value == null ? '' : String(value));
  }, [value]);

  return (
    <TextInput
      style={style}
      value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        if (allowEmpty && text.trim() === '') { onCommit(null); return; }
        const n = Number(text) || 0;
        setText(String(n));
        onCommit(n);
      }}
      onChangeText={(t) => {
        const cleaned = priceText(t);
        if (cleaned === null) return;
        setText(cleaned);
        const n = Number(cleaned);
        if (cleaned === '' && allowEmpty) onCommit(null);
        else if (cleaned !== '' && !Number.isNaN(n)) onCommit(n);
      }}
      accessibilityLabel={label}
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
  tip = 0,
  currentAmount,
  review = [],
  legacyFormat = false,
}) => {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [expanded, setExpanded] = useState(true);
  const { enabled: entityResolutionEnabled } = useEntityResolutionEnabled();
  const fetchItemSuggestions = useCallback(
    (q: string) => (entityResolutionEnabled ? suggestItems(q) : Promise.resolve([])),
    [entityResolutionEnabled]
  );

  const { subtotal, computed: computedTotal, delta, savings, reconciled } = receiptTotals(items, tax, tip, currentAmount);
  const [originalOpen, setOriginalOpen] = useState<Record<number, boolean>>({});

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
            {items.map((item) => {
              const saved = lineDiscount(item);
              const showOriginal = originalOpen[item.line_no] ?? saved > 0;
              const name = item.item_name || 'item';
              return (
              <View key={item.line_no}>
              <View style={styles.itemRow}>
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
                    label={`Price paid for ${name}`}
                    onCommit={(n) => updateItem(item.line_no, { line_total: n ?? 0 })}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setOriginalOpen((o) => ({ ...o, [item.line_no]: !showOriginal }))}
                  style={styles.iconTarget}
                  accessibilityRole="button"
                  accessibilityLabel={showOriginal ? `Hide original price for ${name}` : `Add original price for ${name}`}
                  accessibilityState={{ expanded: showOriginal }}
                >
                  <Text style={[styles.removeX, saved > 0 && { color: theme.colors.success }]}>%</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removeItem(item.line_no)}
                  style={styles.iconTarget}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${name}`}
                >
                  <Text style={styles.removeX}>✕</Text>
                </TouchableOpacity>
              </View>
              {showOriginal && (
                <View style={styles.originalRow}>
                  <Text style={styles.summaryLabel}>Original price $</Text>
                  <ItemPriceInput
                    theme={theme}
                    style={styles.itemPriceInput}
                    value={item.original_price ?? null}
                    allowEmpty
                    label={`Original price for ${name}`}
                    onCommit={(n) => updateItem(item.line_no, { original_price: n, discount: n == null ? 0 : Math.max(0, n - item.line_total) })}
                  />
                  {saved > 0 && <Text style={[styles.summaryLabel, { color: theme.colors.success }]}>saved {fmt(saved)}</Text>}
                </View>
              )}
              </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.addItemRow} onPress={addItem} activeOpacity={0.7}>
            <Text style={styles.addItemText}>+ Add item</Text>
          </TouchableOpacity>

          {(tax > 0 || tip > 0 || savings > 0) && (
            <View style={styles.summaryBlock}>
              {tax > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Tax</Text>
                  <Text style={styles.summaryValue}>{fmt(tax)}</Text>
                </View>
              )}
              {tip > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Tip</Text>
                  <Text style={styles.summaryValue}>{fmt(tip)}</Text>
                </View>
              )}
              {savings > 0 && (
                <View style={styles.summaryRow}>
                  {/* Already included in the prices above: a record, not subtracted again. */}
                  <Text style={styles.summaryLabel}>You saved (already in prices)</Text>
                  <Text style={[styles.summaryValue, { color: theme.colors.success }]}>{fmt(savings)}</Text>
                </View>
              )}
            </View>
          )}

          {review.length > 0 && (
            <View style={styles.reviewBlock}>
              <Text style={[styles.summaryLabel, { fontFamily: 'InstrumentSans-SemiBold', color: theme.colors.text }]}>Not included: returns or refunds</Text>
              {review.map((r, i) => (
                <View key={i} style={styles.summaryRow}>
                  <Text style={styles.summaryLabel} numberOfLines={1}>{r.item_name}</Text>
                  <Text style={styles.summaryValue}>{fmt(r.amount)}</Text>
                </View>
              ))}
              <Text style={styles.summaryLabel}>Adjust the prices or the total so they match.</Text>
            </View>
          )}

          {legacyFormat && (
            <Text style={[styles.reconcileText, { color: theme.colors.warning, textAlign: 'left' }]}>
              Prices were adjusted for discounts. Check them before saving.
            </Text>
          )}

          <Text
            accessibilityRole={reconciled ? undefined : 'alert'}
            accessibilityLiveRegion="polite"
            style={[styles.reconcileText, { color: reconciled ? theme.colors.success : theme.colors.warning }]}>
            {reconciled
                ? 'Matches total'
                : `Items${tax > 0 || tip > 0 ? ' plus tax and tip' : ''} come to ${fmt(computedTotal)}, ${fmt(Math.abs(delta))} ${delta > 0 ? 'more' : 'less'} than the total. Make them match to save.`}
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
    headerText: { flex: 1, fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.text },
    headerAmount: {
      fontFamily: 'BricolageGrotesque-SemiBold',
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
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 13,
      color: theme.colors.text,
      paddingVertical: 2,
    },
    priceWrap: { flexDirection: 'row', alignItems: 'center' },
    dollarSign: { fontFamily: 'InstrumentSans-Regular', fontSize: 13, color: theme.colors.textSecondary, marginRight: 1 },
    itemPriceInput: {
      width: 56,
      textAlign: 'right',
      fontFamily: 'BricolageGrotesque-SemiBold',
      fontSize: 13,
      color: theme.colors.text,
      fontVariant: ['tabular-nums'],
      paddingVertical: 2,
    },
    removeX: { color: theme.colors.textTertiary, fontSize: 13, paddingHorizontal: 4 },
    // 44pt touch target (varavu_selavu_mobile/AGENTS.md) without making each row taller than its input.
    iconTarget: { minWidth: 32, minHeight: 44, marginVertical: -8, alignItems: 'center', justifyContent: 'center' },

    addItemRow: { paddingVertical: 6 },
    addItemText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.primary },

    summaryBlock: { marginTop: 4, gap: 2 },
    originalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingBottom: 4, paddingRight: 40 },
    reviewBlock: { marginTop: 6, padding: 8, borderRadius: 8, gap: 2, backgroundColor: theme.colors.surfaceSecondary },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
    summaryLabel: { fontFamily: 'InstrumentSans-Regular', fontSize: 11.5, color: theme.colors.textSecondary },
    summaryValue: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 11.5,
      color: theme.colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },

    reconcileText: { marginTop: 6, textAlign: 'right', fontFamily: 'InstrumentSans-Regular', fontSize: 11.5 },
  });

export default ScannedItemsCard;
