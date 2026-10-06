/**
 * BudgetsTabContent.tsx — TS-BUD-101. Rendered as a 4th embedded pane inside AnalysisScreen.tsx
 * (Overview/Items/Merchants/Budgets, switching in place like its siblings — see that file's own
 * doc comment for why "navigate away" was rejected for this screen) rather than a separate
 * Stack.Screen. Extracted into its own component (unlike Items/Merchants, which stay inline in
 * AnalysisScreen.tsx) because it owns real form state and a create/edit sheet, not just a
 * read-only list — the same size/complexity threshold RecurringExpensesScreen.tsx crossed as its
 * own screen file.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listBudgets, createBudget, updateBudget, deleteBudget, getBudgetSuggestions, getBudgetAskWhy,
  BudgetDTO, BudgetTargetType, BudgetScope,
} from '../api/budgets';
import { checkGroupsEnabled } from '../api/groups';
import { useAppTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { AppTheme } from '../theme';
import SectionLabel from './SectionLabel';
import { daysLeftInPeriod } from '../utils/expenseInsights';
import CategoryPickerField from './CategoryPickerField';
import SegmentedTabs from './SegmentedTabs';
import { ListSkeleton } from './SkeletonLoader';
import { findMainCategory } from '../constants/categories';
import { formatBudgetMoney, statusColor, STATUS_LABEL } from './BudgetProgressBar';
import ToggleSwitch from './ToggleSwitch';
import { formatCurrency } from '../utils/currencyMath';

const THRESHOLD_OPTIONS = [50, 80, 90, 100, 110];
const DEFAULT_THRESHOLDS = [80, 100];

interface FormState {
  target_type: BudgetTargetType;
  category: string;
  amount: string;
  scope: BudgetScope;
  rollover: boolean;
  alert_thresholds: number[];
}

const emptyForm = (): FormState => ({
  target_type: 'category',
  category: '',
  amount: '',
  scope: 'personal',
  rollover: false,
  alert_thresholds: [...DEFAULT_THRESHOLDS],
});

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const wholeMoney = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** `period` is 'YYYY-MM' (the Insights month chip); omitted = the current month. */
export default function BudgetsTabContent({ period }: { period?: string }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const qc = useQueryClient();

  const { data: groupsEnabled } = useQuery({ queryKey: ['groupsEnabled'], queryFn: checkGroupsEnabled });
  const { data, isLoading } = useQuery({ queryKey: ['budgets', period ?? null], queryFn: () => listBudgets({ period }) });
  const budgets = data || [];

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetDTO | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const { data: suggestions } = useQuery({
    queryKey: ['budget-suggestions', form.scope],
    queryFn: () => getBudgetSuggestions(form.scope),
    enabled: formVisible && form.target_type === 'category',
  });
  const suggestion = suggestions?.find((s) => s.category === form.category);
  // Non-blocking typo guard, same rule as web: far above this category's usual spend.
  const amountNum = parseFloat(form.amount);
  const implausible =
    Number.isFinite(amountNum) &&
    ((!!suggestion && amountNum > Math.max(suggestion.suggested_amount * 10, 1000)) || amountNum >= 100000);

  const saveMut = useMutation({
    mutationFn: () =>
      createBudget({
        target_type: form.target_type,
        category: form.target_type === 'category' ? form.category : null,
        amount: parseFloat(form.amount) || 0,
        scope: form.scope,
        rollover: form.rollover,
        alert_thresholds: form.alert_thresholds,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      setFormVisible(false);
    },
    onError: () => Alert.alert('Failed to save budget'),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteBudget(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
    onError: () => Alert.alert('Failed to delete budget'),
  });

  // §5.3 per-budget mute — backend's PATCH /budgets/{id} already accepted `muted`, but neither
  // client exposed a way to reach it. Toggled with a tap on the card's bell icon.
  const muteMut = useMutation({
    mutationFn: (b: BudgetDTO) => updateBudget(b.id, { muted: !b.muted }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      setEditingBudget((cur) => (cur && cur.id === updated.id ? { ...cur, muted: updated.muted } : cur));
    },
    onError: () => Alert.alert('Failed to update mute setting'),
  });

  const openAdd = () => {
    setEditing(false);
    setEditingBudget(null);
    setForm(emptyForm());
    setFormVisible(true);
  };

  const openEdit = (b: BudgetDTO) => {
    setEditing(true);
    setEditingBudget(b);
    setAskWhyId(null);
    setForm({
      target_type: b.target_type,
      category: b.category || '',
      amount: String(b.amount),
      scope: b.scope,
      rollover: b.rollover,
      alert_thresholds: b.alert_thresholds.length ? b.alert_thresholds : [...DEFAULT_THRESHOLDS],
    });
    setFormVisible(true);
  };

  const confirmDelete = (b: BudgetDTO) => {
    const title = b.target_type === 'overall' ? 'Overall' : b.category || 'Budget';
    Alert.alert(`Delete "${title}" budget?`, 'This stops tracking and alerts for it. Past months stay visible in Analysis.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => delMut.mutate(b.id) },
    ]);
  };

  // §5.4 "Ask why" — calls /budgets/{id}/ask-why, which hands the model this budget's own
  // figures plus every contributing transaction (BudgetService.build_ask_why_prompt) and shows
  // the grounded explanation inline, rather than deep-linking to the "AI Analyst" chat screen
  // with a pre-filled question and no transaction context.
  const [askWhyId, setAskWhyId] = useState<string | null>(null);
  const askWhyMut = useMutation({ mutationFn: (id: string) => getBudgetAskWhy(id) });
  const askWhy = (b: BudgetDTO) => {
    if (askWhyMut.isPending) return;
    setAskWhyId(b.id);
    askWhyMut.mutate(b.id);
  };

  const toggleThreshold = (t: number) => {
    setForm((f) => ({
      ...f,
      alert_thresholds: f.alert_thresholds.includes(t)
        ? f.alert_thresholds.filter((x) => x !== t)
        : [...f.alert_thresholds, t].sort((a, b) => a - b),
    }));
  };

  const canSave = parseFloat(form.amount) > 0 && (form.target_type === 'overall' || !!form.category);

  const overall = budgets.find((b) => b.target_type === 'overall');
  const rows = budgets.filter((b) => b.target_type !== 'overall');

  return (
    <View style={styles.section}>
      {/* V2 hero: what's left of the overall budget. Only when an overall budget exists —
          per-category budgets alone have no single "left to spend" figure. */}
      {overall && (() => {
        const left = Math.max(overall.remaining, 0);
        const [whole, cents] = left.toFixed(2).split('.');
        const pct = overall.amount > 0 ? Math.min((overall.spent / overall.amount) * 100, 100) : 0;
        const days = overall.is_snapshot ? 0 : daysLeftInPeriod(overall.period_end, new Date());
        return (
          <TouchableOpacity style={styles.hero} onPress={() => openEdit(overall)} activeOpacity={0.8} accessibilityLabel="Edit overall budget">
            <SectionLabel>Left to spend{days > 0 ? ` · ${days} day${days === 1 ? '' : 's'}` : ''}</SectionLabel>
            <Text style={styles.heroAmount}>
              ${Number(whole).toLocaleString('en-US')}<Text style={{ color: theme.colors.textTertiary }}>.{cents}</Text>
            </Text>
            <View style={styles.heroTrack}>
              <LinearGradient
                colors={theme.gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: `${pct}%`, height: '100%' }}
              />
            </View>
            <View style={styles.heroFoot}>
              <Text style={styles.heroFootText}>{money(overall.spent)} spent</Text>
              <Text style={styles.heroFootText}>{money(overall.amount)} budget</Text>
            </View>
          </TouchableOpacity>
        );
      })()}

      {isLoading ? (
        <ListSkeleton count={3} />
      ) : budgets.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No budgets yet</Text>
          <Text style={styles.emptySubtitle}>Set a monthly limit for a category or your overall spend.</Text>
        </View>
      ) : (
        <View>
          {rows.map((b) => {
            const color = statusColor(theme, b.status);
            const pct = b.amount > 0 ? Math.max(0, Math.min(100, (b.spent / b.amount) * 100)) : 0;
            const title = b.category || 'Budget';
            return (
              <TouchableOpacity
                key={b.id}
                style={styles.row}
                onPress={() => openEdit(b)}
                onLongPress={() => confirmDelete(b)}
                activeOpacity={0.7}
                accessibilityLabel={`${title}, ${money(b.spent)} of ${money(b.amount)}, ${STATUS_LABEL[b.status]}`}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.rowName} numberOfLines={1}>{title}</Text>
                  <Text style={[styles.rowSpent, { color }]}>{money(b.spent)}</Text>
                  <Text style={styles.rowCap}>/ {wholeMoney(b.amount)}</Text>
                </View>
                <View style={styles.rowTrack}>
                  <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <TouchableOpacity onPress={openAdd} activeOpacity={0.7} style={styles.newBtn} accessibilityRole="button">
        <Text style={styles.newBtnText}>+ New budget</Text>
      </TouchableOpacity>

      {/* Add/Edit Form Modal — same shell RecurringExpensesScreen.tsx uses */}
      <Modal visible={formVisible} animationType="slide" transparent onRequestClose={() => setFormVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Budget' : 'New Budget'}</Text>
              <TouchableOpacity onPress={() => setFormVisible(false)} activeOpacity={0.7}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ marginBottom: 16 }}>
                <SegmentedTabs<BudgetTargetType>
                  value={form.target_type}
                  onChange={(v) => setForm((f) => ({ ...f, target_type: v }))}
                  options={[
                    { value: 'overall', label: 'Overall' },
                    { value: 'category', label: 'Category' },
                  ]}
                />
              </View>

              {form.target_type === 'category' && (
                <CategoryPickerField
                  theme={theme}
                  mainCategory={findMainCategory(form.category)}
                  subcategory={form.category}
                  onChange={(_main, sub) => setForm((f) => ({ ...f, category: sub }))}
                  containerStyle={{ marginBottom: 16 }}
                />
              )}

              <Text style={styles.fieldLabel}>Monthly limit *</Text>
              <TextInput
                style={styles.input}
                value={form.amount}
                onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.colors.textTertiary}
              />
              {implausible && (
                <Text style={{ color: theme.colors.warning, fontSize: 12, marginTop: 6 }}>
                  That's {formatCurrency(amountNum)} a month{suggestion ? ` — you usually spend about ${formatCurrency(suggestion.suggested_amount)}` : ''}. Double-check the amount.
                </Text>
              )}
              {form.target_type === 'category' && suggestion && !form.amount && (
                <TouchableOpacity
                  style={styles.suggestionChip}
                  onPress={() => setForm((f) => ({ ...f, amount: String(suggestion.suggested_amount) }))}
                >
                  <Text style={styles.suggestionChipText}>
                    Suggested: {formatCurrency(suggestion.suggested_amount)} — tap to use
                  </Text>
                </TouchableOpacity>
              )}

              {!!groupsEnabled && (
                <View style={{ marginTop: 16, marginBottom: 16 }}>
                  <Text style={styles.fieldLabel}>Count spend from</Text>
                  <SegmentedTabs<BudgetScope>
                    value={form.scope}
                    onChange={(v) => setForm((f) => ({ ...f, scope: v }))}
                    options={[
                      { value: 'personal', label: 'Personal only' },
                      { value: 'combined', label: 'Combined + groups' },
                    ]}
                  />
                </View>
              )}

              <Text style={styles.fieldLabel}>Alert me at</Text>
              <View style={styles.thresholdRow}>
                {THRESHOLD_OPTIONS.map((t) => {
                  const active = form.alert_thresholds.includes(t);
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.thresholdChip, active && styles.thresholdChipActive]}
                      onPress={() => toggleThreshold(t)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.thresholdChipText, active && styles.thresholdChipTextActive]}>{t}%</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.rowFields, { alignItems: 'center', marginTop: 16, marginBottom: 8, justifyContent: 'space-between' }]}>
                <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>Roll over unused amount</Text>
                <ToggleSwitch
                  value={form.rollover}
                  onValueChange={(v) => setForm((f) => ({ ...f, rollover: v }))}
                  accessibilityLabel="Roll over unused amount"
                />
              </View>

              {editingBudget && (
                <View style={styles.editExtras}>
                  <View style={styles.extraRow}>
                    <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>Mute alerts</Text>
                    <ToggleSwitch
                      value={!!editingBudget.muted}
                      onValueChange={() => muteMut.mutate(editingBudget)}
                      disabled={muteMut.isPending}
                      accessibilityLabel="Mute budget alerts"
                    />
                  </View>
                  <Text style={styles.statusLine}>
                    {STATUS_LABEL[editingBudget.status]} · {editingBudget.is_snapshot
                      ? 'final for this period'
                      : `projected ${formatBudgetMoney(editingBudget.projected)}${editingBudget.committed > 0 ? ` · ${formatBudgetMoney(editingBudget.committed)} committed` : ''}`}
                  </Text>
                  <TouchableOpacity onPress={() => askWhy(editingBudget)} disabled={askWhyMut.isPending} activeOpacity={0.7}>
                    <Text style={styles.askWhy}>{askWhyId === editingBudget.id && askWhyMut.isPending ? 'Thinking…' : '✨ Ask why'}</Text>
                  </TouchableOpacity>
                  {askWhyId === editingBudget.id && (askWhyMut.isSuccess || askWhyMut.isError) && (
                    <Text style={askWhyMut.isError ? styles.askWhyErrorText : styles.askWhyText}>
                      {askWhyMut.isError ? (askWhyMut.error as Error)?.message || 'Failed to get an explanation.' : askWhyMut.data?.response}
                    </Text>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, (saveMut.isPending || !canSave) && styles.saveBtnDisabled]}
                onPress={() => saveMut.mutate()}
                disabled={saveMut.isPending || !canSave}
                activeOpacity={0.7}
              >
                {saveMut.isPending ? (
                  <ActivityIndicator size="small" color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.saveBtnText}>Save Budget</Text>
                )}
              </TouchableOpacity>
              {editingBudget && (
                <TouchableOpacity onPress={() => { setFormVisible(false); confirmDelete(editingBudget); }} activeOpacity={0.7} style={styles.deleteBtn}>
                  <Text style={styles.deleteBtnText}>Delete budget</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    section: { marginTop: 4, marginHorizontal: 22 },
    hero: {
      paddingTop: 16, paddingBottom: 16, marginBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
    },
    heroAmount: {
      fontFamily: 'BricolageGrotesque-SemiBold', fontSize: 44, letterSpacing: -2, color: theme.colors.text,
      marginTop: 4, fontVariant: ['tabular-nums'],
    },
    heroTrack: { height: 6, borderRadius: 999, backgroundColor: theme.colors.surfaceSecondary, marginTop: 16, overflow: 'hidden' },
    heroFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    heroFootText: { fontFamily: 'InstrumentSans-Regular', fontSize: 12, color: theme.colors.textTertiary },
    row: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
    rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
    rowName: { flex: 1, fontFamily: 'InstrumentSans-SemiBold', fontSize: 15, color: theme.colors.text },
    rowSpent: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14, fontVariant: ['tabular-nums'] },
    rowCap: { fontFamily: 'InstrumentSans-Regular', fontSize: 12, color: theme.colors.textTertiary, fontVariant: ['tabular-nums'] },
    rowTrack: { height: 5, borderRadius: 999, backgroundColor: theme.colors.surfaceSecondary, marginTop: 9, overflow: 'hidden' },
    newBtn: { alignSelf: 'flex-start', paddingVertical: 16 },
    newBtnText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14, color: theme.colors.primary },
    editExtras: { marginTop: 12, paddingTop: 14, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.borderLight },
    extraRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statusLine: { fontFamily: 'InstrumentSans-Regular', fontSize: 12, color: theme.colors.textTertiary },
    askWhy: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13, color: theme.colors.primary },
    deleteBtn: { alignItems: 'center', paddingVertical: 16 },
    deleteBtnText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14, color: theme.colors.error },
    askWhyText: { fontFamily: 'InstrumentSans-Regular', fontSize: 12.5, color: theme.colors.text, lineHeight: 18 },
    askWhyErrorText: { fontFamily: 'InstrumentSans-Regular', fontSize: 12.5, color: theme.colors.error },

    emptyCard: {
      alignItems: 'center', paddingVertical: 36,
      backgroundColor: theme.colors.surface, borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderLight,
    },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 6, textAlign: 'center' },
    emptySubtitle: { fontSize: 13.5, color: theme.colors.textSecondary, textAlign: 'center', paddingHorizontal: 24 },

    // Modal (mirrors RecurringExpensesScreen.tsx's own form modal shell)
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalContent: {
      backgroundColor: theme.colors.surfaceElevated, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 24, paddingBottom: 40, maxHeight: '85%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 22, fontWeight: '700', color: theme.colors.text },
    modalClose: { fontSize: 22, color: theme.colors.textTertiary, padding: 8 },
    fieldLabel: {
      fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
    },
    input: {
      backgroundColor: theme.colors.surfaceSecondary, borderRadius: 12, paddingHorizontal: 16,
      paddingVertical: 14, borderWidth: 1.5, borderColor: theme.colors.border,
      fontSize: 16, color: theme.colors.text, minHeight: 48,
    },
    suggestionChip: {
      alignSelf: 'flex-start', marginTop: 8, backgroundColor: theme.colors.surfaceSecondary,
      borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
    },
    suggestionChipText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12, color: theme.colors.primary },
    rowFields: { flexDirection: 'row', gap: 12 },
    thresholdRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    thresholdChip: {
      borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: 999,
      paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.colors.surface,
    },
    thresholdChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    thresholdChipText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.textSecondary },
    thresholdChipTextActive: { color: theme.colors.textInverse },
    saveBtn: {
      backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: 20,
      alignItems: 'center', marginTop: 8, ...theme.shadows.colored,
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText: { color: theme.colors.textInverse, fontSize: 16, fontWeight: '700' },
  });
