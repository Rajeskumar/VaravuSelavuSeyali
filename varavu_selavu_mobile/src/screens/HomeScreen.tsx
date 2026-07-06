import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { getAnalysis, AnalysisResponse } from '../api/analysis';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CategoryDonutChart from '../components/CategoryDonutChart';
import CategoryRankedList from '../components/CategoryRankedList';
import TrendLineChart from '../components/TrendLineChart';

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

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const formatCurrency = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Prominent "Today" card style hero */
function HeroCard({ yearlyTotal, monthlyTotal }: { yearlyTotal: number; monthlyTotal: number }) {
  const { theme } = useAppTheme();
  const heroStyles = useMemo(() => createHeroStyles(theme), [theme]);
  const currentMonth = new Date().toLocaleString('default', { month: 'long' });
  return (
    <LinearGradient
      colors={[theme.colors.gradientStart, theme.colors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={heroStyles.card}
    >
      {/* Top row */}
      <View style={heroStyles.topRow}>
        <Text style={heroStyles.eyebrow}>TOTAL SPENT THIS YEAR</Text>
        <View style={heroStyles.badge}>
          <Text style={heroStyles.badgeText}>{new Date().getFullYear()}</Text>
        </View>
      </View>

      {/* Big number */}
      <Text style={heroStyles.amount}>{formatCurrency(yearlyTotal)}</Text>

      {/* Divider line */}
      <View style={heroStyles.divider} />

      {/* Bottom stats row */}
      <View style={heroStyles.statsRow}>
        <View style={heroStyles.statBlock}>
          <Text style={heroStyles.statLabel}>{currentMonth}</Text>
          <Text style={heroStyles.statValue}>{formatCurrency(monthlyTotal)}</Text>
        </View>
        <View style={heroStyles.statDivider} />
        <View style={heroStyles.statBlock}>
          <Text style={heroStyles.statLabel}>Monthly Avg</Text>
          <Text style={heroStyles.statValue}>
            {formatCurrency(yearlyTotal / Math.max(new Date().getMonth() + 1, 1))}
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const createHeroStyles = (theme: AppTheme) => StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 28,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xxl,
    padding: 24,
    ...theme.shadows.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  eyebrow: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.8,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  amount: {
    fontFamily: 'Inter-Black',
    fontSize: 42,
    color: '#FFFFFF',
    letterSpacing: -1.5,
    marginBottom: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statBlock: { flex: 1 },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 20,
  },
  statLabel: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  statValue: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
});

/** Standard section header with optional "See All" */
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
      <Text style={sectionStyles.title}>{title}</Text>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} activeOpacity={0.6}>
          <Text style={sectionStyles.seeAll}>See All</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createSectionStyles = (theme: AppTheme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 22,
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  seeAll: {
    fontFamily: 'Inter-Regular',
    fontSize: 17,
    color: theme.colors.primary,
  },
});

