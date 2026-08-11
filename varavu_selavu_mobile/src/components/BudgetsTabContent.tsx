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
  ActivityIndicator, Switch, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listBudgets, createBudget, deleteBudget, getBudgetSuggestions, getBudgetAskWhy,
  BudgetDTO, BudgetTargetType, BudgetScope,
} from '../api/budgets';
import { checkGroupsEnabled } from '../api/groups';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import CategoryPickerField from './CategoryPickerField';
import SegmentedTabs from './SegmentedTabs';
import { ListSkeleton } from './SkeletonLoader';
import { findMainCategory } from '../constants/categories';
import BudgetProgressBar, { formatBudgetMoney } from './BudgetProgressBar';

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

function summarize(budgets: BudgetDTO[]): string {
  if (budgets.length === 0) return 'No budgets yet';
  const onTrack = budgets.filter((b) => b.status === 'on_track').length;
  const atRisk = budgets.filter((b) => b.status === 'at_risk' || b.status === 'over_pace').length;
  const exceeded = budgets.filter((b) => b.status === 'exceeded').length;
  const parts = [`${onTrack} of ${budgets.length} on track`];
  if (atRisk > 0) parts.push(`${atRisk} at risk`);
  if (exceeded > 0) parts.push(`${exceeded} over`);
  return parts.join(' · ');
}

export default function BudgetsTabContent() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const qc = useQueryClient();

  const { data: groupsEnabled } = useQuery({ queryKey: ['groupsEnabled'], queryFn: checkGroupsEnabled });
  const { data, isLoading } = useQuery({ queryKey: ['budgets'], queryFn: () => listBudgets() });
  const budgets = data || [];

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const { data: suggestions } = useQuery({
    queryKey: ['budget-suggestions', form.scope],
    queryFn: () => getBudgetSuggestions(form.scope),
    enabled: formVisible && form.target_type === 'category',
  });
  const suggestion = suggestions?.find((s) => s.category === form.category);

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

  const openAdd = () => {
    setEditing(false);
    setForm(emptyForm());
    setFormVisible(true);
  };

  const openEdit = (b: BudgetDTO) => {
    setEditing(true);
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

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.summaryText}>{summarize(budgets)}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ListSkeleton count={3} />
      ) : budgets.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🎯</Text>
          <Text style={styles.emptyTitle}>No budgets yet</Text>
          <Text style={styles.emptySubtitle}>Set a monthly limit for a category or your overall spend.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {budgets.map((b) => {
            const title = b.target_type === 'overall' ? 'Overall' : b.category || 'Budget';
            return (
              <TouchableOpacity key={b.id} style={styles.card} onPress={() => openEdit(b)} activeOpacity={0.85} onLongPress={() => confirmDelete(b)}>
                <View style={styles.cardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
                    <View style={styles.scopeBadge}>
                      <Text style={styles.scopeBadgeText}>{b.scope === 'combined' ? 'Combined' : 'Personal'}</Text>
                    </View>
                  </View>
                </View>

                <BudgetProgressBar theme={theme} spent={b.spent} amount={b.amount} status={b.status} />

                <View style={styles.cardFooter}>
                  <Text style={styles.footerText}>
                    {b.is_snapshot
                      ? 'Final for this period'
                      : `Projected ${formatBudgetMoney(b.projected)}${b.committed > 0 ? ` · ${formatBudgetMoney(b.committed)} committed` : ''}`}
                  </Text>
                  <TouchableOpacity
                    onPress={() => askWhy(b)}
                    disabled={askWhyMut.isPending}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.askWhy}>
                      {askWhyId === b.id && askWhyMut.isPending ? 'Thinking…' : '✨ Ask why'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {askWhyId === b.id && (askWhyMut.isSuccess || askWhyMut.isError) && (
                  <View style={styles.askWhyBox}>
                    <Text style={askWhyMut.isError ? styles.askWhyErrorText : styles.askWhyText}>
                      {askWhyMut.isError
                        ? (askWhyMut.error as Error)?.message || 'Failed to get an explanation.'
                        : askWhyMut.data?.response}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

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
              {form.target_type === 'category' && suggestion && !form.amount && (
                <TouchableOpacity
                  style={styles.suggestionChip}
                  onPress={() => setForm((f) => ({ ...f, amount: String(suggestion.suggested_amount) }))}
                >
                  <Text style={styles.suggestionChipText}>
                    Suggested: ${suggestion.suggested_amount.toFixed(0)} — tap to use
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
                <Switch
                  value={form.rollover}
                  onValueChange={(v) => setForm((f) => ({ ...f, rollover: v }))}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                />
              </View>

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
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    section: { marginTop: 4, marginHorizontal: 18 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    summaryText: { fontFamily: 'InstrumentSans-Regular', fontSize: 12.5, color: theme.colors.textSecondary },
    addBtn: { backgroundColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
    addBtnText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.textInverse },

    list: { gap: 12 },
    card: {
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderLight,
      borderRadius: 14,
      padding: 14,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    cardTitle: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14.5, color: theme.colors.text, flexShrink: 1 },
    scopeBadge: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
    scopeBadgeText: { fontFamily: 'InstrumentSans-Bold', fontSize: 9.5, color: theme.colors.textSecondary },
    cardFooter: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.borderLight,
      gap: 8,
    },
    footerText: { fontFamily: 'InstrumentSans-Regular', fontSize: 11, color: theme.colors.textTertiary, flex: 1 },
    askWhy: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 11.5, color: theme.colors.primary },
    askWhyBox: {
      marginTop: 10, paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.borderLight,
      borderStyle: 'dashed',
    },
    askWhyText: { fontFamily: 'InstrumentSans-Regular', fontSize: 12.5, color: theme.colors.text, lineHeight: 18 },
    askWhyErrorText: { fontFamily: 'InstrumentSans-Regular', fontSize: 12.5, color: theme.colors.error },

    emptyCard: {
      alignItems: 'center', paddingVertical: 36,
      backgroundColor: theme.colors.surface, borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderLight,
    },
    emptyIcon: { fontSize: 40, marginBottom: 12 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 6, textAlign: 'center' },
    emptySubtitle: { fontSize: 13.5, color: theme.colors.textSecondary, textAlign: 'center', paddingHorizontal: 24 },

    // Modal (mirrors RecurringExpensesScreen.tsx's own form modal shell)
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalContent: {
      backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
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
