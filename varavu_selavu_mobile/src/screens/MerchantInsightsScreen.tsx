import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import SimpleSelect from '../components/SimpleSelect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import {
  getTopMerchants, getMerchantDetail,
  MerchantInsightSummary, MerchantInsightDetail,
} from '../api/analytics';
import { ListSkeleton, HeroSkeleton } from '../components/SkeletonLoader';
import { AddExpenseContext } from './AddExpenseScreen';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function confidenceColor(theme: AppTheme, confidence?: string | null) {
  const c = (confidence || '').toLowerCase();
  if (c === 'high') return theme.colors.success;
  if (c === 'medium') return theme.colors.warning;
  return theme.colors.textTertiary;
}

export default function MerchantInsightsScreen() {
  const { userEmail } = useAuth();
  const navigation = useNavigation<any>();
  const { openAddExpense } = useContext(AddExpenseContext);
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [merchants, setMerchants] = useState<MerchantInsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantInsightDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Keep picker values as strings across platforms to avoid blank selection issues
  const [year, setYear] = useState<string>('all');
  const [month, setMonth] = useState<string>('all');

  const activeFilters = {
    year: year === 'all' ? undefined : Number(year),
    month: month === 'all' ? undefined : Number(month),
  };

  const fetchMerchants = useCallback(async () => {
    if (!userEmail) return;
    try {
      const data = await getTopMerchants(userEmail, activeFilters);
      setMerchants(data);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail, year, month]);

  useEffect(() => {
    setLoading(true);
    fetchMerchants();
  }, [fetchMerchants]);

  const onRefresh = () => { setRefreshing(true); fetchMerchants(); };

  const handleSelectMerchant = async (m: MerchantInsightSummary) => {
    if (!userEmail) return;
    setDetailLoading(true);
    setSelectedMerchant(null);
    try {
      const detail = await getMerchantDetail(userEmail, m.merchant_name, activeFilters);
      setSelectedMerchant(detail);
    } catch {
      // non-fatal
    } finally {
      setDetailLoading(false);
    }
  };

  const askAi = (question: string) => {
    navigation.navigate('AI Analyst', { initialQuery: question });
  };

  const years = ['all', ...Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i))];
  const months = ['all', ...Array.from({ length: 12 }, (_, i) => String(i + 1))];
  const yearOptions = years.map(y => ({ value: y, label: y === 'all' ? 'All' : y }));
  const monthOptions = months.map(m => ({ value: m, label: m === 'all' ? 'All' : MONTH_NAMES[Number(m) - 1] }));

  // Summary KPIs derived from the currently filtered merchant list
  const summary = useMemo(() => {
    if (merchants.length === 0) return null;
    const totalSpend = merchants.reduce((sum, m) => sum + (m.total_spent || 0), 0);
    const totalTransactions = merchants.reduce((sum, m) => sum + (m.transaction_count || 0), 0);
    const topMerchant = merchants[0];
    const biggestRiser = merchants
      .filter((m) => (m.month_over_month_change_percent ?? 0) > 0)
      .sort((a, b) => (b.month_over_month_change_percent ?? 0) - (a.month_over_month_change_percent ?? 0))[0];
    return {
      totalSpend,
      avgBasket: totalTransactions > 0 ? totalSpend / totalTransactions : 0,
      topMerchant,
      biggestRiser,
    };
  }, [merchants]);

  const yearlyRollup = useMemo(() => {
    if (!selectedMerchant) return [];
    const byYear = new Map<number, { total_spent: number; transaction_count: number }>();
    for (const a of selectedMerchant.monthly_aggregates) {
      const existing = byYear.get(a.year) || { total_spent: 0, transaction_count: 0 };
      existing.total_spent += a.total_spent;
      existing.transaction_count += a.transaction_count;
      byYear.set(a.year, existing);
    }
    return Array.from(byYear.entries())
      .map(([yr, v]) => ({ year: yr, ...v }))
      .sort((a, b) => b.year - a.year);
  }, [selectedMerchant]);

  if (loading && !refreshing) {
    return (
      <LinearGradient colors={theme.gradients.surface} style={[styles.container, { paddingTop: insets.top }]}>
         <View style={styles.header}>
            <View>
              <Text style={styles.screenTitle}>Merchant Insights</Text>
              <Text style={styles.screenSubtitle}>Your top merchants by total spend</Text>
            </View>
          </View>
        <View style={{ paddingHorizontal: 16 }}>
           <ListSkeleton count={5} />
        </View>
      </LinearGradient>
    );
  }

  // Detail view
  if (selectedMerchant) {
    const mom = selectedMerchant.month_over_month_change_percent;
    return (
      <LinearGradient colors={theme.gradients.surface} style={styles.container}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingTop: insets.top }}>
        <View style={styles.detailTopRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedMerchant(null)}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.primary} />
            <Text style={styles.backText}>Merchants</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.askAiPill}
            onPress={() => askAi(`Tell me about my spending at ${selectedMerchant.merchant_name} — trends and how it compares to my other merchants.`)}
          >
            <Ionicons name="sparkles" size={14} color={theme.colors.primary} />
            <Text style={styles.askAiPillText}>Ask AI</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.detailHeader}>
          <View style={styles.detailIconBadge}>
            <Ionicons name="storefront" size={22} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.detailName}>{selectedMerchant.merchant_name}</Text>
            <Text style={styles.detailTotal}>
              ${selectedMerchant.total_spent.toFixed(2)} · {selectedMerchant.transaction_count} transactions
            </Text>
          </View>
        </View>

        {/* Summary stats */}
        <View style={styles.card}>
          <View style={styles.statsGrid}>
            <View style={styles.statTile}>
              <Text style={styles.statLabel}>Avg Basket</Text>
              <Text style={styles.statValue}>${(selectedMerchant.average_transaction_amount ?? 0).toFixed(2)}</Text>
            </View>
            {selectedMerchant.highest_transaction && (
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Highest</Text>
                <Text style={styles.statValue}>${selectedMerchant.highest_transaction.amount.toFixed(2)}</Text>
              </View>
            )}
            {selectedMerchant.spend_share_percent != null && (
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Share of Spend</Text>
                <Text style={styles.statValue}>{selectedMerchant.spend_share_percent.toFixed(1)}%</Text>
              </View>
            )}
          </View>
          {mom != null && (
            <View style={[styles.momChip, { backgroundColor: mom >= 0 ? `${theme.colors.error}1A` : `${theme.colors.success}1A` }]}>
              <Ionicons name={mom >= 0 ? 'trending-up' : 'trending-down'} size={14} color={mom >= 0 ? theme.colors.error : theme.colors.success} />
              <Text style={[styles.momChipText, { color: mom >= 0 ? theme.colors.error : theme.colors.success }]}>
                {mom >= 0 ? '+' : ''}{mom.toFixed(1)}% vs last period
              </Text>
            </View>
          )}
        </View>

        {/* Yearly rollup */}
        {yearlyRollup.length > 1 && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="calendar" size={16} color={theme.colors.text} />
              <Text style={styles.cardTitle}>Yearly Summary</Text>
            </View>
            <View style={styles.yearlyRow}>
              {yearlyRollup.map((y) => (
                <View key={y.year} style={styles.yearlyTile}>
                  <Text style={styles.statLabel}>{y.year}</Text>
                  <Text style={styles.statValue}>${y.total_spent.toFixed(2)}</Text>
                  <Text style={styles.itemMeta}>{y.transaction_count} transactions</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Monthly Aggregates */}
        {selectedMerchant.monthly_aggregates.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="bar-chart" size={16} color={theme.colors.text} />
              <Text style={styles.cardTitle}>Monthly Spending</Text>
            </View>
            {selectedMerchant.monthly_aggregates.map((a, i) => {
              const maxSpent = Math.max(...selectedMerchant.monthly_aggregates.map(x => x.total_spent));
              const barWidth = maxSpent > 0 ? (a.total_spent / maxSpent) * 100 : 0;
              return (
                <View key={i} style={styles.aggRow}>
                  <Text style={styles.aggLabel}>
                    {MONTH_NAMES[a.month - 1]} {a.year}
                  </Text>
                  <View style={styles.barContainer}>
                    <View style={[styles.bar, { width: `${barWidth}%` }]} />
                  </View>
                  <Text style={styles.aggValue}>${a.total_spent.toFixed(2)}</Text>
                </View>
              );
            })}
          </View>
        ) : (
            <View style={styles.card}>
               <View style={styles.cardTitleRow}>
                 <Ionicons name="bar-chart" size={16} color={theme.colors.text} />
                 <Text style={styles.cardTitle}>Monthly Spending</Text>
               </View>
               <View style={styles.emptyDetailState}>
                 <Text style={styles.emptyDetailText}>Not enough history to show trends yet.</Text>
                 <Text style={styles.emptyDetailSubtext}>Continue tracking expenses to build insights.</Text>
               </View>
            </View>
        )}

        {/* Recent transactions */}
        {selectedMerchant.recent_transactions && selectedMerchant.recent_transactions.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="receipt" size={16} color={theme.colors.text} />
              <Text style={styles.cardTitle}>Recent Transactions</Text>
            </View>
            {selectedMerchant.recent_transactions.map((t, i) => (
              <View key={i} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{t.description || selectedMerchant.merchant_name}</Text>
                  <Text style={styles.itemMeta}>{t.date ? new Date(t.date).toLocaleDateString() : '—'}</Text>
                </View>
                <Text style={styles.itemAvg}>${t.amount.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Items Bought */}
        {selectedMerchant.items_bought.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="bag-handle" size={16} color={theme.colors.text} />
              <Text style={styles.cardTitle}>Items Bought Here</Text>
            </View>
            {selectedMerchant.items_bought.map((item, i) => (
              <View key={i} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.item_name}</Text>
                  <Text style={styles.itemMeta}>
                    {item.purchase_count}x · Qty {item.total_quantity}
                  </Text>
                </View>
                <Text style={styles.itemAvg}>Avg ${item.avg_price.toFixed(2)}</Text>
              </View>
            ))}
             <Text style={styles.trustCopy}>
                Item averages represent actual purchase history extracted from receipts.
            </Text>
          </View>
        )}

      </ScrollView>
      </LinearGradient>
    );
  }

  // List view
  return (
    <LinearGradient colors={theme.gradients.surface} style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>Merchant Insights</Text>
          <Text style={styles.screenSubtitle}>Your top merchants by total spend</Text>
        </View>
      </View>
      <View style={styles.filters}>
        <View style={styles.pickerContainer}>
          <SimpleSelect label="Year" value={year} onChange={setYear} options={yearOptions} />
        </View>
        <View style={styles.pickerContainer}>
          <SimpleSelect label="Month" value={month} onChange={setMonth} options={monthOptions} />
        </View>
      </View>

      {merchants.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="storefront-outline" size={48} color={theme.colors.textTertiary} />
          <Text style={styles.emptyText}>No merchant data found</Text>
          <Text style={styles.emptySubtext}>Add merchant names to your expenses to improve merchant insights.</Text>
           <TouchableOpacity style={styles.ctaButton} onPress={openAddExpense}>
              <Text style={styles.ctaButtonText}>Add an Expense</Text>
           </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={merchants}
          keyExtractor={(m) => m.merchant_name}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
          ListHeaderComponent={summary ? (
            <View style={styles.kpiGrid}>
              <View style={styles.kpiTile}>
                <View style={styles.kpiLabelRow}>
                  <Ionicons name="storefront" size={14} color={theme.colors.textSecondary} />
                  <Text style={styles.kpiLabel}>Top Merchant</Text>
                </View>
                <Text style={styles.kpiValue} numberOfLines={1}>{summary.topMerchant.merchant_name}</Text>
                <Text style={styles.kpiSub}>${summary.topMerchant.total_spent.toFixed(2)}</Text>
              </View>
              <View style={styles.kpiTile}>
                <View style={styles.kpiLabelRow}>
                  <Ionicons name="cash" size={14} color={theme.colors.textSecondary} />
                  <Text style={styles.kpiLabel}>Total Spend</Text>
                </View>
                <Text style={styles.kpiValue}>${summary.totalSpend.toFixed(2)}</Text>
                <Text style={styles.kpiSub}>across {merchants.length} merchants</Text>
              </View>
              <View style={styles.kpiTile}>
                <View style={styles.kpiLabelRow}>
                  <Ionicons name="receipt" size={14} color={theme.colors.textSecondary} />
                  <Text style={styles.kpiLabel}>Avg Basket</Text>
                </View>
                <Text style={styles.kpiValue}>${summary.avgBasket.toFixed(2)}</Text>
                <Text style={styles.kpiSub}>per transaction</Text>
              </View>
              <View style={styles.kpiTile}>
                <View style={styles.kpiLabelRow}>
                  <Ionicons name="trending-up" size={14} color={theme.colors.textSecondary} />
                  <Text style={styles.kpiLabel}>Biggest Riser</Text>
                </View>
                <Text style={styles.kpiValue} numberOfLines={1}>{summary.biggestRiser ? summary.biggestRiser.merchant_name : '—'}</Text>
                <Text style={[styles.kpiSub, summary.biggestRiser && { color: theme.colors.error, fontWeight: '700' }]}>
                  {summary.biggestRiser ? `+${(summary.biggestRiser.month_over_month_change_percent ?? 0).toFixed(1)}%` : 'No change data'}
                </Text>
              </View>
            </View>
          ) : null}
          renderItem={({ item: m }) => (
            <TouchableOpacity style={styles.merchantCard} onPress={() => handleSelectMerchant(m)} activeOpacity={0.7}>
              <View style={styles.merchantIcon}>
                <Ionicons name="storefront" size={20} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.merchantName}>{m.merchant_name}</Text>
                  {m.confidence && (
                    <View style={[styles.confidenceDot, { backgroundColor: confidenceColor(theme, m.confidence) }]} />
                  )}
                </View>
                <Text style={styles.merchantMeta}>{m.transaction_count} transactions</Text>
              </View>
              <View style={styles.merchantRight}>
                {m.month_over_month_change_percent != null && (
                  <View style={styles.momMiniChip}>
                    <Ionicons
                      name={m.month_over_month_change_percent >= 0 ? 'trending-up' : 'trending-down'}
                      size={11}
                      color={m.month_over_month_change_percent >= 0 ? theme.colors.error : theme.colors.success}
                    />
                    <Text style={[styles.momMiniChipText, { color: m.month_over_month_change_percent >= 0 ? theme.colors.error : theme.colors.success }]}>
                      {m.month_over_month_change_percent >= 0 ? '+' : ''}{m.month_over_month_change_percent.toFixed(1)}%
                    </Text>
                  </View>
                )}
                <Text style={styles.merchantTotal}>${m.total_spent.toFixed(2)}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {detailLoading && (
        <View style={styles.overlay}>
           <View style={{ backgroundColor: theme.colors.surface, padding: 24, borderRadius: 16, alignItems: 'center' }}>
               <ActivityIndicator size="large" color={theme.colors.primary} />
               <Text style={{ marginTop: 12, color: theme.colors.textSecondary, fontWeight: '500' }}>Loading insights...</Text>
           </View>
        </View>
      )}
    </LinearGradient>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  header: { paddingHorizontal: 16, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  screenTitle: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  screenSubtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 12 },
  filters: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12, gap: 8 },
  pickerContainer: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 8, padding: 8, ...theme.shadows.sm },
  pickerLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  picker: { height: 40, color: theme.colors.text },
  // KPI grid
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  kpiTile: {
    width: '48%', backgroundColor: theme.colors.surface, borderRadius: 14, padding: 12,
    ...theme.shadows.sm,
  },
  kpiLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  kpiLabel: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600' },
  kpiValue: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  kpiSub: { fontSize: 11, color: theme.colors.textTertiary, marginTop: 2 },
  // Merchant card
  merchantCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surface, padding: 16, borderRadius: 14, marginBottom: 8,
    ...theme.shadows.sm,
  },
  merchantIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: theme.colors.primarySurface, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  merchantName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  confidenceDot: { width: 6, height: 6, borderRadius: 3 },
  merchantMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  merchantRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  merchantTotal: { fontSize: 16, fontWeight: '700', color: theme.colors.primary },
  momMiniChip: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  momMiniChipText: { fontSize: 11, fontWeight: '700' },
  // Detail
  detailTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 15, fontWeight: '600', color: theme.colors.primary },
  askAiPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.primarySurface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  askAiPillText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  detailHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12, gap: 12 },
  detailIconBadge: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.primarySurface,
    alignItems: 'center', justifyContent: 'center',
  },
  detailName: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  detailTotal: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: theme.colors.surface, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 16, padding: 16, ...theme.shadows.sm,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  statTile: { minWidth: 90 },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 2 },
  statValue: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  momChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    marginTop: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  momChipText: { fontSize: 12, fontWeight: '700' },
  yearlyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  yearlyTile: { minWidth: 90 },
  // Monthly aggregate bar chart
  aggRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  aggLabel: { fontSize: 12, color: theme.colors.textSecondary, width: 70 },
  barContainer: {
    flex: 1, height: 16, backgroundColor: theme.colors.primarySurface, borderRadius: 8,
    marginHorizontal: 8, overflow: 'hidden',
  },
  bar: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 8 },
  aggValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text, width: 70, textAlign: 'right' },
  // Items bought / recent transactions
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  itemName: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  itemMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  itemAvg: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  // Empty states and trust
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, marginTop: 40 },
  emptyText: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 6, marginTop: 12 },
  emptySubtext: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 20 },
  ctaButton: { backgroundColor: theme.colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
  ctaButtonText: { color: 'white', fontWeight: '700', fontSize: 15 },
  emptyDetailState: { alignItems: 'center', paddingVertical: 20 },
  emptyDetailText: { fontSize: 15, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 4 },
  emptyDetailSubtext: { fontSize: 13, color: theme.colors.textTertiary, textAlign: 'center', marginBottom: 16 },
  trustCopy: { fontSize: 11, color: theme.colors.textTertiary, fontStyle: 'italic', marginTop: 12, textAlign: 'center' },
  overlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
});
