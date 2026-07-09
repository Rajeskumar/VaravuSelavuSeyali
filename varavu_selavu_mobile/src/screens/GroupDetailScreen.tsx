/**
 * GroupDetailScreen.tsx — Two-tab screen for a single group.
 *
 * Tab 1 (Expenses): list of group expenses, each showing the user's share.
 * Tab 2 (Balances): BalanceRow list + "Settle Up" button.
 *
 * Scope note (TS-GRP-109): Stats and Activity tabs are listed in §12.2 as
 * optional for Phase 1 — omitted here, to be added in a follow-up.
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
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
import { Ionicons } from '@expo/vector-icons';
import {
  getGroupDetail,
  listGroupExpenses,
  getGroupBalances,
  addMember,
  GroupExpenseRow,
  MemberBalance,
  MemberDTO,
  ApiError,
  deleteGroupExpense,
} from '../api/groups';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import BalanceRow from '../components/BalanceRow';
import SettleUpSheet from '../components/SettleUpSheet';
import GroupSettingsSheet from '../components/GroupSettingsSheet';
import ActivityList from '../components/ActivityList';
import ExpenseDetailSheet from '../components/ExpenseDetailSheet';
import ExpenseCard from '../components/ExpenseCard';
import EditGroupExpenseModal from '../components/EditGroupExpenseModal';
import { showToast } from '../components/Toast';

type Tab = 'expenses' | 'balances' | 'activity';

const GROUP_TYPE_EMOJI: Record<string, string> = {
  other: '👥',
  trip: '✈️',
  home: '🏠',
  couple: '💑',
};

export default function GroupDetailScreen() {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { userEmail } = useAuth();
  const qc = useQueryClient();

  const groupId: string = route.params?.groupId ?? '';

  const [activeTab, setActiveTab] = useState<Tab>('expenses');
  const [settleUpVisible, setSettleUpVisible] = useState(false);
  const [settleFrom, setSettleFrom] = useState<string | null>(null);
  const [settleTo, setSettleTo] = useState<string | null>(null);
  const [settleSuggested, setSettleSuggested] = useState(0);

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

  const nameFor = (id: string) => members.find((m) => m.member_id === id)?.display_name ?? 'Unknown';

  const myMember = members.find((m) => m.user_email === userEmail);
  const myBalance = balances.find((b) => b.member_id === myMember?.member_id)?.net ?? 0;
  const balanceColor =
    myBalance > 0 ? (theme.colors.success ?? '#34C759') : myBalance < 0 ? theme.colors.error : theme.colors.textSecondary;
  const balanceLabel =
    myBalance > 0 ? `You're owed $${myBalance.toFixed(2)}` : myBalance < 0 ? `You owe $${Math.abs(myBalance).toFixed(2)}` : "You're all settled up";

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

  React.useEffect(() => {
    if (detail?.name) {
      const emoji = GROUP_TYPE_EMOJI[detail.group_type] ?? '👥';
      navigation.setOptions({
        headerTitle: `${emoji} ${detail.name}`,
        headerLeft: () => (
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4, marginLeft: 8 }}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        ),
        headerRight: () => (
          <TouchableOpacity onPress={() => setSettingsVisible(true)} style={{ padding: 4 }}>
            <Ionicons name="settings-outline" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
        )
      });
    }
  }, [detail, navigation, theme]);

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

  const renderExpense = ({ item }: { item: GroupExpenseRow }) => {
    const payerNames = item.payer_summary
      .map((p) => members.find((m) => m.member_id === p.member_id)?.display_name ?? '?')
      .join(', ');

    return (
      <ExpenseCard
        description={item.description}
        category={item.category}
        cost={item.cost}
        date={item.date}
        merchantName={item.merchant_name}
        paidByNames={payerNames}
        myShare={item.my_share}
        currency={item.currency}
        groupCurrency={detail?.currency}
        onPress={() => setSelectedExpense(item)}
        onEdit={() => handleEditExpense(item)}
        onDelete={() => handleDeleteExpense(item.row_id)}
      />
    );
  };

  const handleSettleUp = (balance: MemberBalance) => {
    if (!myMember) return;
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

  const renderBalance = ({ item }: { item: MemberBalance }) => (
    <TouchableOpacity
      onPress={() => {
        if (item.net !== 0) {
          handleSettleUp(item);
        }
      }}
      activeOpacity={item.net !== 0 ? 0.7 : 1}
    >
      <BalanceRow balance={item} isCurrentUser={item.member_id === myMember?.member_id} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: 0 }]}>
      {detail.status === 'archived' && (
        <View style={[styles.banner, { backgroundColor: theme.colors.warning + '20', borderColor: theme.colors.warning }]}>
          <Text style={[styles.bannerText, { color: theme.colors.warning }]}>
            This group is archived. You cannot add new expenses or members.
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

      <View style={styles.balanceBanner}>
        <Text style={styles.balanceBannerLabel}>Your balance in this group</Text>
        <Text style={[styles.balanceBannerAmount, { color: balanceColor }]}>{balanceLabel}</Text>
      </View>

      <View style={styles.tabBar}>
        {(['expenses', 'balances', 'activity'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'expenses' && (
        <FlatList
          data={expenses}
          keyExtractor={(item) => item.row_id}
          renderItem={renderExpense}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={expensesRefetching} onRefresh={refetchExpenses} tintColor={theme.colors.primary} />}
        />
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
          <TouchableOpacity
            style={[styles.settleBtn, { bottom: insets.bottom + 16 }]}
            onPress={() => {
              setSettleFrom(null);
              setSettleTo(null);
              setSettleSuggested(0);
              setSettleUpVisible(true);
            }}
          >
            <Text style={styles.settleBtnText}>Settle Up</Text>
          </TouchableOpacity>
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
            {inviteLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Add</Text>}
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
    errorText: { fontFamily: 'Inter-Regular', fontSize: 16, color: theme.colors.error },
    backLink: { color: theme.colors.primary, fontFamily: 'Inter-SemiBold', marginTop: 12 },
    banner: {
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
    },
    bannerText: {
      fontSize: 14,
      fontFamily: 'Inter-Medium',
      textAlign: 'center',
    },
    balanceBanner: {
      marginHorizontal: 16,
      marginTop: 12,
      padding: 16,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderLight,
    },
    balanceBannerLabel: { fontFamily: 'Inter-Regular', fontSize: 12, color: theme.colors.textSecondary, marginBottom: 2 },
    balanceBannerAmount: { fontFamily: 'Inter-Bold', fontSize: 20 },
    tabBar: { flexDirection: 'row', backgroundColor: theme.colors.surfaceSecondary, margin: 16, borderRadius: 12, padding: 4 },
    tabItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 9 },
    tabItemActive: { backgroundColor: theme.colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderLight },
    tabLabel: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: theme.colors.textSecondary },
    tabLabelActive: { color: theme.colors.primary },
    expenseCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    expenseIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: theme.colors.surfaceSecondary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    expenseLeft: { flex: 1 },
    expenseDesc: { fontFamily: 'Inter-SemiBold', fontSize: 15, color: theme.colors.text },
    expenseMeta: {
      fontFamily: 'Inter-Regular',
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    expenseShare: {
      fontFamily: 'Inter-Regular',
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
      textAlign: 'right',
    },
    sectionTitle: {
      fontFamily: 'Inter-SemiBold',
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
      fontFamily: 'Inter-SemiBold',
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
      fontFamily: 'Inter-SemiBold',
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
      fontFamily: 'Inter-Regular',
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    transferAmount: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 14,
      color: theme.colors.text,
    },
    expenseRight: { alignItems: 'flex-end' },
    expenseTotal: { fontFamily: 'Inter-Bold', fontSize: 15, color: theme.colors.text },
    settleBtn: {
      position: 'absolute',
      backgroundColor: theme.colors.primary,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
    },
    settleBtnText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 16 },
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
      fontFamily: 'Inter-Bold',
      fontSize: 20,
      color: theme.colors.text,
      textAlign: 'center',
    },
    input: {
      backgroundColor: theme.colors.surfaceSecondary,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: 'Inter-Regular',
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
    createBtnText: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 16 },
  });
