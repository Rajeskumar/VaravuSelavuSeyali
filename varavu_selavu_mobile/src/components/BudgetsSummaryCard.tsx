import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { BudgetDTO } from '../api/budgets';

const DISMISSED_KEY = 'vs_budgets_prompt_dismissed_v1';

interface BudgetsSummaryCardProps {
  budgets: BudgetDTO[];
  onPress: () => void;
}

/** Mirrors web's BudgetsSummaryCard.tsx (PRD §6.1): a compact "3 of 5 on track" card, or a
 * single dismissible "Set a budget" prompt for a user with none yet. */
export default function BudgetsSummaryCard({ budgets, onPress }: BudgetsSummaryCardProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [dismissed, setDismissed] = useState(true); // hidden until the async check below resolves

  React.useEffect(() => {
    let mounted = true;
    SecureStore.getItemAsync(DISMISSED_KEY).then((v) => {
      if (mounted) setDismissed(!!v);
    });
    return () => { mounted = false; };
  }, []);

  if (budgets.length === 0) {
    if (dismissed) return null;
    return (
      <View style={styles.card}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onPress} activeOpacity={0.8}>
          <Text style={styles.title}>Set a budget</Text>
          <Text style={styles.subtitle}>Get an early warning before you overspend a category.</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { SecureStore.setItemAsync(DISMISSED_KEY, '1'); setDismissed(true); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.dismiss}>✕</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const onTrack = budgets.filter((b) => b.status === 'on_track').length;
  const atRisk = budgets.filter((b) => b.status === 'at_risk' || b.status === 'over_pace').length;
  const exceeded = budgets.filter((b) => b.status === 'exceeded').length;
  const parts = [`${onTrack} of ${budgets.length} on track`];
  if (atRisk > 0) parts.push(`${atRisk} at risk`);
  if (exceeded > 0) parts.push(`${exceeded} over`);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>Budgets</Text>
        <Text style={styles.subtitle}>{parts.join(' · ')}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderLight,
      borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
      marginHorizontal: 18, marginTop: 16, gap: 8,
    },
    title: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14, color: theme.colors.text },
    subtitle: { fontFamily: 'InstrumentSans-Regular', fontSize: 11.5, color: theme.colors.textSecondary, marginTop: 2 },
    chevron: { fontSize: 20, color: theme.colors.textTertiary },
    dismiss: { fontSize: 16, color: theme.colors.textTertiary, padding: 4 },
  });
