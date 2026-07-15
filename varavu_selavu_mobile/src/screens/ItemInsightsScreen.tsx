import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
// Replace native Picker with a lightweight custom select for consistent UX across platforms
import SimpleSelect from '../components/SimpleSelect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import {
  getTopItems, getItemDetail,
  ItemInsightSummary, ItemInsightDetail,
} from '../api/analytics';
import { ListSkeleton, HeroSkeleton } from '../components/SkeletonLoader';
import { AddExpenseContext } from './AddExpenseScreen';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Confidence = 'Low' | 'Medium' | 'High';

function getConfidence(transactionCount: number, distinctMerchants?: number, backendConfidence?: string | null): Confidence {
  if (backendConfidence) {
    const capitalized = backendConfidence.charAt(0).toUpperCase() + backendConfidence.slice(1);
    if (capitalized === 'High' || capitalized === 'Medium' || capitalized === 'Low') return capitalized as Confidence;
  }
  if (transactionCount >= 6 && (distinctMerchants ?? 0) >= 2) return 'High';
  if (transactionCount >= 3) return 'Medium';
  return 'Low';
}

function confidenceColor(theme: AppTheme, confidence: Confidence) {
  if (confidence === 'High') return theme.colors.success;
  if (confidence === 'Medium') return theme.colors.warning;
  return theme.colors.textTertiary;
}

function monthSpan(firstSeenAt?: string | null, lastSeenAt?: string | null): number {
  if (!firstSeenAt || !lastSeenAt) return 1;
  const first = new Date(firstSeenAt);
  const last = new Date(lastSeenAt);
  if (isNaN(first.getTime()) || isNaN(last.getTime())) return 1;
  const months = (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()) + 1;
  return Math.max(1, months);
}

