/**
 * GroupDetailScreen.tsx — Two-tab screen for a single group.
 *
 * Tab 1 (Expenses): list of group expenses, each showing the user's share.
 * Tab 2 (Balances): BalanceRow list + "Settle Up" button.
 *
 * Scope note (TS-GRP-109): Stats and Activity tabs are listed in §12.2 as
 * optional for Phase 1 — omitted here, to be added in a follow-up.
 */
import React, { useState, useCallback, useEffect, useRef, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  getGroupDetail,
  listGroupExpenses,
  getGroupBalances,
  addMember,
  GroupExpenseRow,
  MemberBalance,
  BalanceTransfer,
  MemberDTO,
  ApiError,
  deleteGroupExpense,
} from '../api/groups';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { AppTheme, inkOnPastel, directionalColor } from '../theme';
import { myShareDelta } from '../utils/expenseInsights';
import { groupRowsByDay } from '../utils/dayGroups';
import TopTabs from '../components/TopTabs';
import TintGlow from '../components/TintGlow';
import IconButton from '../components/IconButton';
import SectionLabel from '../components/SectionLabel';
import ListRow from '../components/ListRow';
import BalanceRow from '../components/BalanceRow';
import SettleUpSheet from '../components/SettleUpSheet';
import GroupSettingsSheet from '../components/GroupSettingsSheet';
import ActivityList from '../components/ActivityList';
import ExpenseDetailSheet from '../components/ExpenseDetailSheet';
import EditGroupExpenseModal from '../components/EditGroupExpenseModal';
import Badge from '../components/Badge';
import { showToast } from '../components/Toast';
import { formatCurrency } from '../utils/currencyMath';
import { memberColor, initialsFromName } from '../components/BalanceRow';
import { AddExpenseContext } from './AddExpenseScreen';

type Tab = 'expenses' | 'balances' | 'activity';

