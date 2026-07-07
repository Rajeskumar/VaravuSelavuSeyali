import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { ChangeInsight } from '../api/analytics';

interface Props {
  insights: ChangeInsight[];
  onPress: () => void;
}

const formatCurrency = (val: number) =>
  `$${Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Single top "what changed" teaser (TS-DES-112) — HomeScreen's compact companion to the full
 * horizontal-scroll `InsightRail` on AnalysisScreen. Renders nothing if there's no insight,
 * matching InsightRail's own empty-state discipline.
 */
export default function WhatChangedTeaser({ insights, onPress }: Props) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!insights || insights.length === 0) return null;

  const top = insights[0];
  const isUp = top.change_amount > 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>WHAT CHANGED</Text>
        <Text style={styles.seeAll}>See all ›</Text>
      </View>
      <View style={styles.body}>
        <View style={[styles.iconBadge, { backgroundColor: isUp ? theme.colors.errorSurface : theme.colors.successSurface }]}>
          <Ionicons
            name={isUp ? 'trending-up' : 'trending-down'}
            size={18}
            color={isUp ? theme.colors.error : theme.colors.success}
          />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.metricName} numberOfLines={1}>
            {top.entity_name ? `${top.metric_name} · ${top.entity_name}` : top.metric_name}
          </Text>
          <Text style={[styles.amount, { color: isUp ? theme.colors.error : theme.colors.success }]}>
            {isUp ? '+' : '−'}{formatCurrency(top.change_amount)} ({isUp ? '+' : ''}{top.change_percent.toFixed(0)}% vs last {top.time_scope})
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderLight,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  eyebrow: {
    ...theme.typography.label,
  },
  seeAll: {
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textCol: {
    flex: 1,
  },
  metricName: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 3,
  },
  amount: {
    fontFamily: theme.typography.fontFamily.semiBold,
    fontSize: 13,
    fontVariant: ['tabular-nums'] as const,
  },
});
