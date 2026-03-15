import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';
import {
  getTopItems, getItemDetail,
  ItemInsightSummary, ItemInsightDetail,
} from '../api/analytics';
import { ListSkeleton, HeroSkeleton } from '../components/SkeletonLoader';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ItemInsightsScreen() {
  const { userEmail } = useAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ItemInsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemInsightDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [year, setYear] = useState<number | string>('all');
  const [month, setMonth] = useState<number | string>('all');

  const fetchItems = useCallback(async () => {
    if (!userEmail) return;
    try {
      const data = await getTopItems(userEmail, {
        year: year === 'all' ? undefined : Number(year),
        month: month === 'all' ? undefined : Number(month),
      });
      setItems(data);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
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
      const detail = await getItemDetail(userEmail, itemName);
      setSelectedItem(detail);
    } catch {
      // non-fatal
    } finally {
      setDetailLoading(false);
    }
  };

  const years = ['all', ...Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)];
  const months = ['all', ...Array.from({ length: 12 }, (_, i) => i + 1)];

  if (loading && !refreshing) {
    return (
      <ScrollView style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
            <View>
              <Text style={styles.screenTitle}>🛒 Item Insights</Text>
              <Text style={styles.screenSubtitle}>Your top purchased items by total spend</Text>
            </View>
        </View>
        <View style={{ paddingHorizontal: 16 }}>
           <ListSkeleton count={6} />
        </View>
      </ScrollView>
    );
  }

  // Detail view
  if (selectedItem) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedItem(null)}>
          <Text style={styles.backText}>← Back to Items</Text>
        </TouchableOpacity>

        <View style={styles.detailHeader}>
          <Text style={styles.detailName}>{selectedItem.normalized_name || selectedItem.item_name}</Text>
          <Text style={styles.detailTotal}>Total Spent: ${selectedItem.total_spent?.toFixed(2) || '0.00'}</Text>
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
          <Text style={styles.statCaption}>Qty bought: {selectedItem.total_quantity_bought || 0}</Text>
          <Text style={styles.trustCopy}>
              Prices are extracted directly from your uploaded receipts.
          </Text>
        </View>

        {/* Store Comparison */}
        {selectedItem.store_comparison && selectedItem.store_comparison.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🏪 Store Comparison</Text>
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
                <Text style={styles.cardTitle}>🏪 Store Comparison</Text>
                 <View style={styles.emptyDetailState}>
                     <Text style={styles.emptyDetailText}>Not enough data to compare stores.</Text>
                     <Text style={styles.emptyDetailSubtext}>Shop at different locations to unlock comparison insights.</Text>
                 </View>
            </View>
        )}

        {/* Price History */}
        {selectedItem.price_history && selectedItem.price_history.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📈 Price History</Text>
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
    );
  }

  // List view
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>🛒 Item Insights</Text>
          <Text style={styles.screenSubtitle}>Your top purchased items by total spend</Text>
        </View>
      </View>
      <View style={styles.filters}>
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerLabel}>Year</Text>
          <Picker
            selectedValue={year}
            style={styles.picker}
            onValueChange={(itemValue) => setYear(itemValue)}
          >
            {years.map(y => <Picker.Item key={y} label={String(y)} value={y} />)}
          </Picker>
        </View>
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerLabel}>Month</Text>
          <Picker
            selectedValue={month}
            style={styles.picker}
            onValueChange={(itemValue) => setMonth(itemValue)}
          >
            {months.map(m => <Picker.Item key={m} label={m === 'all' ? 'All' : MONTH_NAMES[(m as number)-1]} value={m} />)}
          </Picker>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyText}>No item insights yet</Text>
          <Text style={styles.emptySubtext}>Upload a receipt to unlock item-level insights.</Text>
           <TouchableOpacity style={styles.ctaButton} onPress={() => navigation.navigate('Add Expense')}>
              <Text style={styles.ctaButtonText}>Add Receipt Expense</Text>
           </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id || item.item_name || String(Math.random())}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.itemCard} onPress={() => handleSelectItem(item)} activeOpacity={0.7}>
              <View style={styles.itemCardLeft}>
                <Text style={styles.itemName}>{item.normalized_name || item.item_name}</Text>
                <Text style={styles.itemMeta}>
                  Avg ${(item.avg_unit_price || item.average_unit_price || 0).toFixed(2)} · {item.total_quantity_bought || 0} purchased
                </Text>
              </View>
              <View style={styles.itemCardRight}>
                <Text style={styles.itemTotal}>${(item.total_spent || 0).toFixed(2)}</Text>
                <Text style={styles.itemArrow}>›</Text>
              </View>
            </TouchableOpacity>
          )}
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
  picker: { height: 40 },
  // List item card
  itemCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, padding: 16, borderRadius: 14, marginBottom: 8,
    ...theme.shadows.sm,
  },
  itemCardLeft: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  itemMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 3 },
  itemCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTotal: { fontSize: 16, fontWeight: '700', color: theme.colors.primary },
  itemArrow: { fontSize: 22, color: theme.colors.textTertiary },
  // Detail
  backBtn: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backText: { fontSize: 15, fontWeight: '600', color: theme.colors.primary },
  detailHeader: { paddingHorizontal: 16, marginBottom: 12 },
  detailName: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  detailTotal: { fontSize: 15, color: theme.colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: theme.colors.surface, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 14, padding: 16, ...theme.shadows.sm,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statBox: { alignItems: 'center' },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
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
