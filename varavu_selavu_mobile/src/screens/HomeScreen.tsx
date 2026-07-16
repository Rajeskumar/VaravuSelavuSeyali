import React, { useState, useEffect, useMemo, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { checkGroupsEnabled, listAllMyGroupExpenses, UnifiedGroupExpenseRow } from '../api/groups';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, directionalColor } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomButton from '../components/CustomButton';
import SegmentedTabs from '../components/SegmentedTabs';
import TypeToLogBar from '../components/TypeToLogBar';
import { showToast } from '../components/Toast';
import { onExpenseChanged } from '../utils/expenseEvents';
import { computeIPaidTotal, computeNetWithPeople, AnalysisGroupSummary } from '../utils/dashboardTotals';
import { AddExpenseContext } from './AddExpenseScreen';

// ─── Category icon map ───────────────────────────────────────────────────────
const categoryEmojis: Record<string, string> = {
  food: '🍕', groceries: '🛒', transport: '🚗', entertainment: '🎬',
  shopping: '🛍️', health: '🏥', utilities: '💡', rent: '🏠',
  travel: '✈️', education: '📚', subscription: '📱', salary: '💰',
  investment: '📈', other: '📋',
};

const categoryColors: Record<string, string> = {
  food: '#FF6B6B', groceries: '#4ECDC4', transport: '#45B7D1', entertainment: '#A29BFE',
  shopping: '#FFA07A', health: '#55EFC4', utilities: '#FFEAA7', rent: '#74B9FF',
  travel: '#FD79A8', education: '#6C5CE7', subscription: '#00B894', other: '#636E72',
};

function getCategoryEmoji(category: string): string {
  return categoryEmojis[category?.toLowerCase().trim()] || '💳';
}

function getCategoryColor(category: string): string {
  return categoryColors[category?.toLowerCase().trim()] || '#636E72';
}

const formatCurrency = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Sub-components ───────────────────────────────────────────────────────────

/** TrackSpense v3 Mobile mock's hero card — spend total + lens + "personal + group shares"/"I
 * paid" sub-line + Net with people, nothing else (no month-over-month delta line — the mock has
 * none). */
function HeroCard({
  monthlyTotal,
  personalTotal,
  showLens,
  lens,
  onLensChange,
  netWithPeople,
  onNetWithPeoplePress,
}: {
  monthlyTotal: number;
  /** `spend_breakdown.personal` — feeds the "$X personal + group shares" sub-line, mirroring
   * the mock's `dbSpendSub` for the "share" lens. */
  personalTotal: number;
  /** TrackSpense v3: lens toggle + "Net with people" only render when the user has at least
   * one active group (mirrors web's `hasGroups` gate on `TrueTotalHero.tsx`). */
  showLens: boolean;
  lens: 'share' | 'paid';
  onLensChange: (lens: 'share' | 'paid') => void;
  netWithPeople: number;
  onNetWithPeoplePress: () => void;
}) {
  const { theme } = useAppTheme();
  const heroStyles = useMemo(() => createHeroStyles(theme), [theme]);
  // Mock's `dbSpendLabel`/`dbSpendSub`: the label and the line under the amount both flip with
  // the lens, not just the number itself.
  const spendLabel = lens === 'paid' ? 'Money out of pocket this month' : 'Spent this month — your true total';
  const spendSub = lens === 'paid'
    ? 'includes money fronted for others'
    : `${formatCurrency(personalTotal)} personal + group shares`;
  return (
    <View style={heroStyles.card}>
      {/* TrackSpense v3 Mobile mock's hero is a flat white/hairline-bordered card (matches the
          rest of the Slate system), not the pre-v3 LinearGradient treatment this used to have —
          every child below is styled dark-on-white now instead of white-on-gradient. */}
      {showLens && (
        <View style={heroStyles.lensWrap}>
          <SegmentedTabs<'share' | 'paid'>
            value={lens}
            onChange={onLensChange}
            options={[{ value: 'share', label: 'My expenses' }, { value: 'paid', label: 'I paid' }]}
          />
        </View>
      )}

      <Text style={heroStyles.spendLabel}>{spendLabel}</Text>
      <Text style={heroStyles.amount}>{formatCurrency(monthlyTotal)}</Text>
      {showLens && <Text style={heroStyles.spendSub}>{spendSub}</Text>}

      {/* Net with people — tapping jumps to the Groups tab's People sub-tab. */}
      {showLens && (
        <TouchableOpacity style={heroStyles.netRow} onPress={onNetWithPeoplePress} activeOpacity={0.7}>
          <View>
            <Text style={heroStyles.netLabel}>Net with people</Text>
            <Text
              style={[
                heroStyles.netAmount,
                { color: netWithPeople === 0 ? theme.colors.textTertiary : directionalColor(theme, netWithPeople) },
              ]}
            >
              {netWithPeople === 0 ? '$0.00' : `${netWithPeople > 0 ? '+' : '−'}${formatCurrency(Math.abs(netWithPeople))}`}
            </Text>
          </View>
          <Text style={heroStyles.netArrow}>→</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createHeroStyles = (theme: AppTheme) => StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderLight,
    padding: 18,
  },
  lensWrap: {
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  spendLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  amount: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: 38,
    color: theme.colors.text,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  spendSub: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
    marginTop: 14,
    paddingTop: 12,
  },
  netLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  netAmount: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: 24,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  netArrow: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: theme.colors.primary,
  },
});

