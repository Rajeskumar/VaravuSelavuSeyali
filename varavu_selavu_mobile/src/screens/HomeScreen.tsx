/**
 * HomeScreen.tsx — V2 "Dashboard" (Flows 3.1). Two figures that matter — spend this month with six
 * months of history, and net with people — then the ask bar and three recent rows. No lens toggle,
 * no duplicate totals: Budgets and Card Coach live under Insights, groups under the Groups tab.
 */
import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { getAnalysis } from '../api/analysis';
import { getProfile } from '../api/profile';
import { firstNameOf, initialOf } from '../utils/identity';
import { checkGroupsEnabled, listAllMyGroupExpenses } from '../api/groups';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, directionalColor, withAlpha, inkOnPastel } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomButton from '../components/CustomButton';
import TypeToLogBar from '../components/TypeToLogBar';
import ListRow from '../components/ListRow';
import SectionLabel from '../components/SectionLabel';
import AmbientBackground from '../components/AmbientBackground';
import IconButton from '../components/IconButton';
import { onExpenseChanged } from '../utils/expenseEvents';
import { computeNetWithPeople, AnalysisGroupSummary } from '../utils/dashboardTotals';
import { lastMonthsTrend, barFractions, monthOverMonthPercent } from '../utils/spendTrend';
import { shortDate } from '../utils/expenseInsights';
import { AddExpenseContext } from './AddExpenseScreen';

const formatCurrency = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const signedCurrency = (amount: number) =>
  amount === 0 ? '$0.00' : `${amount > 0 ? '+' : '−'}${formatCurrency(Math.abs(amount))}`;

