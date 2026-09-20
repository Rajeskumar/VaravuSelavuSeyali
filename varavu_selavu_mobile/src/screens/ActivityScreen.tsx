/**
 * ActivityScreen.tsx — V2 "Activity" (Flows 3.2), reached from the Home bell. One dated stream of
 * group activity, recurring items coming due, budgets needing attention and the biggest change vs
 * last month. Assembled client-side from existing endpoints (see utils/activityFeed.ts) — there is
 * no server-side inbox, so no unread state.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import ScreenWrapper from '../components/ScreenWrapper';
import ScreenHeader from '../components/ScreenHeader';
import { checkGroupsEnabled, listGroups, getGroupActivity, getGroupDetail } from '../api/groups';
import { getRecurringDue } from '../api/recurring';
import { listBudgets } from '../api/budgets';
import { getChangeInsights } from '../api/analytics';
import { useBudgetsEnabled } from '../hooks/useBudgetsEnabled';
import { describeGroupActivity, mergeFeed, relativeShort, FeedItem, FeedTone } from '../utils/activityFeed';

const PER_GROUP = 8;

export default function ActivityScreen() {
  const { accessToken, userEmail } = useAuth();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const now = useMemo(() => new Date(), []);
  const { enabled: budgetsEnabled } = useBudgetsEnabled();

  const toneColor: Record<FeedTone, string> = {
    cyan: theme.colors.secondary,
    green: theme.colors.success,
    amber: theme.colors.warning,
    violet: theme.colors.primary,
    muted: theme.colors.textTertiary,
  };

  const { data: groupsEnabled } = useQuery({ queryKey: ['groupsEnabled'], queryFn: checkGroupsEnabled });

  const { data: groupItems, isLoading: loadingGroups } = useQuery({
    queryKey: ['activity-feed', 'groups'],
    enabled: !!accessToken && !!groupsEnabled,
    queryFn: async (): Promise<FeedItem[]> => {
      const groups = await listGroups(false);
      const perGroup = await Promise.all(groups.map(async (g) => {
        const [detail, activity] = await Promise.all([
          getGroupDetail(g.group_id),
          getGroupActivity(g.group_id, PER_GROUP, 0),
        ]);
        const nameFor = (id: string | null) =>
          (id && detail.members.find((m) => m.member_id === id)?.display_name) || 'Someone';
        return activity.items
          .map((a) => describeGroupActivity(a, g.name, nameFor))
          .filter((x): x is FeedItem => x !== null);
      }));
      return perGroup.flat();
    },
  });

  const { data: dueItems } = useQuery({
    queryKey: ['activity-feed', 'recurring'],
    enabled: !!accessToken,
    queryFn: async (): Promise<FeedItem[]> => {
      const due = await getRecurringDue().catch(() => []);
      return due.map((d) => ({
        id: `r-${d.template_id}-${d.date_iso}`,
        title: `${d.description} due ${relativeShort(new Date(`${d.date_iso}T12:00:00`), now)}`,
        body: `Recurring · $${d.suggested_cost.toFixed(2)} on ${new Date(`${d.date_iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        at: new Date(`${d.date_iso}T12:00:00`),
        tone: 'violet' as const,
      }));
    },
  });

  const { data: budgetItems } = useQuery({
    queryKey: ['activity-feed', 'budgets'],
    enabled: !!accessToken && budgetsEnabled,
    queryFn: async (): Promise<FeedItem[]> => {
      const budgets = await listBudgets().catch(() => []);
      return budgets
        .filter((b) => b.status === 'exceeded' || b.status === 'over_pace' || b.status === 'at_risk')
        .map((b) => ({
          id: `b-${b.id}`,
          title: `${b.category ?? 'Overall'} budget ${b.status === 'exceeded' ? 'exceeded' : b.status === 'over_pace' ? 'is over pace' : 'is at risk'}`,
          body: `$${b.spent.toFixed(2)} of $${b.amount.toFixed(2)}`,
          at: now,
          tone: 'amber' as const,
        }));
    },
  });

  const { data: changeItems } = useQuery({
    queryKey: ['activity-feed', 'changes', userEmail],
    enabled: !!accessToken && !!userEmail,
    queryFn: async (): Promise<FeedItem[]> => {
      const changes = await getChangeInsights(userEmail!, { year: now.getFullYear(), month: now.getMonth() + 1 }).catch(() => []);
      return changes.slice(0, 2).map((c, i) => ({
        id: `c-${i}-${c.metric_name}`,
        title: `${c.metric_name} is ${c.change_percent > 0 ? 'up' : 'down'} ${Math.abs(c.change_percent).toFixed(0)}% vs last month`,
        body: c.entity_name || 'Tap Insights to see what drove it',
        at: now,
        tone: 'amber' as const,
      }));
    },
  });

  const feed = useMemo(
    () => mergeFeed(groupItems ?? [], dueItems ?? [], budgetItems ?? [], changeItems ?? []),
    [groupItems, dueItems, budgetItems, changeItems],
  );

  return (
    <ScreenWrapper>
      <ScreenHeader title="Activity" back />
      {loadingGroups && feed.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={theme.colors.primary} /></View>
      ) : feed.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Nothing yet</Text>
          <Text style={styles.emptyBody}>Group activity, due recurring expenses and budget alerts show up here.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          {feed.map((n) => (
            <View key={n.id} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: toneColor[n.tone] }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title}>{n.title}</Text>
                {n.body ? <Text style={styles.body}>{n.body}</Text> : null}
              </View>
              <Text style={styles.when}>{relativeShort(n.at, now)}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </ScreenWrapper>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  center: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 24 },
  emptyTitle: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 17, color: theme.colors.text, marginBottom: 6 },
  emptyBody: { fontFamily: theme.typography.fontFamily.regular, fontSize: 14, color: theme.colors.textTertiary, textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row', gap: 13, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  title: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 15, lineHeight: 20, color: theme.colors.text },
  body: { fontFamily: theme.typography.fontFamily.regular, fontSize: 13, lineHeight: 18, color: theme.colors.textTertiary, marginTop: 4 },
  when: { fontFamily: theme.typography.fontFamily.monoRegular, fontSize: 11, color: theme.colors.textQuaternary },
});
