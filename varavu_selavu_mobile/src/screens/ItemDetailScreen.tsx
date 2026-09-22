/**
 * ItemDetailScreen.tsx — V2 "Item detail" (Flows 6.2): price history, confidence badge, a
 * cheapest-where comparison and a direct Ask hand-off. Reached from the Insights → Items list and
 * from a "what changed" row about a specific item.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, withAlpha } from '../theme';
import { getItemDetail } from '../api/analytics';
import ScreenWrapper from '../components/ScreenWrapper';
import IconButton from '../components/IconButton';
import SectionLabel from '../components/SectionLabel';
import StatCard from '../components/StatCard';
import PriceAreaChart from '../components/PriceAreaChart';
import { priceChange, confidenceBadge } from '../utils/insightsFormat';

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ItemDetailScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { userEmail } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const itemName: string = route.params?.itemName ?? '';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['itemDetail', userEmail, itemName],
    queryFn: () => getItemDetail(userEmail!, itemName),
    enabled: !!userEmail && !!itemName,
  });

  const history = useMemo(
    () => [...(data?.price_history ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [data],
  );
  const change = useMemo(() => priceChange(history, new Date()), [history]);
  const stores = useMemo(
    () => [...(data?.store_comparison ?? [])].sort((a, b) => a.avg_price - b.avg_price),
    [data],
  );
  const badge = confidenceBadge(data?.confidence);
  const badgeColor = badge.tone === 'success' ? theme.colors.success : badge.tone === 'warning' ? theme.colors.warning : theme.colors.textTertiary;

  const purchases = data?.purchase_count ?? data?.transaction_count ?? 0;
  const merchants = data?.distinct_merchants_count;
  const avg = data?.avg_unit_price ?? data?.average_unit_price ?? 0;
  // Store rows only when there are ≥2 to compare — one store is not a comparison (TS-ANL-009).
  const rankColor = (i: number) => (i === 0 ? theme.colors.success : i === stores.length - 1 ? theme.colors.error : theme.colors.warning);

  return (
    <ScreenWrapper scroll paddingBottom={60}>
      <View style={styles.head}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => navigation.goBack()} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>{data?.normalized_name || data?.item_name || itemName}</Text>
          {data ? (
            <Text style={styles.sub} numberOfLines={1}>
              {purchases} purchase{purchases === 1 ? '' : 's'}{merchants ? ` · ${merchants} merchant${merchants === 1 ? '' : 's'}` : ''}
            </Text>
          ) : null}
        </View>
        {data ? (
          <View style={[styles.badge, { backgroundColor: withAlpha(badgeColor, 0.14) }]}>
            <Text style={[styles.badgeText, { color: badgeColor }]}>{badge.label}</Text>
          </View>
        ) : null}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
      ) : isError || !data ? (
        <Text style={styles.empty}>Couldn't load this item.</Text>
      ) : (
        <>
          <View style={styles.stats}>
            <StatCard label="Avg price" value={money(avg)} />
            {change ? (
              <StatCard
                label={change.label}
                value={`${change.percent > 0 ? '+' : change.percent < 0 ? '−' : ''}${Math.abs(change.percent)}%`}
                color={change.percent > 0 ? theme.colors.error : change.percent < 0 ? theme.colors.success : undefined}
              />
            ) : (
              <StatCard label="Total spent" value={money(data.total_spent)} />
            )}
          </View>

          {history.length >= 2 && (
            <>
              <SectionLabel style={styles.section}>Price history</SectionLabel>
              <PriceAreaChart values={history.map((h) => h.unit_price)} />
            </>
          )}

          {stores.length >= 2 && (
            <>
              <SectionLabel style={styles.section}>Cheapest where</SectionLabel>
              {stores.map((s, i) => (
                <View key={s.store_name} style={styles.storeRow}>
                  <View style={[styles.dot, { backgroundColor: rankColor(i) }]} />
                  <Text style={styles.storeName} numberOfLines={1}>{s.store_name}</Text>
                  <Text style={styles.storeBuys}>{s.purchase_count} buy{s.purchase_count === 1 ? '' : 's'}</Text>
                  <Text style={[styles.storePrice, { color: rankColor(i) }]}>{money(s.avg_price)}</Text>
                </View>
              ))}
            </>
          )}

          <TouchableOpacity
            style={styles.ask}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('MainTabs', { screen: 'AI Analyst', params: { initialQuery: `Has the price of ${data.normalized_name || data.item_name} gone up? Where is it cheapest?` } })}
          >
            <Text style={styles.askText}>Ask about this item</Text>
          </TouchableOpacity>
        </>
      )}
    </ScreenWrapper>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 6, paddingBottom: 18 },
  title: { fontFamily: theme.typography.fontFamily.bold, fontSize: 18, letterSpacing: -0.3, color: theme.colors.text },
  sub: { fontFamily: theme.typography.fontFamily.regular, fontSize: 12, color: theme.colors.textTertiary, marginTop: 2 },
  badge: { height: 26, paddingHorizontal: 9, borderRadius: 8, justifyContent: 'center' },
  badgeText: { fontFamily: theme.typography.fontFamily.mono, fontSize: 10, letterSpacing: 1 },
  stats: { flexDirection: 'row', gap: 10 },
  section: { paddingTop: 22, paddingBottom: 12 },
  storeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  storeName: { flex: 1, fontFamily: theme.typography.fontFamily.semiBold, fontSize: 15, color: theme.colors.text },
  storeBuys: { fontFamily: theme.typography.fontFamily.regular, fontSize: 12, color: theme.colors.textTertiary },
  storePrice: { width: 60, textAlign: 'right', fontFamily: theme.typography.fontFamily.bold, fontSize: 15, fontVariant: ['tabular-nums'] },
  ask: {
    marginTop: 16, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    borderColor: withAlpha(theme.colors.primary, 0.3), backgroundColor: withAlpha(theme.colors.primary, 0.1),
  },
  askText: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 15, color: theme.colors.primaryLight },
  empty: { fontFamily: theme.typography.fontFamily.regular, fontSize: 14, color: theme.colors.textTertiary, textAlign: 'center', marginTop: 40 },
});
