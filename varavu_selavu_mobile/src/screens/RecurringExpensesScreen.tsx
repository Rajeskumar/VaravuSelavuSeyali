import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
    ActivityIndicator, Alert, ScrollView, RefreshControl, Platform,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { theme } from '../theme';
import ScreenWrapper from '../components/ScreenWrapper';
import Card from '../components/Card';
import { HeroSkeleton, ListSkeleton } from '../components/SkeletonLoader';
import {
    listRecurringTemplates,
    upsertRecurringTemplate,
    deleteRecurringTemplate,
    executeRecurringNow,
    RecurringTemplateDTO,
    UpsertRecurringPayload,
} from '../api/recurring';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

const categoryEmojis: Record<string, string> = {
    home: '🏠', rent: '🏠', transportation: '🚗', 'food & drink': '🍕',
    entertainment: '🎬', life: '💊', utilities: '💡', other: '📋',
    subscription: '📱', insurance: '🛡️', mortgage: '🏦', internet: '🌐',
    phone: '📞', electricity: '⚡', water: '💧', gas: '⛽', gym: '🏋️',
    streaming: '📺', cloud: '☁️', music: '🎵', education: '📚',
};

function getCategoryEmoji(cat: string): string {
    return categoryEmojis[cat?.toLowerCase().trim()] || '🔁';
}

function getNextOccurrence(template: RecurringTemplateDTO): Date {
    const now = new Date();
    const start = new Date(template.start_date_iso);
    let candidate = new Date(now.getFullYear(), now.getMonth(), template.day_of_month);
    if (candidate < now) {
        candidate = new Date(now.getFullYear(), now.getMonth() + 1, template.day_of_month);
    }
    if (candidate < start) return start;
    return candidate;
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface GroupedTemplates {
    monthLabel: string;
    items: (RecurringTemplateDTO & { nextDue: Date })[];
}

function groupByMonth(templates: RecurringTemplateDTO[]): GroupedTemplates[] {
    const withDue = templates.map((t) => ({ ...t, nextDue: getNextOccurrence(t) }));
    withDue.sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime());

    const groups: Record<string, GroupedTemplates> = {};
    withDue.forEach((t) => {
        const key = `${t.nextDue.getFullYear()}-${t.nextDue.getMonth()}`;
        const label = `${MONTH_NAMES[t.nextDue.getMonth()]} ${t.nextDue.getFullYear()}`;
        if (!groups[key]) groups[key] = { monthLabel: label, items: [] };
        groups[key].items.push(t);
    });

    return Object.values(groups);
}

const EMPTY_FORM: UpsertRecurringPayload = {
    description: '',
    category: '',
    day_of_month: new Date().getDate(),
    default_cost: 0,
    start_date_iso: new Date().toISOString().split('T')[0],
};

