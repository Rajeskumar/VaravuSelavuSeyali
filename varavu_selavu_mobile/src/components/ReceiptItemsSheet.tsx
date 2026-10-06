/**
 * ReceiptItemsSheet.tsx — the V2 "Items" review after a receipt scan: what was read, who each line
 * belongs to (group expenses only), the tax + tip, your share, and Save. Lines with nobody
 * assigned are split equally among the participants. There's no confidence figure — the receipt
 * parser doesn't return one, so none is shown rather than invented.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, inkOnPastel } from '../theme';
import Sheet from './Sheet';
import CustomButton from './CustomButton';
import { memberColor, initialsFromName } from './BalanceRow';
import { ScannedItem } from './ScannedItemsCard';
import { Assignments, effectiveAssignees } from '../utils/receiptSplit';
import { formatCurrency } from '../utils/currencyMath';

export interface ItemsSheetPerson { id: string; name: string }

interface Props {
  visible: boolean;
  onClose: () => void;
  merchant: string;
  items: ScannedItem[];
  /** Group participants; empty for a personal expense (no assignment UI). */
  people: ItemsSheetPerson[];
  assignments: Assignments;
  onToggle: (lineNo: number, personId: string) => void;
  /** tax − discount. */
  extras: number;
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
  visible, onClose, merchant, items, people, assignments, onToggle, extras, yourShare, saving, canSave, onSave, onEditItems,
}: Props) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [openLine, setOpenLine] = useState<number | null>(null);
  const grouped = people.length > 0;
  const personIds = useMemo(() => people.map((p) => p.id), [people]);
  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const n = items.length;

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
        {grouped ? 'Tap an item to assign it to people. Unassigned items split equally.' : 'Check what was read before saving.'}{' '}
        <Text style={styles.link} onPress={onEditItems} accessibilityRole="button">Edit items</Text>
      </Text>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {items.map((it) => {
          const assigned = effectiveAssignees(assignments[it.line_no], personIds);
          const explicit = (assignments[it.line_no] ?? []).filter((id) => byId[id]);
          const open = grouped && openLine === it.line_no;
          return (
            <View key={it.line_no} style={styles.rowWrap}>
              <TouchableOpacity
                style={styles.row}
                activeOpacity={grouped ? 0.6 : 1}
                onPress={() => grouped && setOpenLine(open ? null : it.line_no)}
                accessibilityRole={grouped ? 'button' : undefined}
                accessibilityState={grouped ? { expanded: open } : undefined}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={1}>{it.item_name}</Text>
                  {!!qtyLine(it) && <Text style={styles.qty}>{qtyLine(it)}</Text>}
                </View>
                {grouped && explicit.length > 0 && (
                  <View style={styles.stack}>
                    {explicit.map((id) => (
                      <View key={id} style={[styles.miniAvatar, { backgroundColor: memberColor(id) }]}>
                        <Text style={styles.miniAvatarText}>{initialsFromName(byId[id].name)}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={styles.amount}>{money(it.line_total)}</Text>
              </TouchableOpacity>
              {open && (
                <View style={styles.chips}>
                  {people.map((p) => {
                    const on = explicit.includes(p.id);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => onToggle(it.line_no, p.id)}
                        style={[styles.chip, on && { borderColor: memberColor(p.id), backgroundColor: 'rgba(255,255,255,0.05)' }]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                      >
                        <View style={[styles.miniAvatar, { backgroundColor: memberColor(p.id) }]}>
                          <Text style={styles.miniAvatarText}>{initialsFromName(p.name)}</Text>
                        </View>
                        <Text style={[styles.chipText, on && { color: theme.colors.text }]} numberOfLines={1}>{p.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {explicit.length === 0 && (
                    <Text style={styles.everyone}>Everyone ({assigned.length})</Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.foot}>
        {extras !== 0 && (
          <View style={styles.footRow}>
            <Text style={styles.footLabel}>{grouped ? 'Tax + tip, split by share' : 'Tax & fees'}</Text>
            <Text style={styles.footLabel}>{extras < 0 ? '−' : ''}{money(extras)}</Text>
          </View>
        )}
        <View style={styles.footRow}>
          <Text style={styles.share}>{grouped ? 'Your share' : 'Total'}</Text>
          <Text style={styles.share}>{money(yourShare)}</Text>
        </View>
        <CustomButton title={saving ? 'Saving…' : `Save ${n} item${n === 1 ? '' : 's'}`} onPress={onSave} disabled={!canSave || saving} />
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
  stack: { flexDirection: 'row', paddingRight: 6 },
  miniAvatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: -6, borderWidth: 1.5, borderColor: theme.colors.surfaceElevated },
  miniAvatarText: { fontFamily: theme.typography.fontFamily.bold, fontSize: 10, color: inkOnPastel },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 34, paddingLeft: 5, paddingRight: 12,
    borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border,
  },
  chipText: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 13, color: theme.colors.textSecondary, maxWidth: 110 },
  everyone: { fontFamily: theme.typography.fontFamily.regular, fontSize: 12, color: theme.colors.textTertiary, alignSelf: 'center' },
  foot: { gap: 10, paddingTop: 12 },
  footRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footLabel: { fontFamily: theme.typography.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary, fontVariant: ['tabular-nums'] },
  share: { fontFamily: theme.typography.fontFamily.bold, fontSize: 17, color: theme.colors.text, fontVariant: ['tabular-nums'] },
});