export default function GroupDetailScreen() {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { userEmail } = useAuth();
  const qc = useQueryClient();
  const { openAddExpense } = useContext(AddExpenseContext);

  const groupId: string = route.params?.groupId ?? '';

  const [activeTab, setActiveTab] = useState<Tab>('expenses');
  const [settleUpVisible, setSettleUpVisible] = useState(false);
  const [settleFrom, setSettleFrom] = useState<string | null>(null);
  const [settleTo, setSettleTo] = useState<string | null>(null);
  const [settleSuggested, setSettleSuggested] = useState(0);
  // Set only by the header's "Settle up": every transfer I owe, shown as a list (V2 settle sheet).
  const [settleTransfers, setSettleTransfers] = useState<BalanceTransfer[] | null>(null);

  const [settingsVisible, setSettingsVisible] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<GroupExpenseRow | null>(null);

  // Invite dialog state
  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<GroupExpenseRow | null>(null);

  const {
    data: detail,
    isLoading: detailLoading,
  } = useQuery({
    queryKey: ['group-detail', groupId],
    queryFn: () => getGroupDetail(groupId),
    enabled: !!groupId,
  });

  const {
    data: expenseData,
    isLoading: expensesLoading,
    isRefetching: expensesRefetching,
    refetch: refetchExpenses,
  } = useQuery({
    queryKey: ['group-expenses', groupId],
    queryFn: () => listGroupExpenses(groupId, 0, 50),
    enabled: !!groupId,
  });

  const {
    data: balanceData,
    isLoading: balancesLoading,
    isRefetching: balancesRefetching,
    refetch: refetchBalances,
  } = useQuery({
    queryKey: ['group-balances', groupId],
    queryFn: () => getGroupBalances(groupId),
    enabled: !!groupId,
  });

  const members: MemberDTO[] = detail?.members ?? [];
  const expenses: GroupExpenseRow[] = expenseData?.items ?? [];
  const balances: MemberBalance[] = balanceData?.members ?? [];
  // Same Today/Yesterday/"Sep 20" day sections as the personal Expenses tab (parity fix) —
  // GroupExpenseRow has no `amount` field, so each row is given one aliased from `cost` for
  // groupRowsByDay's generic constraint; every other field (payer_summary, category, ...) is
  // preserved untouched for renderExpense below.
  const dayGroups = React.useMemo(
    () => groupRowsByDay(expenses.map((e) => ({ ...e, amount: e.cost }))),
    [expenses],
  );
  const expenseSections = React.useMemo(
    () => dayGroups.map((g) => ({ key: g.dateKey, label: g.label, subtotal: g.subtotal, data: g.items })),
    [dayGroups],
  );

  const nameFor = (id: string) => members.find((m) => m.member_id === id)?.display_name ?? 'Unknown';

  const myMember = members.find((m) => m.user_email === userEmail);
  const myBalance = balances.find((b) => b.member_id === myMember?.member_id)?.net ?? 0;
  // TrackSpense v3 Mobile mock's balance display: a small uppercase label + a big centered
  // figure (✓ glyph when settled, matching `gdBalLabel`/`gdBal`), not a left-aligned banner
  // sentence.
  const balanceColor = myBalance === 0 ? theme.colors.textSecondary : directionalColor(theme, myBalance);
  const balanceLabel = myBalance === 0 ? "You're all settled up" : myBalance > 0 ? "You're owed" : 'You owe';
  const balanceFigure = myBalance === 0 ? '✓' : formatCurrency(Math.abs(myBalance));

  // Moved above the early-return loading/not-found guards below (was previously defined further
  // down, after those guards) so the new auto-open effect right below it — which must run
  // unconditionally on every render per the Rules of Hooks — can reference it.
  const handleSettleUp = (balance: MemberBalance) => {
    if (!myMember) return;
    setSettleTransfers(null);
    if (balance.net < 0 && balance.member_id !== myMember.member_id) {
      setSettleFrom(myMember.member_id);
      setSettleTo(balance.member_id);
      setSettleSuggested(Math.abs(balance.net));
    } else {
      setSettleFrom(balance.member_id);
      setSettleTo(myMember.member_id);
      setSettleSuggested(Math.abs(balance.net));
    }
    setSettleUpVisible(true);
  };

  // TrackSpense v3 People tab: `PeopleList` can't call `handleSettleUp` directly (it only has
  // FriendBalanceDTO's counterparty_email/display_name, not a member_id), so it navigates here
  // with `settleCounterpartyEmail`/`settleCounterpartyName` route params instead and this effect
  // resolves the matching member once data has loaded, then reuses the existing settle-up
  // mechanism unchanged. Matches by email first (reliable — both are real account emails);
  // falls back to display-name for placeholder (no-email) members. One-shot via the ref guard so
  // re-renders (e.g. from a subsequent balances refetch) don't re-open the sheet after the user
  // has already closed it.
  const hasAutoOpenedSettleRef = useRef(false);
  useEffect(() => {
    if (hasAutoOpenedSettleRef.current) return;
    const targetEmail = route.params?.settleCounterpartyEmail;
    const targetName = route.params?.settleCounterpartyName;
    if (!targetEmail && !targetName) return;
    if (!members.length || !balances.length || !myMember) return;
    const targetMember = members.find(
      (m) => (targetEmail && m.user_email === targetEmail) || (!targetEmail && m.display_name === targetName)
    );
    const targetBalance = targetMember && balances.find((b) => b.member_id === targetMember.member_id);
    if (targetBalance) {
      hasAutoOpenedSettleRef.current = true;
      handleSettleUp(targetBalance);
    }
  }, [members, balances, myMember, route.params?.settleCounterpartyEmail, route.params?.settleCounterpartyName]);

  const handleAddMember = async () => {
    setInviteLoading(true);
    try {
      const newMember = await addMember(groupId, inviteEmail.trim() || undefined, inviteName.trim() || undefined);
      showToast({ message: 'Member added', type: 'success' });
      qc.invalidateQueries({ queryKey: ['group-detail', groupId] });
      setInviteVisible(false);
      setInviteEmail('');
      setInviteName('');
    } catch (e: any) {
      showToast({ message: e.message ?? 'Failed to add member', type: 'error' });
    } finally {
      setInviteLoading(false);
    }
  };

  if (detailLoading || expensesLoading) {
    return (
      <View style={styles.loadingCenter}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.loadingCenter}>
        <Text style={styles.errorText}>Group not found.</Text>
      </View>
    );
  }

  const isArchived = detail.status === 'archived';

  const handleEditExpense = (expense: GroupExpenseRow) => {
    setEditingExpense(expense);
    setEditModalVisible(true);
  };

  const handleDeleteExpense = (expenseId: string) => {
    Alert.alert('Delete Expense', 'Are you sure you want to delete this expense?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteGroupExpense(groupId, expenseId);
            showToast({ message: 'Expense deleted', type: 'success' });
            qc.invalidateQueries({ queryKey: ['group-expenses', groupId] });
            qc.invalidateQueries({ queryKey: ['group-balances', groupId] });
            qc.invalidateQueries({ queryKey: ['group-detail', groupId] });
          } catch (error) {
            showToast({ message: 'Failed to delete expense', type: 'error' });
          }
        },
      },
    ]);
  };

  // V2 group row: category tile, "paid by" meta, total with a signed "you +$X" delta beneath.
  // Tap opens the detail sheet (comments, history, settle-my-share, Edit).
  const renderExpense = ({ item }: { item: GroupExpenseRow }) => {
    const payerNames = item.payer_summary
      .map((p) => members.find((m) => m.member_id === p.member_id)?.display_name ?? '?')
      .join(', ');
    const delta = myShareDelta(item, myMember?.member_id);
    return (
      <ListRow
        category={item.category}
        title={item.description}
        meta={`paid by ${payerNames}`}
        onPress={() => setSelectedExpense(item)}
        trailing={(
          <View style={styles.expenseTrailing}>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.expenseTotal}>{formatCurrency(item.cost)}</Text>
              {delta !== 0 && (
                <Text style={[styles.expenseDelta, { color: directionalColor(theme, delta) }]}>
                  you {delta > 0 ? '+' : '−'}{formatCurrency(Math.abs(delta))}
                </Text>
              )}
            </View>
          </View>
        )}
      />
    );
  };

  // "Settle up" under the balance: pre-fill the sheet with the first suggested transfer where I'm
  // the payer, otherwise open it blank so the user can pick who paid whom.
  const handleSettleUpAction = () => {
    const allMine = (balanceData?.transfers ?? []).filter((t) => t.from_member_id === myMember?.member_id);
    const mine = allMine[0];
    setSettleTransfers(allMine.length > 0 ? allMine : null);
    setSettleFrom(mine ? mine.from_member_id : null);
    setSettleTo(mine ? mine.to_member_id : null);
    setSettleSuggested(mine ? mine.amount : 0);
    setSettleUpVisible(true);
  };

  const renderBalance = ({ item }: { item: MemberBalance }) => (
    <TouchableOpacity
      onPress={() => {
        if (item.net !== 0 && !isArchived) {
          handleSettleUp(item);
        }
      }}
      activeOpacity={item.net !== 0 && !isArchived ? 0.7 : 1}
    >
      <BalanceRow balance={item} isCurrentUser={item.member_id === myMember?.member_id} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: 0 }]}>
      {myBalance !== 0 && <TintGlow color={balanceColor} />}
      {isArchived && (
        <View style={[styles.banner, { backgroundColor: theme.colors.warning + '20', borderColor: theme.colors.warning }]}>
          <Text style={[styles.bannerText, { color: theme.colors.warning }]}>
            This group is archived — you can still view its history, but adding or editing
            anything is locked. Unarchive from Settings to make changes.
          </Text>
        </View>
      )}

      {detail.status === 'deleted' && (
        <View style={[styles.banner, { backgroundColor: theme.colors.error + '20', borderColor: theme.colors.error }]}>
          <Text style={[styles.bannerText, { color: theme.colors.error }]}>
            This group has been deleted. It will be permanently removed after 30 days.
          </Text>
        </View>
      )}

      {/* V2 header: back, group name, "···" → settings. */}
      <View style={styles.headerRow}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => navigation.goBack()} />
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerName} numberOfLines={1}>{detail.name}</Text>
          {isArchived && <Badge label="Archived" tone="caution" />}
        </View>
        <IconButton icon="ellipsis-horizontal" accessibilityLabel="Group settings" onPress={() => setSettingsVisible(true)} />
      </View>

      {/* Balance leads; both actions sit under it. */}
      <View style={styles.balanceBlock}>
        <SectionLabel>{balanceLabel}</SectionLabel>
        <Text style={[styles.balanceFigure, { color: balanceColor }]}>{balanceFigure}</Text>
        <View style={styles.memberLine}>
          <View style={{ flexDirection: 'row' }}>
            {members.slice(0, 4).map((m, i) => (
              <View
                key={m.member_id}
                style={[styles.avatarStack, { backgroundColor: memberColor(m.member_id), marginLeft: i === 0 ? 0 : -8 }]}
              >
                <Text style={styles.avatarStackText}>{initialsFromName(m.display_name)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.memberText}>
            {members.length} member{members.length === 1 ? '' : 's'}{detail.simplify_debts ? ' · simplified debts on' : ''}
          </Text>
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[{ flex: 1 }, isArchived && styles.actionBtnDisabled]}
            onPress={() => !isArchived && openAddExpense(groupId)}
            disabled={isArchived}
            activeOpacity={0.85}
          >
            <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.addExpenseBtn}>
              <Text style={styles.addExpenseBtnText}>Add expense</Text>
            </LinearGradient>
          </TouchableOpacity>
          {/* Opens the settle sheet pre-filled with the transfer I owe, if any; stays enabled when
              archived so browsing is never blocked — the sheet's own mutation is what's locked. */}
          <TouchableOpacity style={styles.settleUpLinkBtn} onPress={handleSettleUpAction} activeOpacity={0.85}>
            <Text style={styles.settleUpLinkText}>Settle up</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabBar}>
        <TopTabs<Tab>
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'expenses', label: 'Expenses' },
            { value: 'balances', label: 'Balances' },
            { value: 'activity', label: 'Activity' },
          ]}
        />
      </View>

      {activeTab === 'expenses' && (
        <>
          <View style={styles.expensesList}>
            <SectionList
              sections={expenseSections}
              keyExtractor={(item) => item.row_id}
              renderItem={renderExpense}
              renderSectionHeader={({ section }) => (
                <View style={styles.daySectionHeader}>
                  <SectionLabel>{section.label}</SectionLabel>
                  <Text style={styles.daySectionSubtotal}>{formatCurrency(section.subtotal)}</Text>
                </View>
              )}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              refreshControl={<RefreshControl refreshing={expensesRefetching} onRefresh={refetchExpenses} tintColor={theme.colors.primary} />}
            />
          </View>
        </>
      )}

      {activeTab === 'balances' && (
        <View style={{ flex: 1 }}>
          <FlatList
            data={balances}
            keyExtractor={(item) => item.member_id}
            renderItem={renderBalance}
            contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
            refreshControl={<RefreshControl refreshing={balancesRefetching} onRefresh={refetchBalances} tintColor={theme.colors.primary} />}
            ListHeaderComponent={() => (
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.sectionTitle}>Group Balances</Text>
                  {detail.simplify_debts && (
                    <View style={styles.simplifiedBadge}>
                      <Text style={[styles.simplifiedText, { color: theme.colors.primary }]}>Simplified</Text>
                    </View>
                  )}
                </View>
                {balanceData?.transfers && balanceData.transfers.length > 0 && (
                  <View style={[styles.transfersCard, { borderBottomColor: theme.colors.border }]}>
                    <Text style={styles.transfersTitle}>Suggested Transfers</Text>
                    {balanceData.transfers.map((t, idx) => (
                      <View key={idx} style={styles.transferRow}>
                        <Text style={styles.transferText}>
                          <Text style={{ fontWeight: '600' }}>{nameFor(t.from_member_id)}</Text>
                          {' owes '}
                          <Text style={{ fontWeight: '600' }}>{nameFor(t.to_member_id)}</Text>
                        </Text>
                        <Text style={styles.transferAmount}>${t.amount.toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          />
          {/* Settle Up FAB */}
          {!isArchived && (
            <TouchableOpacity
              style={[styles.settleBtn, { bottom: insets.bottom + 16 }]}
              onPress={() => {
                setSettleTransfers(null);
                setSettleFrom(null);
                setSettleTo(null);
                setSettleSuggested(0);
                setSettleUpVisible(true);
              }}
            >
              <Text style={styles.settleBtnText}>Settle Up</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {activeTab === 'activity' && <ActivityList groupId={groupId} group={detail} />}

      <SettleUpSheet
        visible={settleUpVisible}
        groupId={groupId}
        members={members}
        balances={balances}
        fromMemberId={settleFrom}
        toMemberId={settleTo}
        suggestedAmount={settleSuggested}
        transfers={settleTransfers ?? undefined}
        onClose={() => setSettleUpVisible(false)}
        onSettled={() => {
          qc.invalidateQueries({ queryKey: ['group-balances', groupId] });
          qc.invalidateQueries({ queryKey: ['group-expenses', groupId] });
        }}
      />

      <GroupSettingsSheet visible={settingsVisible} onClose={() => setSettingsVisible(false)} group={detail} />

      <ExpenseDetailSheet
        visible={!!selectedExpense}
        onClose={() => setSelectedExpense(null)}
        groupId={groupId}
        expense={selectedExpense}
        members={members}
        myMemberId={myMember?.member_id}
        readOnly={isArchived}
        onEdit={(e) => { setSelectedExpense(null); handleEditExpense(e); }}
        onSettled={() => {
          qc.invalidateQueries({ queryKey: ['group-balances', groupId] });
          qc.invalidateQueries({ queryKey: ['group-expenses', groupId] });
          setSelectedExpense(null);
        }}
        onDeleted={() => {
          setSelectedExpense(null);
          qc.invalidateQueries({ queryKey: ['group-expenses', groupId] });
          qc.invalidateQueries({ queryKey: ['group-balances', groupId] });
          qc.invalidateQueries({ queryKey: ['group-detail', groupId] });
        }}
      />

      <EditGroupExpenseModal
        visible={editModalVisible}
        groupId={groupId}
        expense={editingExpense}
        members={members}
        onClose={() => {
          setEditModalVisible(false);
          setEditingExpense(null);
        }}
        onUpdated={() => {
          qc.invalidateQueries({ queryKey: ['group-expenses', groupId] });
          qc.invalidateQueries({ queryKey: ['group-balances', groupId] });
          qc.invalidateQueries({ queryKey: ['group-detail', groupId] });
        }}
      />

      <Modal visible={inviteVisible} transparent animationType="slide" onRequestClose={() => setInviteVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setInviteVisible(false)} />
        <View style={[styles.inviteSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.modalPill} />
          <Text style={styles.inviteTitle}>Add Member</Text>
          <TextInput
            style={styles.input}
            placeholder="Email (links to registered account)"
            placeholderTextColor={theme.colors.textTertiary}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Display name (for placeholder members)"
            placeholderTextColor={theme.colors.textTertiary}
            value={inviteName}
            onChangeText={setInviteName}
          />
          <TouchableOpacity
            style={[styles.createBtn, (!inviteEmail.trim() && !inviteName.trim()) && styles.createBtnDisabled]}
            onPress={handleAddMember}
            disabled={inviteLoading || (!inviteEmail.trim() && !inviteName.trim())}
          >
            {inviteLoading ? <ActivityIndicator color={theme.colors.textInverse} /> : <Text style={styles.createBtnText}>Add</Text>}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorText: { fontFamily: 'InstrumentSans-Regular', fontSize: 16, color: theme.colors.error },
    backLink: { color: theme.colors.primary, fontFamily: 'InstrumentSans-SemiBold', marginTop: 12 },
    banner: {
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
    },
    bannerText: {
      fontSize: 14,
      fontFamily: 'InstrumentSans-Medium',
      textAlign: 'center',
    },
    headerRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 22, paddingTop: 56, paddingBottom: 14,
    },
    headerTitleWrap: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
    headerName: { fontFamily: 'InstrumentSans-Bold', fontSize: 16, color: theme.colors.text },
    balanceBlock: { paddingHorizontal: 22 },
    balanceFigure: { fontFamily: 'BricolageGrotesque-SemiBold', fontSize: 48, letterSpacing: -2.2, marginTop: 4, fontVariant: ['tabular-nums'] },
    memberLine: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
    memberText: { fontFamily: 'InstrumentSans-Regular', fontSize: 13, color: theme.colors.textTertiary },
    avatarStack: {
      width: 30, height: 30, borderRadius: 999,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: theme.colors.background,
    },
    // memberColor() avatar palette is fixed pastel in both modes — ink text always.
    avatarStackText: { fontFamily: 'InstrumentSans-Bold', fontSize: 12, color: inkOnPastel },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
    addExpenseBtn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    addExpenseBtnText: { fontFamily: 'InstrumentSans-Bold', fontSize: 15, color: inkOnPastel },
    actionBtnDisabled: { opacity: 0.4 },
    settleUpLinkBtn: {
      flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    settleUpLinkText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 15, color: theme.colors.text },
    tabBar: { paddingHorizontal: 22, marginTop: 20 },
    expensesList: { flex: 1, paddingHorizontal: 22 },
    daySectionHeader: {
      flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
      paddingTop: 18, paddingBottom: 6,
    },
    daySectionSubtotal: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 12.5, color: theme.colors.textTertiary, fontVariant: ['tabular-nums'] },
    expenseTrailing: { flexDirection: 'row', alignItems: 'center' },
    expenseTotal: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 15, color: theme.colors.text, fontVariant: ['tabular-nums'] },
    expenseDelta: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 11, marginTop: 2 },
    sectionTitle: {
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 18,
      color: theme.colors.text,
    },
    simplifiedBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: `${theme.colors.primary}20`,
    },
    simplifiedText: {
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 12,
    },
    transfersCard: {
      marginTop: 16,
      padding: 16,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      borderWidth: 1,
    },
    transfersTitle: {
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 14,
      color: theme.colors.text,
      marginBottom: 12,
    },
    transferRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    transferText: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    transferAmount: {
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 14,
      color: theme.colors.text,
    },
    settleBtn: {
      position: 'absolute',
      backgroundColor: theme.colors.primary,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
    },
    settleBtnText: { color: theme.colors.textInverse, fontFamily: 'InstrumentSans-Bold', fontSize: 16 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    inviteSheet: {
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
    inviteTitle: {
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
    createBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    createBtnDisabled: { opacity: 0.5 },
    createBtnText: { color: theme.colors.textInverse, fontFamily: 'InstrumentSans-Bold', fontSize: 16 },
  });