export default function ItemInsightsScreen() {
  const { userEmail } = useAuth();
  const navigation = useNavigation<any>();
  const { openAddExpense } = useContext(AddExpenseContext);
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [items, setItems] = useState<ItemInsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemInsightDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Keep picker values as strings across platforms (RN Web/Android/iOS)
  // Mixing number and string values can cause blank selections on some platforms
  const [year, setYear] = useState<string>('all');
  const [month, setMonth] = useState<string>('all');

  const activeFilters = {
    year: year === 'all' ? undefined : Number(year),
    month: month === 'all' ? undefined : Number(month),
  };

  const fetchItems = useCallback(async () => {
    if (!userEmail) return;
    try {
      const data = await getTopItems(userEmail, activeFilters);
      setItems(data);
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
    fetchItems();
  }, [fetchItems]);

  const onRefresh = () => { setRefreshing(true); fetchItems(); };

  const handleSelectItem = async (item: ItemInsightSummary) => {
    if (!userEmail) return;
    setDetailLoading(true);
    setSelectedItem(null);
    try {
      const itemName = item.normalized_name || item.item_name || '';
      const detail = await getItemDetail(userEmail, itemName, activeFilters);
      setSelectedItem(detail);
    } catch {
      // non-fatal
    } finally {
      setDetailLoading(false);
    }
  };

  const askAi = (question: string) => {
    navigation.navigate('AI Analyst', { initialQuery: question });
  };

  // Normalize all values to strings so selectedValue always matches a Picker.Item value
  const years = ['all', ...Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i))];
  const months = ['all', ...Array.from({ length: 12 }, (_, i) => String(i + 1))];

  const yearOptions = years.map(y => ({ value: y, label: y === 'all' ? 'All' : y }));
  const monthOptions = months.map(m => ({ value: m, label: m === 'all' ? 'All' : MONTH_NAMES[Number(m) - 1] }));

  // Summary KPIs derived from the currently filtered item list
  const summary = useMemo(() => {
    if (items.length === 0) return null;
    const withMom = items.filter((i) => i.month_over_month_change_percent != null);
    const personalInflation = withMom.length > 0
      ? withMom.reduce((sum, i) => sum + (i.month_over_month_change_percent ?? 0), 0) / withMom.length
      : null;
    const biggestIncrease = [...withMom]
      .filter((i) => (i.month_over_month_change_percent ?? 0) > 0)
      .sort((a, b) => (b.month_over_month_change_percent ?? 0) - (a.month_over_month_change_percent ?? 0))[0];
    const mostFrequent = [...items].sort((a, b) => b.transaction_count - a.transaction_count)[0];
    return { personalInflation, biggestIncrease, mostFrequent };
  }, [items]);

  if (loading && !refreshing) {
    return (
      <LinearGradient colors={theme.gradients.surface} style={[styles.container, { paddingTop: insets.top }]}>
        <ScrollView>
          <View style={styles.header}>
              <View>
                <Text style={styles.screenTitle}>Item Insights</Text>
                <Text style={styles.screenSubtitle}>Your top purchased items by total spend</Text>
              </View>
          </View>
          <View style={{ paddingHorizontal: 16 }}>
             <ListSkeleton count={6} />
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  // Detail view
  if (selectedItem) {
    const itemLabel = selectedItem.normalized_name || selectedItem.item_name;
    const span = monthSpan(selectedItem.first_seen_at, selectedItem.last_seen_at);
    const avgMonthlySpend = (selectedItem.total_spent ?? 0) / span;
    const purchaseFrequency = (selectedItem.purchase_count ?? selectedItem.transaction_count ?? 0) / span;
    const mom = selectedItem.month_over_month_change_percent;
    const confidence = getConfidence(
      selectedItem.transaction_count ?? selectedItem.purchase_count ?? 0,
      selectedItem.distinct_merchants_count,
      selectedItem.confidence
    );
    const hasStoreComparison = (selectedItem.store_comparison?.length ?? 0) >= 2;

    return (
      <LinearGradient colors={theme.gradients.surface} style={styles.container}>
        <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingTop: insets.top }}>
        <View style={styles.detailTopRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedItem(null)}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.primary} />
            <Text style={styles.backText}>Items</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.askAiPill}
            onPress={() => askAi(`Tell me about my spending on ${itemLabel} — price trends and where I buy it cheapest.`)}
          >
            <Ionicons name="sparkles" size={14} color={theme.colors.primary} />
            <Text style={styles.askAiPillText}>Ask AI</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.detailHeader}>
          <View style={styles.detailIconBadge}>
            <Ionicons name="pricetag" size={22} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.detailName}>{itemLabel}</Text>
            <Text style={styles.detailTotal}>Total Spent: ${selectedItem.total_spent?.toFixed(2) || '0.00'}</Text>
          </View>
        </View>

        {/* Price Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Price Summary</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Average</Text>
              <Text style={styles.statValue}>${(selectedItem.avg_unit_price || selectedItem.average_unit_price || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Min</Text>
              <Text style={[styles.statValue, { color: theme.colors.success }]}>${(selectedItem.min_price || selectedItem.min_unit_price || 0).toFixed(2)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Max</Text>
              <Text style={[styles.statValue, { color: theme.colors.error }]}>${(selectedItem.max_price || selectedItem.max_unit_price || 0).toFixed(2)}</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Avg Monthly</Text>
              <Text style={styles.statValue}>${avgMonthlySpend.toFixed(2)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Frequency</Text>
              <Text style={styles.statValue}>{purchaseFrequency.toFixed(1)}/mo</Text>
            </View>
          </View>
          {mom != null && (
            <View style={[styles.momChip, { backgroundColor: mom >= 0 ? `${theme.colors.error}1A` : `${theme.colors.success}1A` }]}>
              <Ionicons name={mom >= 0 ? 'trending-up' : 'trending-down'} size={14} color={mom >= 0 ? theme.colors.error : theme.colors.success} />
              <Text style={[styles.momChipText, { color: mom >= 0 ? theme.colors.error : theme.colors.success }]}>
                {mom >= 0 ? '+' : ''}{mom.toFixed(1)}% vs last period
              </Text>
            </View>
          )}
          <View style={styles.badgeRow}>
            <View style={styles.qtyBadge}>
              <Text style={styles.qtyBadgeText}>{selectedItem.total_quantity_bought || 0} purchased</Text>
            </View>
            <View style={[styles.confidenceBadge, { borderColor: confidenceColor(theme, confidence) }]}>
              <View style={[styles.confidenceDot, { backgroundColor: confidenceColor(theme, confidence) }]} />
              <Text style={[styles.confidenceBadgeText, { color: confidenceColor(theme, confidence) }]}>{confidence} confidence</Text>
            </View>
          </View>
          <Text style={styles.trustCopy}>
              Prices are extracted directly from your uploaded receipts.
          </Text>
        </View>

        {/* Store Comparison */}
        {hasStoreComparison ? (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="storefront" size={16} color={theme.colors.text} />
              <Text style={styles.cardTitle}>Store Comparison</Text>
            </View>
            {selectedItem.store_comparison.map((s, i) => (
              <View key={i} style={styles.storeRow}>
                <Text style={styles.storeName}>{s.store_name}</Text>
                <View style={styles.storeStats}>
                  <Text style={styles.storePrice}>Avg ${(s.avg_price || 0).toFixed(2)}</Text>
                  <Text style={styles.storePurchases}>{s.purchase_count}x</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
            <View style={styles.card}>
                <View style={styles.cardTitleRow}>
                  <Ionicons name="storefront" size={16} color={theme.colors.text} />
                  <Text style={styles.cardTitle}>Store Comparison</Text>
                </View>
                 <View style={styles.emptyDetailState}>
                     <Text style={styles.emptyDetailText}>Not enough data to compare stores.</Text>
                     <Text style={styles.emptyDetailSubtext}>Buy this item at 2 or more stores to unlock a price comparison.</Text>
                 </View>
            </View>
        )}

        {/* Price History */}
        {selectedItem.price_history && selectedItem.price_history.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="analytics" size={16} color={theme.colors.text} />
              <Text style={styles.cardTitle}>Price History</Text>
            </View>
            {selectedItem.price_history.slice(-15).map((h, i) => (
              <View key={i} style={styles.historyRow}>
                <Text style={styles.historyDate}>{h.date ? new Date(h.date).toLocaleDateString() : '—'}</Text>
                <Text style={styles.historyStore}>{h.store_name || '—'}</Text>
                <Text style={styles.historyPrice}>${(h.unit_price || 0).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      </LinearGradient>
    );
  }

  // List view
  return (
    <LinearGradient colors={theme.gradients.surface} style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>Item Insights</Text>
          <Text style={styles.screenSubtitle}>Your top purchased items by total spend</Text>
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

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={48} color={theme.colors.textTertiary} />
          <Text style={styles.emptyText}>No item insights yet</Text>
          <Text style={styles.emptySubtext}>Upload a receipt to unlock item-level insights.</Text>
           <TouchableOpacity style={styles.ctaButton} onPress={() => openAddExpense()}>
              <Text style={styles.ctaButtonText}>Add Receipt Expense</Text>
           </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => item.normalized_name || item.item_name || String(index)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
          ListHeaderComponent={summary ? (
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiTile, { width: '100%' }]}>
                <View style={styles.kpiLabelRow}>
                  <Ionicons name="pulse" size={14} color={theme.colors.textSecondary} />
                  <Text style={styles.kpiLabel}>Personal Inflation</Text>
                </View>
                <Text style={styles.kpiValue}>
                  {summary.personalInflation != null ? `${summary.personalInflation >= 0 ? '+' : ''}${summary.personalInflation.toFixed(1)}%` : '—'}
                </Text>
                <Text style={styles.kpiSub}>avg price change vs last period</Text>
              </View>
              <View style={styles.kpiTile}>
                <View style={styles.kpiLabelRow}>
                  <Ionicons name="trending-up" size={14} color={theme.colors.textSecondary} />
                  <Text style={styles.kpiLabel}>Biggest Increase</Text>
                </View>
                <Text style={styles.kpiValue} numberOfLines={1}>
                  {summary.biggestIncrease ? (summary.biggestIncrease.item_name || summary.biggestIncrease.normalized_name) : '—'}
                </Text>
                <Text style={[styles.kpiSub, summary.biggestIncrease && { color: theme.colors.error, fontWeight: '700' }]}>
                  {summary.biggestIncrease ? `+${(summary.biggestIncrease.month_over_month_change_percent ?? 0).toFixed(1)}%` : 'No change data'}
                </Text>
              </View>
              <View style={styles.kpiTile}>
                <View style={styles.kpiLabelRow}>
                  <Ionicons name="repeat" size={14} color={theme.colors.textSecondary} />
                  <Text style={styles.kpiLabel}>Most Frequent</Text>
                </View>
                <Text style={styles.kpiValue} numberOfLines={1}>
                  {summary.mostFrequent ? (summary.mostFrequent.item_name || summary.mostFrequent.normalized_name) : '—'}
                </Text>
                <Text style={styles.kpiSub}>{summary.mostFrequent?.transaction_count ?? 0} purchase{(summary.mostFrequent?.transaction_count ?? 0) === 1 ? '' : 's'}</Text>
              </View>
            </View>
          ) : null}
          renderItem={({ item }) => {
            const confidence = getConfidence(item.transaction_count, item.distinct_merchants_count, item.confidence);
            return (
              <TouchableOpacity style={styles.itemCard} onPress={() => handleSelectItem(item)} activeOpacity={0.7}>
                <View style={styles.itemCardLeft}>
                  <View style={styles.nameRow}>
                    <Text style={styles.itemName}>{item.normalized_name || item.item_name}</Text>
                    <View style={[styles.confidenceDot, { backgroundColor: confidenceColor(theme, confidence) }]} />
                  </View>
                  <Text style={styles.itemMeta}>
                    Avg ${(item.avg_unit_price || item.average_unit_price || 0).toFixed(2)} · {item.total_quantity_bought || 0} purchased
                  </Text>
                </View>
                <View style={styles.itemCardRight}>
                  {item.month_over_month_change_percent != null && (
                    <View style={styles.momMiniChip}>
                      <Ionicons
                        name={item.month_over_month_change_percent >= 0 ? 'trending-up' : 'trending-down'}
                        size={11}
                        color={item.month_over_month_change_percent >= 0 ? theme.colors.error : theme.colors.success}
                      />
                      <Text style={[styles.momMiniChipText, { color: item.month_over_month_change_percent >= 0 ? theme.colors.error : theme.colors.success }]}>
                        {item.month_over_month_change_percent >= 0 ? '+' : ''}{item.month_over_month_change_percent.toFixed(1)}%
                      </Text>
                    </View>
                  )}
                  <Text style={styles.itemTotal}>${(item.total_spent || 0).toFixed(2)}</Text>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {detailLoading && (
        <View style={styles.overlay}>
           <View style={{ backgroundColor: theme.colors.surface, padding: 24, borderRadius: 16, alignItems: 'center' }}>
               <ActivityIndicator size="large" color={theme.colors.primary} />
               <Text style={{ marginTop: 12, color: theme.colors.textSecondary, fontWeight: '500' }}>Loading items...</Text>
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
  // List item card
  itemCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, padding: 16, borderRadius: 14, marginBottom: 8,
    ...theme.shadows.sm,
  },
  itemCardLeft: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  confidenceDot: { width: 6, height: 6, borderRadius: 3 },
  itemMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 3 },
  itemCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTotal: { fontSize: 16, fontWeight: '700', color: theme.colors.primary },
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
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  statBox: { alignItems: 'center' },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  momChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    marginTop: 4, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  momChipText: { fontSize: 12, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  qtyBadge: { backgroundColor: theme.colors.background, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  qtyBadgeText: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  confidenceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1,
  },
  confidenceBadgeText: { fontSize: 12, fontWeight: '700' },
  statCaption: { fontSize: 12, color: theme.colors.textTertiary, marginTop: 10, textAlign: 'center' },
  storeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  storeName: { fontSize: 15, fontWeight: '600', color: theme.colors.text, flex: 1 },
  storeStats: { alignItems: 'flex-end' },
  storePrice: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  storePurchases: { fontSize: 12, color: theme.colors.textTertiary },
  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
  },
  historyDate: { fontSize: 13, color: theme.colors.textSecondary, width: 90 },
  historyStore: { fontSize: 13, color: theme.colors.text, flex: 1 },
  historyPrice: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
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
