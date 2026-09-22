/**
 * MerchantDetailScreen.tsx — the merchant counterpart of the V2 item detail: total and month-over-
 * month, six months of spend, recent transactions, and an Ask hand-off. (The design specifies only
 * the item screen; this reuses its layout so the two drill-downs read as one system.)
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, withAlpha } from '../theme';
import { getMerchantDetail } from '../api/analytics';
import ScreenWrapper from '../components/ScreenWrapper';
import IconButton from '../components/IconButton';
import SectionLabel from '../components/SectionLabel';
import StatCard from '../components/StatCard';
import ListRow from '../components/ListRow';
import { confidenceBadge } from '../utils/insightsFormat';
import { shortDate } from '../utils/expenseInsights';

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export default function MerchantDetailScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { userEmail } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const merchantName: string = route.params?.merchantName ?? '';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['merchantDetail', userEmail, merchantName],
    queryFn: () => getMerchantDetail(userEmail!, merchantName),
    enabled: !!userEmail && !!merchantName,
  });

  const months = useMemo(() => {
    const agg = [...(data?.monthly_aggregates ?? [])].sort((a, b) => a.year - b.year || a.month - b.month).slice(-6);
    const max = Math.max(...agg.map((a) => a.total_spent), 0);
    return agg.map((a, i) => ({
      key: `${a.year}-${a.month}`, label: MONTHS[a.month - 1],
      frac: max > 0 ? Math.max(a.total_spent / max, 0.06) : 0.06, current: i === agg.length - 1,
    }));
  }, [data]);

  const badge = confidenceBadge(data?.confidence);
  const badgeColor = badge.tone === 'success' ? theme.colors.success : badge.tone === 'warning' ? theme.colors.warning : theme.colors.textTertiary;
  const mom = data?.month_over_month_change_percent;

  return (
    <ScreenWrapper scroll paddingBottom={60}>
      <View style={styles.head}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => navigation.goBack()} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>{data?.merchant_name || merchantName}</Text>
          {data ? <Text style={styles.sub}>{data.transaction_count} transaction{data.transaction_count === 1 ? '' : 's'}</Text> : null}
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
        <Text style={styles.empty}>Couldn't load this merchant.</Text>
      ) : (
        <>
          <View style={styles.stats}>
            <StatCard label="Total spent" value={money(data.total_spent)} />
            {mom != null ? (
              <StatCard
                label="Vs last month"
                value={`${mom > 0 ? '+' : mom < 0 ? '−' : ''}${Math.abs(Math.round(mom))}%`}
                color={mom > 0 ? theme.colors.error : mom < 0 ? theme.colors.success : undefined}
              />
            ) : (
              <StatCard label="Avg basket" value={money(data.average_transaction_amount ?? 0)} />
            )}
          </View>

          {months.length > 0 && (
            <>
              <SectionLabel style={styles.section}>Monthly spend</SectionLabel>
              <View style={styles.bars}>
                {months.map((m) => (
                  <View key={m.key} style={[styles.bar, { height: `${Math.round(m.frac * 100)}%`, backgroundColor: m.current ? theme.colors.secondary : theme.colors.surfaceSecondary }]} />
                ))}
              </View>
              <View style={styles.barLabels}>
                {months.map((m) => <Text key={m.key} style={[styles.barLabel, m.current && { color: theme.colors.primary }]}>{m.label}</Text>)}
              </View>
            </>
          )}

          {(data.recent_transactions ?? []).length > 0 && (
            <>
              <SectionLabel style={styles.section}>Recent</SectionLabel>
              {data.recent_transactions!.slice(0, 5).map((t, i) => (
                <ListRow
                  key={`${t.date}-${i}`}
                  category={data.merchant_name}
                  title={t.description || data.merchant_name}
                  meta={t.date ? shortDate(t.date) : undefined}
                  amount={money(t.amount)}
                />
              ))}
            </>
          )}

          <TouchableOpacity
            style={styles.ask}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('MainTabs', { screen: 'AI Analyst', params: { initialQuery: `How much have I spent at ${data.merchant_name}, and is it going up?` } })}
          >
            <Text style={styles.askText}>Ask about this merchant</Text>
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
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 48 },
  bar: { flex: 1, borderRadius: 4 },
  barLabels: { flexDirection: 'row', gap: 10, marginTop: 7 },
  barLabel: { flex: 1, textAlign: 'center', fontFamily: theme.typography.fontFamily.monoRegular, fontSize: 10, letterSpacing: 1, color: theme.colors.textQuaternary },
  ask: {
    marginTop: 16, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    borderColor: withAlpha(theme.colors.primary, 0.3), backgroundColor: withAlpha(theme.colors.primary, 0.1),
  },
  askText: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 15, color: theme.colors.primaryLight },
  empty: { fontFamily: theme.typography.fontFamily.regular, fontSize: 14, color: theme.colors.textTertiary, textAlign: 'center', marginTop: 40 },
});
