import React, { useState, useEffect } from 'react';
import {
    Modal, View, Text, StyleSheet, TouchableOpacity,
    TextInput, ScrollView, Switch
} from 'react-native';
import { theme, globalStyles } from '../theme';
import { getRecurringDue, confirmRecurring, DueOccurrenceDTO } from '../api/recurring';
import { useAuth } from '../context/AuthContext';
import { showToast } from './Toast';

interface ItemState {
    selected: boolean;
    cost: number;
}

const promptedSessions = new Set<string>();

export default function RecurringPrompt() {
    const { userEmail } = useAuth();
    const [open, setOpen] = useState(false);
    const [due, setDue] = useState<DueOccurrenceDTO[]>([]);
    const [items, setItems] = useState<Record<string, ItemState>>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!userEmail) return;
        if (promptedSessions.has(userEmail)) return;

        const checkDue = async () => {
            try {
                const todayISO = new Date().toISOString().split('T')[0];
                const dueItems = await getRecurringDue(todayISO);
                if (dueItems.length > 0) {
                    const state: Record<string, ItemState> = {};
                    dueItems.forEach((d) => {
                        const key = `${d.template_id}__${d.date_iso}`;
                        state[key] = { selected: true, cost: d.suggested_cost };
                    });
                    setItems(state);
                    setDue(dueItems);
                    setOpen(true);
                    promptedSessions.add(userEmail);
                }
            } catch (err) {
                // silently ignore failures
            }
        };
        checkDue();
    }, [userEmail]);

    if (!open || due.length === 0) return null;

    const onConfirm = async () => {
        setLoading(true);
        try {
            const toSend: { template_id: string; date_iso: string; cost: number }[] = [];
            for (const d of due) {
                const key = `${d.template_id}__${d.date_iso}`;
                const it = items[key];
                if (!it?.selected) continue;
                const cost = Number(it.cost) || 0;
                if (cost <= 0) continue;
                toSend.push({ template_id: d.template_id, date_iso: d.date_iso, cost });
            }
            if (toSend.length > 0) {
                await confirmRecurring(toSend);
                showToast({ message: 'Recurring expenses added successfully!', type: 'success' });
            }
            setOpen(false);
        } catch (e) {
            showToast({ message: 'Failed to add one or more expenses.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const toggleItem = (key: string, value: boolean) => {
        setItems((s) => ({ ...s, [key]: { ...s[key], selected: value } }));
    };

    const updateCost = (key: string, value: string) => {
        setItems((s) => ({ ...s, [key]: { ...s[key], cost: parseFloat(value) || 0 } }));
    };

    return (
        <Modal transparent visible={open} animationType="fade">
            <View style={styles.backdrop}>
                <View style={styles.modalContent}>
                    <Text style={styles.title}>Recurring Expenses Due</Text>
                    <Text style={styles.subtitle}>
                        The following recurring expenses are due today. Review amounts and confirm to add them.
                    </Text>

                    <ScrollView style={styles.list}>
                        {due.map((d) => {
                            const key = `${d.template_id}__${d.date_iso}`;
                            const st = items[key];
                            const displayDate = new Date(d.date_iso).toLocaleDateString();

                            return (
                                <View key={key} style={styles.itemRow}>
                                    <Switch
                                        value={!!st?.selected}
                                        onValueChange={(val) => toggleItem(key, val)}
                                        trackColor={{ false: theme.colors.border, true: theme.colors.primaryLight }}
                                        thumbColor={st?.selected ? theme.colors.primary : '#f4f3f4'}
                                    />
                                    <View style={styles.itemDetails}>
                                        <Text style={styles.itemDesc}>{d.description}</Text>
                                        <Text style={styles.itemMeta}>
                                            {d.category} • {displayDate}
                                        </Text>
                                    </View>
                                    <TextInput
                                        style={styles.costInput}
                                        keyboardType="numeric"
                                        value={st?.cost?.toString()}
                                        onChangeText={(val) => updateCost(key, val)}
                                    />
                                </View>
                            );
                        })}
                    </ScrollView>

                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={[globalStyles.secondaryButton, { flex: 1, marginRight: theme.spacing.sm }]}
                            onPress={() => setOpen(false)}
                        >
                            <Text style={globalStyles.secondaryButtonText}>Skip</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[globalStyles.button, { flex: 1, marginLeft: theme.spacing.sm }]}
                            onPress={onConfirm}
                            disabled={loading}
                        >
                            <Text style={globalStyles.buttonText}>{loading ? 'Saving...' : 'Confirm'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: theme.spacing.lg,
    },
    modalContent: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.xl,
        padding: theme.spacing.lg,
        width: '100%',
        maxHeight: '80%',
        ...theme.shadows.lg,
    },
    title: {
        ...theme.typography.h2,
        marginBottom: theme.spacing.xs,
        fontSize: 22,
    },
    subtitle: {
        ...theme.typography.bodySmall,
        marginBottom: theme.spacing.lg,
    },
    list: {
        marginBottom: theme.spacing.md,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: theme.spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
    },
    itemDetails: {
        flex: 1,
        marginLeft: theme.spacing.sm,
        marginRight: theme.spacing.sm,
    },
    itemDesc: {
        ...theme.typography.body,
        fontWeight: '600',
    },
    itemMeta: {
        ...theme.typography.caption,
        marginTop: 2,
    },
    costInput: {
        ...globalStyles.input,
        marginBottom: 0,
        minHeight: 40,
        width: 80,
        paddingVertical: 8,
        paddingHorizontal: 8,
        textAlign: 'right',
    },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
});
