import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import SimpleSelect from '../components/SimpleSelect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';
import {
  getTopMerchants, getMerchantDetail,
  MerchantInsightSummary, MerchantInsightDetail,
} from '../api/analytics';
import { ListSkeleton, HeroSkeleton } from '../components/SkeletonLoader';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function MerchantInsightsScreen() {
  const { userEmail } = useAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [merchants, setMerchants] = useState<MerchantInsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantInsightDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Keep picker values as strings across platforms to avoid blank selection issues
  const [year, setYear] = useState<string>('all');
  const [month, setMonth] = useState<string>('all');

  const fetchMerchants = useCallback(async () => {
    if (!userEmail) return;
    try {
      const data = await getTopMerchants(userEmail, {
        year: year === 'all' ? undefined : Number(year),
        month: month === 'all' ? undefined : Number(month),
      });
      setMerchants(data);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
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
      const detail = await getMerchantDetail(userEmail, m.merchant_name);
      setSelectedMerchant(detail);
    } catch {
      // non-fatal
    } finally {
      setDetailLoading(false);
    }
  };

  const years = ['all', ...Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i))];
  const months = ['all', ...Array.from({ length: 12 }, (_, i) => String(i + 1))];
  const yearOptions = years.map(y => ({ value: y, label: y === 'all' ? 'All' : y }));
  const monthOptions = months.map(m => ({ value: m, label: m === 'all' ? 'All' : MONTH_NAMES[Number(m) - 1] }));

  if (loading && !refreshing) {
    return (
      <ScrollView style={[styles.container, { paddingTop: insets.top }]}>
         <View style={styles.header}>
            <View>
              <Text style={styles.screenTitle}>🏪 Merchant Insights</Text>
              <Text style={styles.screenSubtitle}>Your top merchants by total spend</Text>
            </View>
          </View>
        <View style={{ paddingHorizontal: 16 }}>
           <ListSkeleton count={5} />
        </View>
      </ScrollView>
    );
  }

  // Detail view
  if (selectedMerchant) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedMerchant(null)}>
          <Text style={styles.backText}>← Back to Merchants</Text>
        </TouchableOpacity>

        <View style={styles.detailHeader}>
          <Text style={styles.detailName}>{selectedMerchant.merchant_name}</Text>
          <Text style={styles.detailTotal}>
            Total Spent: ${selectedMerchant.total_spent.toFixed(2)} · {selectedMerchant.transaction_count} transactions
          </Text>
        </View>

        {/* Monthly Aggregates */}
        {selectedMerchant.monthly_aggregates.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📅 Monthly Spending</Text>
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
             <Text style={styles.trustCopy}>
                Spend trends are based on your complete historical data for this merchant.
            </Text>
          </View>
        ) : (
            <View style={styles.card}>
               <Text style={styles.cardTitle}>📅 Monthly Spending</Text>
               <View style={styles.emptyDetailState}>
                 <Text style={styles.emptyDetailText}>Not enough history to show trends yet.</Text>
                 <Text style={styles.emptyDetailSubtext}>Continue tracking expenses to build insights.</Text>
               </View>
            </View>
        )}

        {/* Items Bought */}
        {selectedMerchant.items_bought.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🛍️ Items Bought Here</Text>
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
        ) : (
           <View style={styles.card}>
               <Text style={styles.cardTitle}>🛍️ Items Bought Here</Text>
               <View style={styles.emptyDetailState}>
                 <Text style={styles.emptyDetailText}>No item data available.</Text>
                 <Text style={styles.emptyDetailSubtext}>Upload a receipt to unlock item-level insights for this merchant.</Text>
                 <TouchableOpacity style={styles.ctaButton} onPress={() => navigation.navigate('Add Expense')}>
                    <Text style={styles.ctaButtonText}>Add Receipt Expense</Text>
                 </TouchableOpacity>
               </View>
            </View>
        )}

        {/* AI Action */}
         <TouchableOpacity 
            style={[styles.card, { backgroundColor: '#FFF7ED', alignItems: 'center', paddingVertical: 20 }]}
            onPress={() => navigation.navigate('AI Analyst')}
         >
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🤖</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#9A3412' }}>Ask AI about {selectedMerchant.merchant_name}</Text>
         </TouchableOpacity>

      </ScrollView>
    );
  }

  // List view
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>🏪 Merchant Insights</Text>
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
          <Text style={styles.emptyIcon}>🏬</Text>
          <Text style={styles.emptyText}>No merchant data found</Text>
          <Text style={styles.emptySubtext}>Add merchant names to your expenses to improve merchant insights.</Text>
           <TouchableOpacity style={styles.ctaButton} onPress={() => navigation.navigate('Add Expense')}>
              <Text style={styles.ctaButtonText}>Add an Expense</Text>
           </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={merchants}
          keyExtractor={(m) => m.merchant_name}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
          renderItem={({ item: m }) => (
            <TouchableOpacity style={styles.merchantCard} onPress={() => handleSelectMerchant(m)} activeOpacity={0.7}>
              <View style={styles.merchantIcon}>
                <Text style={{ fontSize: 22 }}>🏪</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.merchantName}>{m.merchant_name}</Text>
                <Text style={styles.merchantMeta}>{m.transaction_count} transactions</Text>
              </View>
              <View style={styles.merchantRight}>
                <Text style={styles.merchantTotal}>${m.total_spent.toFixed(2)}</Text>
                <Text style={styles.merchantArrow}>›</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  header: { paddingHorizontal: 16, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  screenTitle: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  screenSubtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 12 },
  filters: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12, gap: 8 },
  pickerContainer: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 8, padding: 8, ...theme.shadows.sm },
  pickerLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  picker: { height: 40, color: theme.colors.text },
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
  merchantName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  merchantMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  merchantRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  merchantTotal: { fontSize: 16, fontWeight: '700', color: theme.colors.primary },
  merchantArrow: { fontSize: 22, color: theme.colors.textTertiary },
  // Detail
  backBtn: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backText: { fontSize: 15, fontWeight: '600', color: theme.colors.primary },
  detailHeader: { paddingHorizontal: 16, marginBottom: 12 },
  detailName: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  detailTotal: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: theme.colors.surface, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 14, padding: 16, ...theme.shadows.sm,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
  // Monthly aggregate bar chart
  aggRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  aggLabel: { fontSize: 12, color: theme.colors.textSecondary, width: 70 },
  barContainer: {
    flex: 1, height: 16, backgroundColor: theme.colors.primarySurface, borderRadius: 8,
    marginHorizontal: 8, overflow: 'hidden',
  },
  bar: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 8 },
  aggValue: { fontSize: 13, fontWeight: '600', color: theme.colors.text, width: 70, textAlign: 'right' },
  // Items bought
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  itemName: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  itemMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  itemAvg: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  // Empty states and trust
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, marginTop: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
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