function greeting(now: Date): string {
  const h = now.getHours();
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { userEmail, accessToken } = useAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();
  const now = useMemo(() => new Date(), []);
  const [refreshing, setRefreshing] = useState(false);
  const { openAddExpense } = useContext(AddExpenseContext);
  // Same key the Account screen would use; the greeting falls back to the email until it lands.
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: getProfile, enabled: !!accessToken, staleTime: 5 * 60_000 });

  const { data: monthlyData, isLoading: loading } = useQuery({
    queryKey: ['analysis', userEmail, now.getFullYear(), now.getMonth() + 1, 'combined'],
    queryFn: () => getAnalysis(accessToken!, userEmail!, { year: now.getFullYear(), month: now.getMonth() + 1, scope: 'combined' }),
    enabled: !!accessToken && !!userEmail,
  });

  const { data: groupsEnabled } = useQuery({
    queryKey: ['groupsEnabled'],
    queryFn: checkGroupsEnabled,
  });

  const { data: groupExpenses } = useQuery({
    queryKey: ['groupExpenses', userEmail],
    queryFn: () => listAllMyGroupExpenses().catch(() => []),
    enabled: !!accessToken && !!userEmail && !!groupsEnabled,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['analysis'] }),
      queryClient.invalidateQueries({ queryKey: ['groupExpenses'] }),
    ]);
    setRefreshing(false);
  };

  useEffect(() => {
    return onExpenseChanged(() => {
      queryClient.invalidateQueries({ queryKey: ['analysis'] });
      queryClient.invalidateQueries({ queryKey: ['groupExpenses'] });
    });
  }, [queryClient]);

  const recentExpenses = useMemo(() => {
    const personalRecent = Object.values(monthlyData?.category_expense_details || {}).flat();
    const groupRecent = (groupExpenses || []).map((e) => ({
      date: e.date,
      description: e.description,
      category: e.category,
      cost: e.my_share,
      groupName: e.group_name,
    }));
    return [...personalRecent, ...groupRecent]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);
  }, [monthlyData, groupExpenses]);

  // Under scope=combined, `total_expenses` is already personal + every group's my_share (see
  // backend AnalysisService._merge_legs) — the "true total" — so no client-side re-sum here.
  const groupSummaries: AnalysisGroupSummary[] = monthlyData?.group_summaries ?? [];
  const hasGroups = !!groupsEnabled && groupSummaries.length > 0;
  const total = monthlyData?.total_expenses || 0;
  const netWithPeople = computeNetWithPeople(groupSummaries);
  const owedToYou = groupSummaries.reduce((s, g) => s + Math.max(g.my_balance, 0), 0);

  const trend = useMemo(() => lastMonthsTrend(monthlyData?.monthly_trend, now), [monthlyData, now]);
  const fractions = useMemo(() => barFractions(trend), [trend]);
  const delta = monthOverMonthPercent(trend);

  const [whole, cents] = formatCurrency(total).split('.');
  const dateEyebrow = `${now.toLocaleString('en-US', { weekday: 'long' })} · ${now.getDate()} ${now.toLocaleString('en-US', { month: 'short' })}`;
  const firstName = firstNameOf(profile?.name, userEmail);

  return (
    <LinearGradient colors={theme.gradients.surface} style={styles.root}>
      <AmbientBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 160 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* ── Header: avatar → Account, date + greeting, bell → Activity ─────── */}
        <View style={styles.header}>
          <TouchableOpacity activeOpacity={0.75} onPress={() => navigation.navigate('Profile')} accessibilityRole="button" accessibilityLabel="Account">
            <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
              <Text style={styles.avatarText}>{initialOf(profile?.name, userEmail)}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <SectionLabel style={{ letterSpacing: 1.5 }}>{dateEyebrow}</SectionLabel>
            <Text style={styles.greeting} numberOfLines={1}>{greeting(now)}, {firstName}</Text>
          </View>
          <IconButton icon="notifications-outline" accessibilityLabel="Activity" onPress={() => navigation.navigate('Activity')} />
        </View>

        {/* ── Figure 1: spend this month + six-month history ─────────────────── */}
        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={theme.colors.primary} /></View>
        ) : (
          <View style={styles.block}>
            <SectionLabel>Spent in {now.toLocaleString('en-US', { month: 'long' })}</SectionLabel>
            <View style={styles.heroRow}>
              <Text style={styles.hero}>
                {whole}<Text style={styles.heroCents}>.{cents}</Text>
              </Text>
              {delta !== null && delta !== 0 && (
                // Spend going down is good news here, so the arrow follows direction and the
                // color follows meaning (less spend = success).
                <Text style={[styles.delta, { color: delta < 0 ? theme.colors.success : theme.colors.warning }]}>
                  {delta < 0 ? '↓' : '↑'} {Math.abs(delta)}%
                </Text>
              )}
            </View>

            <View style={styles.bars}>
              {trend.map((p, i) => (
                <View
                  key={p.key}
                  style={[
                    styles.bar,
                    {
                      height: `${Math.round(fractions[i] * 100)}%`,
                      backgroundColor: p.isCurrent
                        ? theme.colors.secondary
                        : i === trend.length - 2
                          ? withAlpha(theme.colors.primary, 0.45)
                          : theme.colors.surfaceSecondary,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.barLabels}>
              {trend.map((p) => (
                <Text key={p.key} style={[styles.barLabel, p.isCurrent && { color: theme.colors.primary }]}>{p.label}</Text>
              ))}
            </View>
          </View>
        )}

        {/* ── Figure 2: net with people (only once there's a group) ──────────── */}
        {hasGroups && (
          <>
            <View style={styles.rule} />
            <TouchableOpacity style={styles.netRow} onPress={() => navigation.navigate('GroupsTab')} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <SectionLabel>Net with people</SectionLabel>
                <Text style={[styles.net, { color: netWithPeople === 0 ? theme.colors.textTertiary : directionalColor(theme, netWithPeople) }]}>
                  {signedCurrency(netWithPeople)}
                </Text>
              </View>
              {owedToYou > 0 && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.owedLabel, { color: theme.colors.success }]}>owed to you</Text>
                  <Text style={styles.owedAmount}>{formatCurrency(owedToYou)}</Text>
                </View>
              )}
              <Text style={styles.chev}>›</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Ask / log bar ───────────────────────────────────────────────────── */}
        <TypeToLogBar />

        {/* ── Recent ──────────────────────────────────────────────────────────── */}
        <View style={styles.recentHeader}>
          <SectionLabel>Recent</SectionLabel>
          <TouchableOpacity onPress={() => navigation.navigate('Expenses')} activeOpacity={0.6}>
            <Text style={styles.all}>All</Text>
          </TouchableOpacity>
        </View>

        {recentExpenses.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No recent expenses</Text>
            <Text style={styles.emptySubtitle}>Add your first expense to see it here</Text>
            <CustomButton title="Add an Expense" onPress={openAddExpense} fullWidth={false} style={{ marginTop: 16, paddingHorizontal: 32 }} />
          </View>
        ) : (
          <View style={styles.list}>
            {recentExpenses.map((e, i) => (
              <ListRow
                key={`${e.date}-${i}`}
                category={e.category}
                title={e.description}
                meta={'groupName' in e && e.groupName ? `${shortDate(e.date)} · ${e.groupName}` : `${shortDate(e.date)} · ${e.category}`}
                amount={formatCurrency(e.cost)}
                onPress={() => navigation.navigate('Expenses')}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: theme.typography.fontFamily.bold, fontSize: 16, color: inkOnPastel },
  greeting: {
    fontFamily: theme.typography.fontFamily.bold, fontSize: 17, color: theme.colors.text,
    letterSpacing: -0.3, marginTop: 2, textTransform: 'capitalize',
  },
  loading: { height: 180, alignItems: 'center', justifyContent: 'center' },
  block: { marginTop: 4 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 6 },
  hero: {
    fontFamily: theme.typography.fontFamily.display, fontSize: 52, lineHeight: 54, letterSpacing: -2.3,
    color: theme.colors.text, fontVariant: ['tabular-nums'],
  },
  heroCents: { color: theme.colors.textTertiary },
  delta: { fontFamily: theme.typography.fontFamily.bold, fontSize: 14, paddingBottom: 8 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 40, marginTop: 16 },
  bar: { flex: 1, borderRadius: 4 },
  barLabels: { flexDirection: 'row', gap: 10, marginTop: 7 },
  barLabel: { flex: 1, textAlign: 'center', fontFamily: theme.typography.fontFamily.monoRegular, fontSize: 10, letterSpacing: 1, color: theme.colors.textQuaternary },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.borderLight, marginVertical: 18 },
  netRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  net: { fontFamily: theme.typography.fontFamily.display, fontSize: 28, letterSpacing: -1, marginTop: 4, fontVariant: ['tabular-nums'] },
  owedLabel: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 12 },
  owedAmount: { fontFamily: theme.typography.fontFamily.bold, fontSize: 16, color: theme.colors.text, marginTop: 2, fontVariant: ['tabular-nums'] },
  chev: { fontSize: 22, color: theme.colors.textQuaternary },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  all: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 13, color: theme.colors.primary },
  list: { marginBottom: 8 },
  empty: { alignItems: 'center', paddingVertical: 36 },
  emptyTitle: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 17, color: theme.colors.text, marginBottom: 6 },
  emptySubtitle: { fontFamily: theme.typography.fontFamily.regular, fontSize: 15, color: theme.colors.textTertiary },
});