export default function RecurringExpensesScreen() {
    const isFocused = useIsFocused();
    const [templates, setTemplates] = useState<RecurringTemplateDTO[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Form state
    const [formVisible, setFormVisible] = useState(false);
    const [form, setForm] = useState<UpsertRecurringPayload>({ ...EMPTY_FORM });
    const [saving, setSaving] = useState(false);

    // Execute modal
    const [execTemplate, setExecTemplate] = useState<RecurringTemplateDTO | null>(null);
    const [execAmount, setExecAmount] = useState('');

    const fetchTemplates = useCallback(async () => {
        try {
            const data = await listRecurringTemplates();
            setTemplates(data);
        } catch (error) {
            console.error('Failed to load recurring templates', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (isFocused) {
            setLoading(true);
            fetchTemplates();
        }
    }, [isFocused]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchTemplates();
    };

    const handleSave = async () => {
        if (!form.description || !form.category || form.default_cost <= 0) {
            Alert.alert('Validation', 'Please fill in all required fields.');
            return;
        }
        setSaving(true);
        try {
            await upsertRecurringTemplate(form);
            setFormVisible(false);
            setForm({ ...EMPTY_FORM });
            fetchTemplates();
        } catch (error) {
            Alert.alert('Error', 'Failed to save template.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (template: RecurringTemplateDTO) => {
        Alert.alert(
            'Delete Template',
            `Are you sure you want to delete "${template.description}"? This will stop future prompts for this recurring expense.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete', style: 'destructive', onPress: async () => {
                        setActionLoading(template.id);
                        try {
                            await deleteRecurringTemplate(template.id);
                            fetchTemplates();
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete template.');
                        } finally {
                            setActionLoading(null);
                        }
                    },
                },
            ],
        );
    };

    const openExecute = (template: RecurringTemplateDTO) => {
        setExecTemplate(template);
        setExecAmount(template.default_cost.toString());
    };

    const handleExecute = async () => {
        if (!execTemplate) return;
        setActionLoading(execTemplate.id);
        try {
            const resp = await executeRecurringNow(execTemplate.id, parseFloat(execAmount) || execTemplate.default_cost);
            Alert.alert(
                'Success',
                resp.created
                    ? 'Expense added and month marked as processed.'
                    : 'Month marked as processed (already added).'
            );
            setExecTemplate(null);
            fetchTemplates();
        } catch (error) {
            Alert.alert('Error', 'Failed to execute template.');
        } finally {
            setActionLoading(null);
        }
    };

    const openEdit = (template: RecurringTemplateDTO) => {
        setForm({
            description: template.description,
            category: template.category,
            day_of_month: template.day_of_month,
            default_cost: template.default_cost,
            start_date_iso: template.start_date_iso,
        });
        setFormVisible(true);
    };

    const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
    const totalMonthly = templates.reduce((s, t) => s + t.default_cost, 0);
    const groups = groupByMonth(templates);

    if (loading && !refreshing) {
        return (
            <ScreenWrapper scroll>
                <View style={styles.header}>
                    <Text style={theme.typography.h2}>Recurring</Text>
                </View>
                <HeroSkeleton />
                <ListSkeleton count={4} />
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper
            scroll
            style={{ paddingTop: 0 }}
            contentStyle={{ paddingHorizontal: 0 }}
        >
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />

            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>Recurring Expenses</Text>
                    <Text style={styles.headerSubtitle}>
                        {templates.length} template{templates.length !== 1 ? 's' : ''} • {formatCurrency(totalMonthly)}/mo
                    </Text>
                </View>
                <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => { setForm({ ...EMPTY_FORM }); setFormVisible(true); }}
                    activeOpacity={0.7}
                >
                    <Text style={styles.addBtnText}>+ Add</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.body}>
                {templates.length === 0 ? (
                    <Card>
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>🔁</Text>
                            <Text style={styles.emptyTitle}>No recurring expenses</Text>
                            <Text style={styles.emptySubtitle}>
                                Add subscriptions, bills, and other recurring costs to track them automatically.
                            </Text>
                            <TouchableOpacity
                                style={styles.emptyBtn}
                                onPress={() => { setForm({ ...EMPTY_FORM }); setFormVisible(true); }}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.emptyBtnText}>Add Template</Text>
                            </TouchableOpacity>
                        </View>
                    </Card>
                ) : (
                    groups.map((group) => (
                        <View key={group.monthLabel} style={styles.monthSection}>
                            <Text style={styles.monthLabel}>{group.monthLabel}</Text>
                            {group.items.map((t) => (
                                <Card key={t.id} style={styles.templateCard}>
                                    <View style={styles.templateRow}>
                                        <View style={styles.templateEmoji}>
                                            <Text style={styles.templateEmojiText}>{getCategoryEmoji(t.category)}</Text>
                                        </View>
                                        <View style={styles.templateInfo}>
                                            <Text style={styles.templateName} numberOfLines={1}>{t.description}</Text>
                                            <Text style={styles.templateMeta}>
                                                {t.category} • Day {t.day_of_month} • Due {t.nextDue.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </Text>
                                            {t.last_processed_iso && (
                                                <Text style={styles.templateProcessed}>
                                                    Last: {formatDate(t.last_processed_iso)}
                                                </Text>
                                            )}
                                        </View>
                                        <Text style={styles.templateCost}>{formatCurrency(t.default_cost)}</Text>
                                    </View>

                                    {/* Actions */}
                                    <View style={styles.actionsRow}>
                                        <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(t)} activeOpacity={0.7}>
                                            <Text style={styles.actionBtnText}>✏️ Edit</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionBtn, styles.execBtn]}
                                            onPress={() => openExecute(t)}
                                            activeOpacity={0.7}
                                            disabled={actionLoading === t.id}
                                        >
                                            {actionLoading === t.id ? (
                                                <ActivityIndicator size="small" color={theme.colors.primary} />
                                            ) : (
                                                <Text style={[styles.actionBtnText, { color: theme.colors.primary }]}>▶ Execute Now</Text>
                                            )}
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionBtn, styles.deleteBtn]}
                                            onPress={() => handleDelete(t)}
                                            activeOpacity={0.7}
                                            disabled={actionLoading === t.id}
                                        >
                                            <Text style={[styles.actionBtnText, { color: theme.colors.error }]}>🗑 Delete</Text>
                                        </TouchableOpacity>
                                    </View>
                                </Card>
                            ))}
                        </View>
                    ))
                )}
            </View>

            {/* Add/Edit Form Modal */}
            <Modal visible={formVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                {form.description ? 'Edit Template' : 'New Template'}
                            </Text>
                            <TouchableOpacity onPress={() => setFormVisible(false)} activeOpacity={0.7}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={styles.fieldLabel}>Description *</Text>
                            <TextInput
                                style={styles.input}
                                value={form.description}
                                onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                                placeholder="e.g. Netflix, Rent, Internet"
                                placeholderTextColor={theme.colors.textTertiary}
                            />

                            <Text style={styles.fieldLabel}>Category *</Text>
                            <TextInput
                                style={styles.input}
                                value={form.category}
                                onChangeText={(v) => setForm((f) => ({ ...f, category: v }))}
                                placeholder="e.g. Entertainment, Utilities"
                                placeholderTextColor={theme.colors.textTertiary}
                            />

                            <View style={styles.rowFields}>
                                <View style={styles.halfField}>
                                    <Text style={styles.fieldLabel}>Day of Month *</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={String(form.day_of_month)}
                                        onChangeText={(v) => {
                                            const num = Math.max(1, Math.min(31, parseInt(v) || 1));
                                            setForm((f) => ({ ...f, day_of_month: num }));
                                        }}
                                        keyboardType="number-pad"
                                        placeholder="1-31"
                                        placeholderTextColor={theme.colors.textTertiary}
                                    />
                                </View>
                                <View style={styles.halfField}>
                                    <Text style={styles.fieldLabel}>Default Cost *</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={form.default_cost > 0 ? String(form.default_cost) : ''}
                                        onChangeText={(v) => setForm((f) => ({ ...f, default_cost: parseFloat(v) || 0 }))}
                                        keyboardType="decimal-pad"
                                        placeholder="0.00"
                                        placeholderTextColor={theme.colors.textTertiary}
                                    />
                                </View>
                            </View>

                            <Text style={styles.fieldLabel}>Start Date</Text>
                            <TextInput
                                style={styles.input}
                                value={form.start_date_iso || ''}
                                onChangeText={(v) => setForm((f) => ({ ...f, start_date_iso: v }))}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor={theme.colors.textTertiary}
                            />

                            <TouchableOpacity
                                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                                onPress={handleSave}
                                disabled={saving}
                                activeOpacity={0.7}
                            >
                                {saving ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={styles.saveBtnText}>Save Template</Text>
                                )}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Execute Now Modal */}
            <Modal visible={!!execTemplate} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '40%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Execute Now</Text>
                            <TouchableOpacity onPress={() => setExecTemplate(null)} activeOpacity={0.7}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.execDesc}>
                            Add this month's expense for "{execTemplate?.description}" immediately and mark this month as processed.
                        </Text>
                        <Text style={styles.fieldLabel}>Amount</Text>
                        <TextInput
                            style={styles.input}
                            value={execAmount}
                            onChangeText={setExecAmount}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            placeholderTextColor={theme.colors.textTertiary}
                        />
                        <View style={styles.execActions}>
                            <TouchableOpacity
                                style={styles.execCancelBtn}
                                onPress={() => setExecTemplate(null)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.execCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.saveBtn}
                                onPress={handleExecute}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.saveBtnText}>Execute</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 48 : 56, paddingBottom: 16,
    },
    headerTitle: { fontSize: 26, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.3 },
    headerSubtitle: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 2 },
    addBtn: {
        backgroundColor: theme.colors.primary, paddingVertical: 10, paddingHorizontal: 18,
        borderRadius: 20, ...theme.shadows.colored,
    },
    addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    body: { paddingHorizontal: 20 },
    monthSection: { marginBottom: 8 },
    monthLabel: {
        fontSize: 13, fontWeight: '700', color: theme.colors.textTertiary,
        textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 4,
    },
    templateCard: { padding: 16 },
    templateRow: { flexDirection: 'row', alignItems: 'center' },
    templateEmoji: {
        width: 48, height: 48, borderRadius: 14,
        backgroundColor: theme.colors.primarySurface,
        justifyContent: 'center', alignItems: 'center',
    },
    templateEmojiText: { fontSize: 22 },
    templateInfo: { flex: 1, marginLeft: 14 },
    templateName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
    templateMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
    templateProcessed: { fontSize: 11, color: theme.colors.textTertiary, marginTop: 1 },
    templateCost: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
    actionsRow: {
        flexDirection: 'row', marginTop: 12, paddingTop: 12,
        borderTopWidth: 1, borderTopColor: theme.colors.borderLight, gap: 8,
    },
    actionBtn: {
        paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
        backgroundColor: theme.colors.background,
    },
    actionBtnText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
    execBtn: { backgroundColor: theme.colors.primarySurface },
    deleteBtn: { backgroundColor: theme.colors.errorSurface },
    // Empty state
    emptyState: { alignItems: 'center', paddingVertical: 32 },
    emptyIcon: { fontSize: 48, marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
    emptySubtitle: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', paddingHorizontal: 20 },
    emptyBtn: {
        marginTop: 20, backgroundColor: theme.colors.primary,
        paddingVertical: 12, paddingHorizontal: 24, borderRadius: 20,
    },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    // Modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    modalContent: {
        backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: 24, paddingBottom: 40, maxHeight: '80%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 22, fontWeight: '700', color: theme.colors.text },
    modalClose: { fontSize: 22, color: theme.colors.textTertiary, padding: 8 },
    fieldLabel: {
        fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary,
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
    },
    input: {
        backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 16,
        paddingVertical: 14, marginBottom: 16, borderWidth: 1.5,
        borderColor: theme.colors.border, fontSize: 16, color: theme.colors.text, minHeight: 48,
    },
    rowFields: { flexDirection: 'row', gap: 12 },
    halfField: { flex: 1 },
    saveBtn: {
        backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: 20,
        alignItems: 'center', marginTop: 8, ...theme.shadows.colored,
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    // Execute modal
    execDesc: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16, lineHeight: 20 },
    execActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
    execCancelBtn: {
        flex: 1, paddingVertical: 14, borderRadius: 20, alignItems: 'center',
        borderWidth: 1.5, borderColor: theme.colors.border,
    },
    execCancelText: { color: theme.colors.textSecondary, fontSize: 16, fontWeight: '600' },
});
