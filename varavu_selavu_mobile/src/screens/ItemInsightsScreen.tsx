import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';
import {
  getTopItems, getItemDetail,
  ItemInsightSummary, ItemInsightDetail,
} from '../api/analytics';

export default function ItemInsightsScreen() {
  const { userEmail } = useAuth();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ItemInsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemInsightDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!userEmail) return;
    try {
      const data = await getTopItems(userEmail);
      setItems(data);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userEmail]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const onRefresh = () => { setRefreshing(true); fetchItems(); };

  const handleSelectItem = async (item: ItemInsightSummary) => {
    if (!userEmail) return;
    setDetailLoading(true);
    setSelectedItem(null);
    try {
      const detail = await getItemDetail(userEmail, item.normalized_name);
      setSelectedItem(detail);
    } catch {
      // non-fatal
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
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
          <Text style={styles.detailName}>{selectedItem.normalized_name}</Text>
          <Text style={styles.detailTotal}>Total Spent: ${selectedItem.total_spent.toFixed(2)}</Text>
        </View>

        {/* Price Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Price Summary</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Average</Text>
              <Text style={styles.statValue}>${selectedItem.avg_unit_price.toFixed(2)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Min</Text>
              <Text style={[styles.statValue, { color: theme.colors.success }]}>${selectedItem.min_price.toFixed(2)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Max</Text>
              <Text style={[styles.statValue, { color: theme.colors.error }]}>${selectedItem.max_price.toFixed(2)}</Text>
            </View>
          </View>
          <Text style={styles.statCaption}>Qty bought: {selectedItem.total_quantity_bought}</Text>
        </View>

        {/* Store Comparison */}
        {selectedItem.store_comparison.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🏪 Store Comparison</Text>
            {selectedItem.store_comparison.map((s, i) => (
              <View key={i} style={styles.storeRow}>
                <Text style={styles.storeName}>{s.store_name}</Text>
                <View style={styles.storeStats}>
                  <Text style={styles.storePrice}>Avg ${s.avg_price.toFixed(2)}</Text>
                  <Text style={styles.storePurchases}>{s.purchase_count}x</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Price History */}
        {selectedItem.price_history.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📈 Price History</Text>
            {selectedItem.price_history.slice(-15).map((h, i) => (
              <View key={i} style={styles.historyRow}>
                <Text style={styles.historyDate}>{h.date ? new Date(h.date).toLocaleDateString() : '—'}</Text>
                <Text style={styles.historyStore}>{h.store_name || '—'}</Text>
                <Text style={styles.historyPrice}>${h.unit_price.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  // List view
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.screenTitle}>🛒 Item Insights</Text>
      <Text style={styles.screenSubtitle}>Your top purchased items by total spend</Text>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyText}>No item insights yet</Text>
          <Text style={styles.emptySubtext}>Add expenses with itemized receipts to see insights here</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.itemCard} onPress={() => handleSelectItem(item)} activeOpacity={0.7}>
              <View style={styles.itemCardLeft}>
                <Text style={styles.itemName}>{item.normalized_name}</Text>
                <Text style={styles.itemMeta}>
                  Avg ${item.avg_unit_price.toFixed(2)} · {item.total_quantity_bought} purchased
                </Text>
              </View>
              <View style={styles.itemCardRight}>
                <Text style={styles.itemTotal}>${item.total_spent.toFixed(2)}</Text>
                <Text style={styles.itemArrow}>›</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {detailLoading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  screenTitle: { fontSize: 24, fontWeight: '800', color: theme.colors.text, paddingHorizontal: 16, paddingTop: 12 },
  screenSubtitle: { fontSize: 14, color: theme.colors.textSecondary, paddingHorizontal: 16, marginBottom: 12 },
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
  // Empty
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
  emptySubtext: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center' },
  overlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center', alignItems: 'center',
  },
});
