/**
 * PeopleList.tsx — TrackSpense v3 "People" tab content: a first-class, tappable, settle-able
 * promotion of what `FriendBalancesWidget` used to render as a small embedded card on
 * GroupsScreen (now retired — this component fully supersedes it). Cross-group net-per-person
 * balances via `getFriendBalances()` (TS-GRP-128) — same query key as the old widget used, so
 * no cache duplication.
 *
 * Settlement is inherently per-group (the backend has no cross-group settle endpoint). Matching
 * the mock's uniform interaction exactly: every row always expands on tap (not just multi-group
 * people) to reveal its per-group breakdown + settle action(s), rather than special-casing
 * single-group people to navigate immediately — via GroupDetailScreen's existing settle-up sheet
 * (see the `settleCounterpartyEmail`/`settleCounterpartyName` route params it reads).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { getFriendBalances, FriendBalanceDTO } from '../api/groups';
import { memberColor, initialsFromName } from './BalanceRow';

function formatSignedMoney(net: number): string {
  if (net === 0) return '$0.00';
  return `${net > 0 ? '+' : '-'}$${Math.abs(net).toFixed(2)}`;
}

/** "Record [name] paid $X" when they owe us (net > 0, mirroring the old widget's sign
 * convention), otherwise the reverse-direction phrasing for a balance we owe. */
function settleLabel(name: string, net: number): string {
  return net > 0 ? `Record ${name} paid $${net.toFixed(2)}` : `Record you paid ${name} $${Math.abs(net).toFixed(2)}`;
}

export default function PeopleList() {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { data, isLoading } = useQuery({ queryKey: ['friend-balances'], queryFn: getFriendBalances });
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (isLoading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />;
  }

  const people = data ?? [];

  if (people.length === 0) {
    return (
      <View style={styles.emptyCenter}>
        <Text style={styles.emptyIcon}>🤝</Text>
        <Text style={styles.emptyTitle}>No shared balances yet</Text>
        <Text style={styles.emptySubtitle}>
          Once you split an expense with someone, they'll show up here.
        </Text>
      </View>
    );
  }

  const goSettle = (groupId: string, person: FriendBalanceDTO) => {
    navigation.navigate('GroupDetail', {
      groupId,
      settleCounterpartyEmail: person.counterparty_email,
      settleCounterpartyName: person.counterparty_display_name,
    });
  };

  // TrackSpense v3 Mobile mock's owed/owe rollup line above the people list (`plOwedTotal`/
  // `plOweTotal`) — was missing entirely before.
  const owedTotal = people.filter((p) => p.net > 0).reduce((sum, p) => sum + p.net, 0);
  const oweTotal = people.filter((p) => p.net < 0).reduce((sum, p) => sum - p.net, 0);

  return (
    <View style={[styles.list, { paddingBottom: insets.bottom + 100 }]}>
      <Text style={styles.summaryLine}>
        <Text style={{ color: theme.colors.success, fontFamily: 'Inter-Bold' }}>${owedTotal.toFixed(2)}</Text>
        <Text style={styles.summaryMuted}> owed to you  ·  </Text>
        <Text style={{ color: theme.colors.error, fontFamily: 'Inter-Bold' }}>${oweTotal.toFixed(2)}</Text>
        <Text style={styles.summaryMuted}> you owe</Text>
      </Text>

      {people.map((person) => {
        const key = person.counterparty_email || person.counterparty_display_name;
        const netColor = person.net === 0 ? theme.colors.textTertiary : person.net > 0 ? theme.colors.success : theme.colors.error;
        const expanded = expandedKey === key;

        return (
          <View key={key} style={styles.card}>
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => setExpandedKey(expanded ? null : key)}
            >
              <View style={[styles.avatar, { backgroundColor: memberColor(key) }]}>
                <Text style={styles.avatarText}>{initialsFromName(person.counterparty_display_name)}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{person.counterparty_display_name}</Text>
                <Text style={styles.groupCount}>
                  {person.groups.length} group{person.groups.length === 1 ? '' : 's'}
                </Text>
              </View>
              <Text style={[styles.netAmount, { color: netColor }]}>{formatSignedMoney(person.net)}</Text>
              <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
            </TouchableOpacity>

            {expanded && (
              <View style={styles.subRows}>
                {person.groups.map((g) => {
                  const subColor = g.net === 0 ? theme.colors.textTertiary : g.net > 0 ? theme.colors.success : theme.colors.error;
                  return (
                    <View key={g.group_id} style={styles.subRow}>
                      <Text style={styles.subRowName} numberOfLines={1}>{g.name}</Text>
                      <Text style={[styles.subRowAmount, { color: subColor }]}>{formatSignedMoney(g.net)}</Text>
                      {g.net !== 0 && (
                        <TouchableOpacity style={styles.subSettleBtn} onPress={() => goSettle(g.group_id, person)}>
                          <Text style={styles.subSettleBtnText}>Settle</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
                {/* Only shown for a single shared group — an aggregate "Record ... paid" action
                    wouldn't be unambiguous for a multi-group person; each sub-row above already
                    has its own group-scoped Settle button for that case. */}
                {person.groups.length === 1 && person.net !== 0 && (
                  <TouchableOpacity
                    style={styles.settleBtn}
                    onPress={() => goSettle(person.groups[0].group_id, person)}
                  >
                    <Text style={styles.settleBtnText}>{settleLabel(person.counterparty_display_name, person.net)}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    list: { paddingTop: 4 },
    summaryLine: { marginHorizontal: 16, marginBottom: 10, fontSize: 12.5, fontVariant: ['tabular-nums'] },
    summaryMuted: { color: theme.colors.textTertiary, fontFamily: 'Inter-Regular' },
    card: {
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16,
      marginTop: 10,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderLight,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
    },
    avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    avatarText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 14 },
    info: { flex: 1 },
    name: { fontFamily: 'Inter-SemiBold', fontSize: 16, color: theme.colors.text },
    groupCount: { fontFamily: 'Inter-Regular', fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
    netAmount: { fontFamily: 'Inter-Bold', fontSize: 15 },
    chevron: { fontFamily: 'Inter-Regular', fontSize: 13, color: theme.colors.textTertiary, marginLeft: 8 },
    settleBtn: {
      marginHorizontal: 14,
      marginTop: 10,
      marginBottom: 14,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: `${theme.colors.primary}18`,
    },
    settleBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 13, color: theme.colors.primary },
    subRows: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.borderLight,
    },
    subRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.borderLight,
    },
    subRowName: { flex: 1, fontFamily: 'Inter-Regular', fontSize: 13, color: theme.colors.text },
    subRowAmount: { fontFamily: 'Inter-SemiBold', fontSize: 13, marginRight: 10 },
    subSettleBtn: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: `${theme.colors.primary}18`,
    },
    subSettleBtnText: { fontFamily: 'Inter-SemiBold', fontSize: 11, color: theme.colors.primary },
    emptyCenter: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
    emptyIcon: { fontSize: 56, marginBottom: 14 },
    emptyTitle: { fontFamily: 'Inter-Bold', fontSize: 18, color: theme.colors.text, textAlign: 'center' },
    emptySubtitle: { fontFamily: 'Inter-Regular', fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 6 },
  });
