/**
 * GroupsScreen.tsx — Lists the user's groups.
 *
 * Feature-flag gate: if the backend returns 404 for /groups, shows a
 * "coming soon" placeholder consistent with the web GroupsPage.
 *
 * Navigation: tap a group → GroupDetailScreen
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Pressable,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  listGroups,
  createGroup,
  ApiError,
  GroupSummary,
} from '../api/groups';
import { useAppTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { AppTheme, withAlpha, directionalColor, inkOnPastel } from '../theme';
import { categoryTone } from '../utils/categoryCode';
import ScreenWrapper from '../components/ScreenWrapper';
import TopTabs from '../components/TopTabs';
import ScreenHeader from '../components/ScreenHeader';
import SectionLabel from '../components/SectionLabel';
import ListRow from '../components/ListRow';
import PeopleList from '../components/PeopleList';
import { showToast } from '../components/Toast';
import { onExpenseChanged } from '../utils/expenseEvents';

const GROUP_TYPE_OPTIONS = ['other', 'trip', 'home', 'couple'] as const;
type GroupTypeOption = typeof GROUP_TYPE_OPTIONS[number];

const GROUP_TYPE_EMOJI: Record<GroupTypeOption, string> = {
  other: '👥',
  trip: '✈️',
  home: '🏠',
  couple: '💑',
};

export default function GroupsScreen() {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<GroupTypeOption>('other');

  // V2: one tab strip — Groups | People | Archived. People is a first-class promotion of what
  // used to be the small embedded FriendBalancesWidget card; Archived is the old Active/Archived
  // sub-toggle folded up a level. `tabIndex` keeps its old meaning (0 = active, 1 = archived).
  type Section = 'groups' | 'people' | 'archived';
  const [section, setSection] = useState<Section>('groups');
  const tabIndex = section === 'archived' ? 1 : 0;

  // Dashboard's "Net with people" tap navigates here with `{ initialTab: 'people' }` (see
  // HomeScreen.tsx) — same pattern AIAnalystScreen already uses for `initialQuery`.
  useEffect(() => {
    if (route.params?.initialTab === 'people') setSection('people');
  }, [route.params?.initialTab]);

  // General-purpose fix (not specific to any one entry point): any expense change anywhere
  // (Add Expense sheet, type-to-log, AI chat) previously left this screen's group balances and
  // People's friend balances stale until a manual pull-to-refresh, since neither query was
  // subscribed to this event and the app's QueryClient has refetchOnWindowFocus: false.
  useEffect(() => {
    return onExpenseChanged(() => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['friend-balances'] });
    });
  }, [qc]);

  const includeArchived = tabIndex === 1;
  const { data, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey: ['groups', includeArchived],
    queryFn: () => listGroups(includeArchived),
    retry: (count, err) => {
      // Don't retry on 404 — it means the feature flag is off
      if (err instanceof ApiError && err.status === 404) return false;
      return count < 2;
    },
  });

  const createMut = useMutation({
    mutationFn: () => createGroup({ name: newName.trim(), group_type: newType }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      setShowCreate(false);
      setNewName('');
      setNewType('other');
      navigation.navigate('GroupDetail', { groupId: created.group_id });
    },
    onError: (e: any) => {
      showToast({ message: e.message ?? 'Failed to create group', type: 'error' });
    },
  });

  // Feature flag: backend returns 404 when GROUPS_ENABLED=false
  const notEnabled = error instanceof ApiError && error.status === 404;

  if (notEnabled) {
    return (
      <ScreenWrapper>
        <View style={styles.emptyCenter}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>Groups isn't available yet</Text>
          <Text style={styles.emptySubtitle}>
            This feature is being rolled out — check back soon.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  const allGroups: GroupSummary[] = data ?? [];
  const groups = allGroups.filter((g) => {
    if (tabIndex === 0) return g.status === 'active';
    if (tabIndex === 1) return g.status === 'archived';
    return false;
  });

  // Net across the groups on screen — the "Across all groups" figure leading the list.
  const netAcross = groups.reduce((sum, g) => sum + g.my_balance, 0);

  const renderItem = ({ item }: { item: GroupSummary }) => {
    const tone = categoryTone(item.name);
    const owes = item.my_balance < 0;
    const owed = item.my_balance > 0;
    return (
      <ListRow
        leading={(
          <View style={[styles.groupTile, { backgroundColor: withAlpha(tone, 0.14) }]}>
            <Text style={[styles.groupInitial, { color: tone }]}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        title={item.name}
        meta={`${item.member_count} member${item.member_count !== 1 ? 's' : ''}${item.status === 'archived' ? ' · archived' : ''}`}
        trailing={(
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.balanceLabel}>{owes ? 'you owe' : owed ? 'you are owed' : 'settled'}</Text>
            <Text style={[styles.balanceAmount, { color: item.my_balance === 0 ? theme.colors.textTertiary : directionalColor(theme, item.my_balance) }]}>
              ${Math.abs(item.my_balance).toFixed(2)}
            </Text>
          </View>
        )}
        style={{ paddingVertical: 15, gap: 14 }}
        onPress={() => navigation.navigate('GroupDetail', { groupId: item.group_id })}
      />
    );
  };

  return (
    <ScreenWrapper>
      <ScreenHeader
        title="Groups"
        right={section !== 'people' ? (
          <TouchableOpacity activeOpacity={0.8} onPress={() => setShowCreate(true)} accessibilityRole="button" accessibilityLabel="New group">
            <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.newBtn}>
              <Text style={styles.newBtnText}>New</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : undefined}
      />

      <TopTabs<Section>
        value={section}
        onChange={setSection}
        options={[
          { value: 'groups', label: 'Groups' },
          { value: 'people', label: 'People' },
          { value: 'archived', label: 'Archived' },
        ]}
      />

      {section === 'people' ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
          <PeopleList />
        </ScrollView>
      ) : (
      <FlatList
        data={groups}
        keyExtractor={(item) => item.group_id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 140 }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={groups.length > 0 ? (
          <View style={styles.aggregate}>
            <SectionLabel>{section === 'archived' ? 'Across archived groups' : 'Across all groups'}</SectionLabel>
            <Text style={[styles.aggregateAmount, { color: netAcross === 0 ? theme.colors.textTertiary : directionalColor(theme, netAcross) }]}>
              {netAcross === 0 ? '$0.00' : `${netAcross > 0 ? '+' : '−'}$${Math.abs(netAcross).toFixed(2)}`}
            </Text>
          </View>
        ) : null}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
          ) : (
            <View style={styles.emptyCenter}>
              <Text style={styles.emptyTitle}>
                {tabIndex === 0 ? 'No active groups' : 'No archived groups'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {tabIndex === 0
                  ? 'Create a group to split expenses with friends'
                  : 'Archived groups will appear here'}
              </Text>
            </View>
          )
        }
      />
      )}

      {/* Create Group Modal */}
      <Modal
        visible={showCreate}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreate(false)}
      >
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowCreate(false)}
          />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <ScrollView 
              keyboardShouldPersistTaps="handled" 
              bounces={false} 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
            >
              <View style={styles.modalPill} />
              <Text style={styles.modalTitle}>New Group</Text>

              <TextInput
                style={styles.input}
                placeholder="Group name (e.g., Apartment 4B)"
                placeholderTextColor={theme.colors.textTertiary}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                maxLength={80}
              />

              <Text style={styles.typeLabel}>Type</Text>
              <View style={styles.typeRow}>
                {GROUP_TYPE_OPTIONS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, newType === t && styles.typeBtnActive]}
                    onPress={() => setNewType(t)}
                  >
                    <Text style={styles.typeEmoji}>{GROUP_TYPE_EMOJI[t]}</Text>
                    <Text style={[styles.typeBtnLabel, newType === t && styles.typeBtnLabelActive]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.createBtn, (!newName.trim() || createMut.isPending) && styles.createBtnDisabled]}
                onPress={() => createMut.mutate()}
                disabled={!newName.trim() || createMut.isPending}
              >
                {createMut.isPending ? (
                  <ActivityIndicator color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.createBtnText}>Create</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenWrapper>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    listContent: { flexGrow: 1 },
    newBtn: { height: 36, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    newBtnText: { fontFamily: 'InstrumentSans-Bold', fontSize: 14, color: inkOnPastel },
    aggregate: {
      marginTop: 18, paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
    },
    aggregateAmount: {
      fontFamily: 'BricolageGrotesque-SemiBold', fontSize: 34, letterSpacing: -1.4, marginTop: 4,
      fontVariant: ['tabular-nums'],
    },
    groupTile: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    groupInitial: { fontFamily: 'InstrumentSans-Bold', fontSize: 15 },
    balanceLabel: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 11, color: theme.colors.textTertiary },
    balanceAmount: { fontFamily: 'InstrumentSans-Bold', fontSize: 16, marginTop: 2, fontVariant: ['tabular-nums'] },
    emptyCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingTop: 60,
    },
    emptyIcon: { fontSize: 64, marginBottom: 16 },
    emptyTitle: {
      fontFamily: 'InstrumentSans-Bold',
      fontSize: 20,
      color: theme.colors.text,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 15,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 24,
    },
    // Create modal
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalSheet: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingTop: 12,
      gap: 12,
    },
    modalPill: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.borderLight,
      alignSelf: 'center',
      marginBottom: 8,
    },
    modalTitle: {
      fontFamily: 'InstrumentSans-Bold',
      fontSize: 20,
      color: theme.colors.text,
      textAlign: 'center',
    },
    input: {
      backgroundColor: theme.colors.surfaceSecondary,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 16,
      color: theme.colors.text,
    },
    typeLabel: {
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    typeRow: { flexDirection: 'row', gap: 8 },
    typeBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: theme.colors.borderLight,
    },
    typeBtnActive: {
      borderColor: theme.colors.primary,
      backgroundColor: `${theme.colors.primary}18`,
    },
    typeEmoji: { fontSize: 22, marginBottom: 4 },
    typeBtnLabel: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    typeBtnLabelActive: {
      color: theme.colors.primary,
      fontFamily: 'InstrumentSans-SemiBold',
    },
    createBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    createBtnDisabled: { opacity: 0.5 },
    createBtnText: { color: theme.colors.textInverse, fontFamily: 'InstrumentSans-Bold', fontSize: 16 },
  });