/** TrackSpense v3 Mobile mock's "My Groups" chips row — one row per active group with its net,
 * tapping navigates straight to that group's detail screen. Directly below the hero, using
 * `group_summaries` already fetched for the hero itself (no extra API call). */
function GroupChipsRow({ groupSummaries, onPress }: { groupSummaries: AnalysisGroupSummary[]; onPress: (groupId: string) => void }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createGroupChipsStyles(theme), [theme]);
  if (groupSummaries.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {groupSummaries.map((g) => (
        <TouchableOpacity key={g.group_id} style={styles.chip} onPress={() => onPress(g.group_id)} activeOpacity={0.7}>
          <Text style={styles.chipName} numberOfLines={1}>{g.name}</Text>
          <Text
            style={[
              styles.chipNet,
              { color: g.my_balance === 0 ? theme.colors.textTertiary : directionalColor(theme, g.my_balance) },
            ]}
          >
            {g.my_balance === 0 ? 'settled' : `${g.my_balance > 0 ? '+' : '−'}${formatCurrency(Math.abs(g.my_balance))}`}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const createGroupChipsStyles = (theme: AppTheme) => StyleSheet.create({
  wrap: { marginHorizontal: 20, marginBottom: 16, gap: 8 },
  chip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  chipName: { fontFamily: 'Inter-SemiBold', fontSize: 13.5, color: theme.colors.text, flex: 1, marginRight: 8 },
  chipNet: { fontFamily: 'Inter-Bold', fontSize: 13 },
});

/** TrackSpense v3 Mobile mock's compact "RECENT ⋯ See all ›" section header — the only section
 * header the mock has on Home, so this no longer needs to be a generic large-title component
 * (it was previously shared with the now-removed "Analytics" section below). */
function SectionHeader({
  title,
  onSeeAll,
}: {
  title: string;
  onSeeAll?: () => void;
}) {
  const { theme } = useAppTheme();
  const sectionStyles = useMemo(() => createSectionStyles(theme), [theme]);
  return (
    <View style={sectionStyles.row}>
      <Text style={sectionStyles.title}>{title.toUpperCase()}</Text>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.6}>
          <Text style={sectionStyles.seeAll}>See all ›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createSectionStyles = (theme: AppTheme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    color: theme.colors.textTertiary,
    letterSpacing: 0.8,
  },
  seeAll: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
});

/** iOS-style receipt list item */
function ExpenseRow({
  expense,
  isLast,
}: {
  expense: any;
  isLast: boolean;
}) {
  const { theme } = useAppTheme();
  const rowStyles = useMemo(() => createRowStyles(theme), [theme]);
  const color = getCategoryColor(expense.category);
  return (
    <>
      <View style={rowStyles.row}>
        <View style={[rowStyles.iconBg, { backgroundColor: color + '20' }]}>
          <Text style={rowStyles.iconText}>{getCategoryEmoji(expense.category)}</Text>
        </View>
        <View style={rowStyles.info}>
          <Text style={rowStyles.title} numberOfLines={1}>{expense.description}</Text>
          <Text style={rowStyles.subtitle}>
            {expense.groupName ? `${expense.groupName} · my expense` : `${expense.category} · ${expense.date}`}
          </Text>
        </View>
        <Text style={rowStyles.amount}>−{formatCurrency(expense.cost)}</Text>
      </View>
      {!isLast && <View style={rowStyles.separator} />}
    </>
  );
}

const createRowStyles = (theme: AppTheme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 64,
  },
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconText: { fontSize: 20 },
  info: { flex: 1, marginRight: 8 },
  title: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 3,
  },
  subtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  amount: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.borderLight,
    marginLeft: 74,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { userEmail, accessToken } = useAuth();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();
  const now = useMemo(() => new Date(), []);
  const [refreshing, setRefreshing] = useState(false);
  const [lens, setLens] = useState<'share' | 'paid'>('share');
  const { openAddExpense } = useContext(AddExpenseContext);
  
  const { data: monthlyData, isLoading: loadingMonth, refetch: refetchMonth } = useQuery({
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

  const loading = loadingMonth;

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
    const groupRecent = (groupExpenses || []).map(e => ({
      date: e.date,
      description: e.description,
      category: e.category,
      cost: e.my_share,
      groupName: e.group_name,
    }));
    return [...personalRecent, ...groupRecent]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);
  }, [monthlyData, groupExpenses]);

  // TrackSpense v3: under scope=combined, `total_expenses` is already personal + every group's
  // my_share (see backend AnalysisService._merge_legs) — i.e. it's already the "My expenses"
  // lens total, no client-side re-sum needed. Only "I paid" needs a client-side compute, since
  // the backend doesn't precompute that combination.
  const groupSummaries: AnalysisGroupSummary[] = monthlyData?.group_summaries ?? [];
  const hasGroups = !!groupsEnabled && groupSummaries.length > 0;
  const monthlyTotal = lens === 'paid'
    ? computeIPaidTotal(monthlyData?.spend_breakdown?.personal ?? 0, groupSummaries)
    : (monthlyData?.total_expenses || 0);
  const netWithPeople = computeNetWithPeople(groupSummaries);

  // TrackSpense v3 Mobile mock's greeting: a period eyebrow ("July 2026") + "Hi, {name}" —
  // replaces the pre-v3 time-of-day "Good evening, testlocaluser" format.
  const monthYearLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const firstName = userEmail?.split('@')[0] || 'there';

  return (
    <LinearGradient colors={theme.gradients.surface} style={styles.root}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 160 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
      >
        {/* ── Greeting Header ────────────────────────────────── */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.greetingEyebrow}>{monthYearLabel.toUpperCase()}</Text>
            <Text style={styles.greetingName}>Hi, {firstName}</Text>
          </View>
          <TouchableOpacity
            style={styles.avatarBtn}
            activeOpacity={0.75}
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.avatarText}>{userEmail?.charAt(0).toUpperCase() || '?'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Type to log (TrackSpense v3) ──────────────────── */}
        <TypeToLogBar />

        {/* ── Hero Card ─────────────────────────────────────── */}
        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <HeroCard
            monthlyTotal={monthlyTotal}
            personalTotal={monthlyData?.spend_breakdown?.personal ?? 0}
            showLens={hasGroups}
            lens={lens}
            onLensChange={setLens}
            netWithPeople={netWithPeople}
            onNetWithPeoplePress={() => navigation.navigate('GroupsTab', { initialTab: 'people' })}
          />
        )}

        {/* ── My Groups (TrackSpense v3) ────────────────────── */}
        <GroupChipsRow groupSummaries={groupSummaries} onPress={(groupId) => navigation.navigate('GroupDetail', { groupId })} />

        {/* ── Recent Activity ───────────────────────────────── */}
        <SectionHeader
          title="Recent"
          onSeeAll={() => navigation.navigate('Expenses')}
        />

        {recentExpenses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyTitle}>No recent expenses</Text>
            <Text style={styles.emptySubtitle}>Add your first expense to see it here</Text>
            <CustomButton
              title="Add an Expense"
              onPress={openAddExpense}
              fullWidth={false}
              style={{ marginTop: 16, paddingHorizontal: 32 }}
            />
          </View>
        ) : (
          <View style={styles.listCard}>
            {recentExpenses.map((expense, i) => (
              <ExpenseRow
                key={`${expense.date}-${i}`}
                expense={expense}
                isLast={i === recentExpenses.length - 1}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 0,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  greetingEyebrow: {
    fontFamily: 'Inter-Bold',
    fontSize: 11,
    letterSpacing: 0.7,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  greetingName: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: 22,
    color: theme.colors.text,
    letterSpacing: -0.3,
    textTransform: 'capitalize',
  },
  avatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.sm,
  },
  avatarText: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
    color: '#fff',
  },
  loadingCard: {
    marginHorizontal: 20,
    height: 180,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    ...theme.shadows.md,
  },
  listCard: {
    marginHorizontal: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden',
    marginBottom: 8,
    ...theme.shadows.sm,
  },
  emptyCard: {
    marginHorizontal: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: 40,
    alignItems: 'center',
    ...theme.shadows.xs,
  },
  emptyIcon: { fontSize: 44, marginBottom: 14 },
  emptyTitle: { fontFamily: 'Inter-SemiBold', fontSize: 17, color: theme.colors.text, marginBottom: 6 },
  emptySubtitle: { fontFamily: 'Inter-Regular', fontSize: 15, color: theme.colors.textTertiary },
});
