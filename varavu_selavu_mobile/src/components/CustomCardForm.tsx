/**
 * CustomCardForm.tsx — TS-CARD-112 mobile parity for web's CustomCardForm.tsx. Categories are
 * restricted to the app's real taxonomy (CategoryPickerField, same component every expense form
 * uses) plus the "All Purchases" flat-rate sentinel — never free text.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import CategoryPickerField from './CategoryPickerField';
import { findMainCategory } from '../constants/categories';
import { createCustomCard } from '../api/cards';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';

const ALL_PURCHASES = 'All Purchases';

interface RuleRow {
  categoryId: string;
  multiplier: string;
}

interface Props {
  onDone: () => void;
  onCancel: () => void;
}

export default function CustomCardForm({ onDone, onCancel }: Props) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const qc = useQueryClient();

  const [cardName, setCardName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [annualFee, setAnnualFee] = useState('');
  const [rules, setRules] = useState<RuleRow[]>([{ categoryId: ALL_PURCHASES, multiplier: '1' }]);

  const hasFlatRate = rules.some((r) => r.categoryId === ALL_PURCHASES);

  const createMut = useMutation({
    mutationFn: () =>
      createCustomCard({
        card_name: cardName.trim(),
        issuer: issuer.trim() || undefined,
        annual_fee: annualFee ? parseFloat(annualFee) : 0,
        rules: rules
          .filter((r) => r.categoryId && parseFloat(r.multiplier) > 0)
          .map((r) => ({ category_id: r.categoryId, multiplier: parseFloat(r.multiplier) })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards-mine'] });
      qc.invalidateQueries({ queryKey: ['card-coach'] });
      onDone();
    },
  });

  const updateRule = (idx: number, patch: Partial<RuleRow>) =>
    setRules((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeRule = (idx: number) => setRules((rs) => rs.filter((_, i) => i !== idx));

  const canSave = cardName.trim().length > 0 && !createMut.isPending;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Add your own card</Text>

      <TextInput style={styles.input} placeholder="Card name" placeholderTextColor={theme.colors.textTertiary} value={cardName} onChangeText={setCardName} autoFocus />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Issuer (optional)" placeholderTextColor={theme.colors.textTertiary} value={issuer} onChangeText={setIssuer} />
        <TextInput style={[styles.input, { width: 100 }]} placeholder="$ Annual fee" placeholderTextColor={theme.colors.textTertiary} value={annualFee} onChangeText={setAnnualFee} keyboardType="decimal-pad" />
      </View>

      <Text style={styles.sectionLabel}>Cash back rates</Text>
      {rules.map((rule, idx) => (
        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {rule.categoryId === ALL_PURCHASES ? (
            <View style={[styles.input, { flex: 1, justifyContent: 'center' }]}>
              <Text style={{ fontFamily: 'InstrumentSans-SemiBold', fontSize: 14, color: theme.colors.text }}>All Purchases (flat rate)</Text>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <CategoryPickerField
                theme={theme}
                mainCategory={findMainCategory(rule.categoryId)}
                subcategory={rule.categoryId}
                onChange={(_main, sub) => updateRule(idx, { categoryId: sub })}
              />
            </View>
          )}
          <TextInput
            style={[styles.input, { width: 70, textAlign: 'center' }]}
            placeholder="%" placeholderTextColor={theme.colors.textTertiary}
            value={rule.multiplier} onChangeText={(v) => updateRule(idx, { multiplier: v })}
            keyboardType="decimal-pad"
          />
          <TouchableOpacity onPress={() => removeRule(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        </View>
      ))}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
        <TouchableOpacity onPress={() => setRules((rs) => [...rs, { categoryId: '', multiplier: '1' }])}>
          <Text style={styles.linkBtn}>+ Add category rate</Text>
        </TouchableOpacity>
        {!hasFlatRate && (
          <TouchableOpacity onPress={() => setRules((rs) => [...rs, { categoryId: ALL_PURCHASES, multiplier: '1' }])}>
            <Text style={styles.linkBtn}>+ Add flat rate</Text>
          </TouchableOpacity>
        )}
      </View>

      {createMut.isError && <Text style={styles.errorText}>Failed to save — try again.</Text>}

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
        <TouchableOpacity style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} disabled={!canSave} onPress={() => createMut.mutate()} activeOpacity={0.8}>
          {createMut.isPending ? <ActivityIndicator size="small" color={theme.colors.textInverse} /> : <Text style={styles.saveBtnText}>Save card</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} style={{ justifyContent: 'center' }}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {
      borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderLight,
      borderRadius: 14, padding: 14, marginTop: 12,
    },
    title: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14.5, color: theme.colors.text, marginBottom: 10 },
    sectionLabel: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 11.5, color: theme.colors.textSecondary, marginTop: 12, marginBottom: 8 },
    input: {
      backgroundColor: theme.colors.surfaceSecondary, borderRadius: 10, paddingHorizontal: 12,
      paddingVertical: 10, borderWidth: 1.5, borderColor: theme.colors.border,
      fontSize: 14, color: theme.colors.text, minHeight: 44,
    },
    linkBtn: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.primary },
    errorText: { fontFamily: 'InstrumentSans-Regular', fontSize: 12, color: theme.colors.error, marginTop: 8 },
    saveBtn: { backgroundColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, alignItems: 'center' },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13.5, color: theme.colors.textInverse },
    cancelText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13.5, color: theme.colors.textSecondary },
  });