/** Quick action pill buttons */
function QuickActions({ navigation }: { navigation: any }) {
  const { theme } = useAppTheme();
  const qaStyles = useMemo(() => createQaStyles(theme), [theme]);
  const actions = [
    { icon: '🛒', label: 'Items', screen: 'ItemInsights', color: theme.colors.primarySurface },
    { icon: '🏪', label: 'Merchants', screen: 'MerchantInsights', color: theme.colors.successSurface },
    { icon: '📊', label: 'Stats', screen: 'Analysis', color: theme.colors.errorSurface },
  ];

  return (
    <View style={qaStyles.row}>
      {actions.map((action) => (
        <TouchableOpacity
          key={action.label}
          style={qaStyles.pill}
          onPress={() => navigation.navigate(action.screen)}
          activeOpacity={0.75}
        >
          <View style={[qaStyles.iconWrap, { backgroundColor: action.color }]}>
            <Text style={qaStyles.icon}>{action.icon}</Text>
          </View>
          <Text style={qaStyles.label}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const createQaStyles = (theme: AppTheme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 32,
    gap: 12,
  },
  pill: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  icon: { fontSize: 22 },
  label: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 13,
    color: theme.colors.text,
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
          <Text style={rowStyles.subtitle}>{expense.category} · {expense.date}</Text>
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
  const [yearlyData, setYearlyData] = useState<AnalysisResponse | null>(null);
  const [monthlyData, setMonthlyData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (!accessToken || !userEmail) return;
    try {
      const now = new Date();
      const [yearResult, monthResult] = await Promise.all([
        getAnalysis(accessToken, userEmail, { year: now.getFullYear() }),
        getAnalysis(accessToken, userEmail, { year: now.getFullYear(), month: now.getMonth() + 1 }),
      ]);
      setYearlyData(yearResult);
      setMonthlyData(monthResult);
    } catch (e) {
      console.error('fetchData error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isFocused) { setLoading(true); fetchData(); }
  }, [isFocused]);

  const donutData = useMemo(() => {
    if (!monthlyData?.category_totals) return [];
    return monthlyData.category_totals.map((ct) => {
      const details = monthlyData.category_expense_details?.[ct.category] || [];
      const subMap: Record<string, number> = {};
      details.forEach((d) => { subMap[d.category || 'Other'] = (subMap[d.category || 'Other'] || 0) + d.cost; });
      const subcategories = Object.entries(subMap).map(([name, total]) => ({ name, total }));
      return { category: ct.category, total: ct.total, subcategories: subcategories.length > 1 ? subcategories : undefined };
    });
  }, [monthlyData]);

  const recentExpenses = useMemo(() => {
    if (!monthlyData?.category_expense_details) return [];
    return Object.values(monthlyData.category_expense_details)
      .flat()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);
  }, [monthlyData]);

  const yearlyTotal = yearlyData?.total_expenses || 0;
  const monthlyTotal = monthlyData?.total_expenses || 0;

  return (
    <LinearGradient colors={theme.gradients.surface} style={styles.root}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 160 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData(); }}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* ── Personalized Greeting Header ─────────────────── */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.greetingSmall}>{getTimeOfDay()},</Text>
            <Text style={styles.greetingName}>{userEmail?.split('@')[0] || 'there'}</Text>
          </View>
          <TouchableOpacity style={styles.avatarBtn} activeOpacity={0.75}>
            <Text style={styles.avatarText}>{userEmail?.charAt(0).toUpperCase() || '?'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Hero Card ─────────────────────────────────────── */}
        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <HeroCard yearlyTotal={yearlyTotal} monthlyTotal={monthlyTotal} />
        )}

        {/* ── Quick Actions ─────────────────────────────────── */}
        <QuickActions navigation={navigation} />

        {/* ── Recent Activity ───────────────────────────────── */}
        <SectionHeader
          title="Recent"
          onSeeAll={() => navigation.navigate('Expenses')}
        />

        {recentExpenses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyTitle}>No recent expenses</Text>
            <Text style={styles.emptySubtitle}>Tap the + button to add one</Text>
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

        {/* ── Analytics ─────────────────────────────────────── */}
        {/* TS-DES-105: ranked list leads (Design Spec §4.3's "demote the donut" direction); the
            donut renders as a small secondary ornament in the same card, not the primary visual. */}
        <View style={styles.analyticsSpacer} />
        <SectionHeader title="Analytics" />
        <View style={styles.chartPad}>
          <CategoryRankedList data={monthlyData?.category_totals || []} title="Monthly Breakdown" />
          <View style={styles.donutOrnamentRow}>
            <CategoryDonutChart data={donutData} title="At a glance" compact />
          </View>
          <TrendLineChart title="6-Month Trend" />
        </View>
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
    marginBottom: 24,
  },
  greetingSmall: {
    fontFamily: 'Inter-Regular',
    fontSize: 17,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  greetingName: {
    fontFamily: 'Inter-Black',
    fontSize: 34,
    color: theme.colors.text,
    letterSpacing: -0.5,
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
  analyticsSpacer: { height: 24 },
  chartPad: { paddingHorizontal: 20 },
  donutOrnamentRow: { alignItems: 'flex-start' },
});
