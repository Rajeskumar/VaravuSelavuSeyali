import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppTheme } from '../theme';
import { BudgetStatus } from '../api/budgets';

export const STATUS_LABEL: Record<BudgetStatus, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  over_pace: 'Over pace',
  exceeded: 'Over budget',
};

export function statusColor(theme: AppTheme, status: BudgetStatus): string {
  switch (status) {
    case 'on_track':
      return theme.colors.success;
    case 'at_risk':
      return theme.colors.warning;
    case 'over_pace':
    case 'exceeded':
      return theme.colors.error;
    default:
      return theme.colors.textSecondary;
  }
}

export function formatBudgetMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

interface BudgetProgressBarProps {
  theme: AppTheme;
  spent: number;
  amount: number;
  status: BudgetStatus;
  showLabel?: boolean;
}

/** Mirrors web's BudgetProgressBar.tsx: overflow-safe (fill capped at 100% width, "over by $X"
 * spelled out in text) and status is always a text label, never color-only. */
export default function BudgetProgressBar({ theme, spent, amount, status, showLabel = true }: BudgetProgressBarProps) {
  const styles = createStyles(theme);
  const color = statusColor(theme, status);
  const pct = amount > 0 ? Math.max(0, Math.min(100, (spent / amount) * 100)) : 0;
  const over = spent - amount;

  return (
    <View>
      {showLabel && (
        <View style={styles.labelRow}>
          <Text style={styles.spentText}>
            {formatBudgetMoney(spent)} of {formatBudgetMoney(amount)}
          </Text>
          <Text style={[styles.statusText, { color }]}>
            {STATUS_LABEL[status]}
            {over > 0 ? ` · over by ${formatBudgetMoney(over)}` : ''}
          </Text>
        </View>
      )}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
    spentText: { fontFamily: 'InstrumentSans-Regular', fontSize: 11.5, color: theme.colors.textSecondary },
    statusText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 11.5, flexShrink: 0 },
    track: { width: '100%', height: 6, borderRadius: 999, backgroundColor: theme.colors.surfaceSecondary, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 999 },
  });
