import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { RecurringTemplateDTO } from '../api/recurring';

interface Props {
  templates: RecurringTemplateDTO[];
  onPress: () => void;
}

const formatCurrency = (n: number) => `$${n.toFixed(2)}`;

/** Next occurrence of `dayOfMonth` on/after `today`, wrapping to next month if it already passed. */
function nextDueDate(dayOfMonth: number, today: Date): Date {
  const thisMonthDue = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
  if (thisMonthDue >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    return thisMonthDue;
  }
  return new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
}

function daysUntil(due: Date, today: Date): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

const DUE_SOON_LIMIT = 3;

/**
 * Compact "Due Soon" strip (TS-DES-112) — HomeScreen companion mirroring web's DueSoonStrip.
 * Active recurring templates ranked by actual proximity to today, not creation order. Renders
 * nothing if there are no active (non-paused) templates.
 */
export default function DueSoonStrip({ templates, onPress }: Props) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const today = new Date();

  const ranked = templates
    .filter((t) => t.status !== 'Paused')
    .map((t) => {
      const due = nextDueDate(t.day_of_month, today);
      return { ...t, days: daysUntil(due, today) };
    })
    .sort((a, b) => a.days - b.days)
    .slice(0, DUE_SOON_LIMIT);

  if (ranked.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>DUE SOON</Text>
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
          <Text style={styles.seeAll}>See all ›</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        {ranked.map((t, idx) => (
          <TouchableOpacity
            key={t.id}
            onPress={onPress}
            activeOpacity={0.7}
            style={[styles.row, idx < ranked.length - 1 && styles.rowBorder]}
          >
            <View style={styles.textCol}>
              <Text style={styles.description} numberOfLines={1}>{t.description}</Text>
              <Text style={styles.dueLabel}>
                {t.days === 0 ? 'Due today' : t.days === 1 ? 'Due tomorrow' : `Due in ${t.days} days`}
              </Text>
            </View>
            <Text style={styles.amount}>{formatCurrency(t.default_cost)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    marginBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  eyebrow: {
    ...theme.typography.label,
  },
  seeAll: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  card: {
    marginHorizontal: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  textCol: {
    flex: 1,
    marginRight: 8,
  },
  description: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 2,
  },
  dueLabel: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  amount: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 17,
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
});
