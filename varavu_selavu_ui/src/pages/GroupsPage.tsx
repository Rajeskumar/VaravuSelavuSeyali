import React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import { motion } from 'framer-motion';
import GroupsListRail from '../components/groups/GroupsListRail';
import { GroupSettingsDialog } from '../components/groups/GroupSettingsDialog';
import { ActivityFeed } from '../components/groups/ActivityFeed';
import MemberAvatarStack from '../components/groups/MemberAvatarStack';
import GroupAvatar from '../components/groups/GroupAvatar';
import GroupBalancesPanel from '../components/groups/GroupBalancesPanel';
import PeopleList from '../components/groups/PeopleList';
import SegmentedTabs from '../components/common/SegmentedTabs';
import ExpenseFeed, { FeedExpense } from '../components/expenses/ExpenseFeed';
import { findMainCategory } from '../components/expenses/AddExpenseForm';
import BalanceList from '../components/groups/BalanceList';
import SettleUpDialog from '../components/groups/SettleUpDialog';
import ExpenseDetailDialog from '../components/groups/ExpenseDetailDialog';
import { useQuickCapture } from '../context/QuickCaptureContext';
import {
  getGroup,
  listGroups,
  listGroupExpenses,
  getBalances,
  createGroup,
  deleteGroupExpense,
  addMember,
  ApiError,
  MemberDTO,
  GroupExpenseRow,
} from '../api/groups';
import { typeScale, tabularNums } from '../theme';

type TabKey = 'expenses' | 'balances' | 'activity';
type RailTab = 'active' | 'archived';
type RootTab = 'groups' | 'people';

const GROUP_TYPES = [
  { value: 'trip', label: 'Trip' },
  { value: 'home', label: 'Home' },
  { value: 'couple', label: 'Couple' },
  { value: 'other', label: 'Other' },
];

/**
 * Groups shell — persistent left rail (all groups) + center (selected group's expenses/
 * balances/activity) + right balances panel, matching Splitwise's desktop master-detail
 * layout (TS-GRP redesign). Both `/groups` and `/groups/:id` render this same component;
 * `groupId` just determines whether the center pane shows an empty state or a group's detail.
 */
const GroupsPage: React.FC = () => {
  const { id: groupId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const { openQuickCapture } = useQuickCapture();
  const [tab, setTab] = React.useState<TabKey>('expenses');
  const [railTab, setRailTab] = React.useState<RailTab>('active');
  // Groups/People root-level tabs (TrackSpense v3 Mobile design) — "Groups is a first-class
  // tab" applies to People too: promotes the old always-inline FriendBalancesWidget to a real
  // peer destination in this same center pane, at every width. URL-backed (?tab=people, same
  // pattern ExpensesPage uses for ?tab=recurring) so `/groups?tab=people` — e.g. the Dashboard
  // hero's "Net with people" link — actually lands on People instead of resetting to Groups.
  const [searchParams, setSearchParams] = useSearchParams();
  const rootTab: RootTab = searchParams.get('tab') === 'people' ? 'people' : 'groups';
  const setRootTab = (next: RootTab) => setSearchParams(next === 'people' ? { tab: 'people' } : {}, { replace: true });
  const [toast, setToast] = React.useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  React.useEffect(() => {
    setTab('expenses');
  }, [groupId]);

  // --- Groups list (left rail) ---
  const groupsQuery = useQuery({
    queryKey: ['groups', railTab === 'archived'],
    queryFn: () => listGroups(railTab === 'archived'),
  });
  const notEnabled = groupsQuery.error instanceof ApiError && groupsQuery.error.status === 404;
  const railGroups = (groupsQuery.data || []).filter((g) => (railTab === 'active' ? g.status === 'active' : g.status === 'archived'));

  // --- Create group dialog ---
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newType, setNewType] = React.useState('other');
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const openCreateDialog = () => {
    setNewName('');
    setNewType('other');
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCreateGroup = async () => {
    setCreateError(null);
    setCreating(true);
    try {
      const created = await createGroup({ name: newName, group_type: newType });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setCreateOpen(false);
      navigate(`/groups/${created.group_id}`);
    } catch (e) {
      setCreateError(e instanceof ApiError ? e.message : 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  // --- Selected group detail ---
  const groupQuery = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => getGroup(groupId as string),
    enabled: !!groupId,
  });
  const expensesQuery = useQuery({
    queryKey: ['group-expenses', groupId],
    queryFn: () => listGroupExpenses(groupId as string),
    enabled: !!groupId,
  });
  const balancesQuery = useQuery({
    queryKey: ['group-balances', groupId],
    queryFn: () => getBalances(groupId as string),
    enabled: !!groupId,
  });

  const members: MemberDTO[] = groupQuery.data?.members || [];
  const myEmail = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const myMember = members.find((m) => m.user_email === myEmail);
  const myBalance = balancesQuery.data?.members.find((m) => m.member_id === myMember?.member_id)?.net ?? 0;
  const group = groupQuery.data;
  const isArchived = group?.status === 'archived';

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  // --- Add member dialog ---
  const [memberDialogOpen, setMemberDialogOpen] = React.useState(false);
  const [memberEmail, setMemberEmail] = React.useState('');
  const [memberName, setMemberName] = React.useState('');
  const [memberMode, setMemberMode] = React.useState<'email' | 'placeholder'>('email');
  const [memberSaving, setMemberSaving] = React.useState(false);
  const [memberError, setMemberError] = React.useState<string | null>(null);

  const handleAddMember = async () => {
    if (!groupId) return;
    setMemberError(null);
    setMemberSaving(true);
    try {
      await addMember(groupId, memberMode === 'email' ? { email: memberEmail } : { display_name: memberName });
      queryClient.invalidateQueries({ queryKey: ['group', groupId] });
      setMemberDialogOpen(false);
      setMemberEmail('');
      setMemberName('');
      setToast({ open: true, message: 'Member added', severity: 'success' });
    } catch (e) {
      setMemberError(e instanceof ApiError ? e.message : 'Failed to add member');
    } finally {
      setMemberSaving(false);
    }
  };

  // --- Expense detail dialog (view / edit / comments / history / settle-share) ---
  const [selectedExpense, setSelectedExpense] = React.useState<GroupExpenseRow | null>(null);
  const [expenseDialogMode, setExpenseDialogMode] = React.useState<'view' | 'edit'>('view');

  // --- Settle up dialog ---
  const [settleOpen, setSettleOpen] = React.useState(false);

  const handleQuickDeleteExpense = async (row: GroupExpenseRow) => {
    if (!groupId) return;
    if (!window.confirm(`Delete "${row.description}"?`)) return;
    try {
      await deleteGroupExpense(groupId, row.row_id);
      queryClient.invalidateQueries({ queryKey: ['group-expenses', groupId] });
      queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
      setToast({ open: true, message: 'Expense deleted', severity: 'success' });
    } catch (e) {
      setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to delete expense', severity: 'error' });
    }
  };

  const groupFeedExpenses: FeedExpense[] = React.useMemo(
    () =>
      (expensesQuery.data?.items || []).map((row) => ({
        key: row.row_id,
        kind: 'group' as const,
        id: row.row_id,
        groupId,
        date: row.date,
        description: row.description,
        merchantName: row.merchant_name || undefined,
        category: row.category,
        mainCategory: findMainCategory(row.category),
        amount: row.my_share,
        groupAmount: row.cost,
        groupName: group?.name,
        payerSummary: row.payer_summary,
      })),
    [expensesQuery.data, groupId, group?.name]
  );

  const resolveGroupExpense = (feedRow: FeedExpense): GroupExpenseRow | undefined =>
    expensesQuery.data?.items.find((row) => row.row_id === feedRow.id);

  if (notEnabled) {
    return (
      <Box sx={{ mt: 4 }}>
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 1 }}>
          <GroupsRoundedIcon sx={{ fontSize: 64, color: 'primary.light', mb: 2 }} />
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Groups isn't available yet
          </Typography>
          <Typography variant="body1" color="text.secondary">
            This feature is being rolled out — check back soon.
          </Typography>
        </Paper>
      </Box>
    );
  }

  const positiveColor = theme.palette.success.main;
  const negativeColor = theme.palette.error.main;
  const balanceDirectionLabel = myBalance > 0 ? "You're owed" : myBalance < 0 ? 'You owe' : "You're all settled up";
  const balanceColor = myBalance > 0 ? positiveColor : myBalance < 0 ? negativeColor : theme.palette.text.secondary;
  const invitedMembers = members.filter((m) => m.status === 'invited');

  return (
    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 176px)', minHeight: 480, border: `1px solid ${theme.palette.divider}`, borderRadius: 1, overflow: 'hidden' }}>
      {/* Groups/People root tabs — a shared header above the rail+detail row (not nested inside
          the detail pane) specifically so it's reachable on mobile regardless of which of the
          two panes below is currently visible there; see the rail/center `display.xs` logic
          just below, which keys off `rootTab` for exactly this reason. */}
      {!groupId && (
        <Box sx={{ px: { xs: 1.5, sm: 3 }, pt: 2, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          <SegmentedTabs
            value={rootTab}
            onChange={setRootTab}
            options={[
              { value: 'groups', label: 'Groups' },
              { value: 'people', label: 'People' },
            ]}
          />
        </Box>
      )}

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Box sx={{ display: { xs: !groupId && rootTab === 'groups' ? 'flex' : 'none', md: 'flex' }, width: { xs: '100%', md: 280 }, flexShrink: 0 }}>
          <GroupsListRail
            groups={railGroups}
            loading={groupsQuery.isLoading}
            selectedId={groupId}
            onSelect={(id) => navigate(`/groups/${id}`)}
            onCreate={openCreateDialog}
            tab={railTab}
            onTabChange={setRailTab}
          />
        </Box>

        <Box sx={{ display: { xs: groupId || rootTab === 'people' ? 'flex' : 'none', md: 'flex' }, flex: 1, minWidth: 0 }}>
          {!groupId && (
            rootTab === 'people' ? (
              <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 1.5, sm: 3 }, py: 3 }}>
                <PeopleList onToast={(message, severity) => setToast({ open: true, message, severity })} />
              </Box>
            ) : (
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', p: 4, gap: 1.5 }}>
                <GroupsRoundedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                <Typography variant="subtitle1" fontWeight={700}>
                  {railGroups.length === 0 ? 'No groups yet' : 'Select a group'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>
                  {railGroups.length === 0
                    ? 'Create a group to split rent, trips, or shared bills with roommates and friends.'
                    : 'Choose a group from the list to see its expenses and balances.'}
                </Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog} sx={{ mt: 1 }}>
                  Create Group
                </Button>
              </Box>
            )
          )}

          {groupId && groupQuery.isLoading && (
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <CircularProgress />
          </Box>
        )}

        {groupId && groupQuery.isError && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
            <Typography color="error">Failed to load this group.</Typography>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/groups')}>
              Back to Groups
            </Button>
          </Box>
        )}

        {groupId && group && (
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', px: { xs: 1.5, sm: 3 }, py: 3 }}>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <IconButton onClick={() => navigate('/groups')} size="small" sx={{ display: { xs: 'inline-flex', md: 'none' } }}>
                  <ArrowBackIcon />
                </IconButton>
                <GroupAvatar seed={group.group_id} groupType={group.group_type} size={40} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
                      {group.name}
                    </Typography>
                    {isArchived && <Chip label="Archived" size="small" color="warning" variant="outlined" />}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {members.length} member{members.length === 1 ? '' : 's'}
                  </Typography>
                </Box>
                <MemberAvatarStack members={members} />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PersonAddAlt1RoundedIcon />}
                  onClick={() => setMemberDialogOpen(true)}
                  disabled={isArchived}
                  sx={{ flexShrink: 0 }}
                >
                  Add Member
                </Button>
                <IconButton onClick={() => setSettingsOpen(true)} size="small">
                  <SettingsRoundedIcon />
                </IconButton>
              </Box>

              {isArchived && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  This group is archived — you can still view its history, but adding or editing
                  anything is locked. Unarchive from Settings to make changes.
                </Alert>
              )}

              {group.status === 'deleted' && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  This group has been deleted. It will be permanently removed after 30 days.
                </Alert>
              )}

              {/* Standalone balance hero — only shown where GroupBalancesPanel isn't (below lg). */}
              <Box sx={{ display: { xs: 'flex', lg: 'none' }, flexDirection: 'column', alignItems: 'center', py: 3, mb: 1 }}>
                <MemberAvatarStack members={members} size={40} max={6} />
                <Typography sx={{ ...typeScale.label, color: 'text.secondary', mt: 1.5 }}>{balanceDirectionLabel}</Typography>
                {myBalance !== 0 && (
                  <Typography component="div" sx={{ ...typeScale.display, ...tabularNums, color: balanceColor, mt: 0.5 }}>
                    ${Math.abs(myBalance).toFixed(2)}
                  </Typography>
                )}
                {invitedMembers.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1, mt: 2 }}>
                    {invitedMembers.map((m) => (
                      <Chip key={m.member_id} label={`${m.display_name} · pending`} size="small" variant="outlined" />
                    ))}
                  </Box>
                )}
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 1.5 }}>
                <SegmentedTabs
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: 'expenses', label: 'Expenses' },
                    { value: 'balances', label: 'Balances' },
                    { value: 'activity', label: 'Activity' },
                  ]}
                />
                {tab === 'expenses' ? (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => openQuickCapture(groupId)} disabled={members.length === 0 || isArchived}>
                    Add Expense
                  </Button>
                ) : (
                  <Button variant="contained" onClick={() => setSettleOpen(true)} disabled={members.length < 2 || isArchived}>
                    Settle Up
                  </Button>
                )}
              </Box>

              {tab === 'expenses' && (
                <Box>
                  <ExpenseFeed
                    expenses={groupFeedExpenses}
                    loading={expensesQuery.isLoading}
                    emptyMessage="No group expenses yet."
                    readOnly={isArchived}
                    onSelect={(feedRow) => {
                      const row = resolveGroupExpense(feedRow);
                      if (row) {
                        setExpenseDialogMode('view');
                        setSelectedExpense(row);
                      }
                    }}
                    onEdit={(feedRow) => {
                      const row = resolveGroupExpense(feedRow);
                      if (row) {
                        setExpenseDialogMode('edit');
                        setSelectedExpense(row);
                      }
                    }}
                    onDelete={(feedRow) => {
                      const row = resolveGroupExpense(feedRow);
                      if (row) handleQuickDeleteExpense(row);
                    }}
                  />
                </Box>
              )}

              {tab === 'balances' && (
                <Box>
                  {balancesQuery.isLoading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                      <CircularProgress />
                    </Box>
                  )}
                  {balancesQuery.data && <BalanceList balances={balancesQuery.data} simplifyDebts={group.simplify_debts} />}
                </Box>
              )}

              {tab === 'activity' && (
                <Box sx={{ mt: 3 }}>
                  <ActivityFeed groupId={group.group_id} group={group} />
                </Box>
              )}
            </motion.div>
          </Box>
        )}
      </Box>

        {groupId && group && balancesQuery.data && (
          <GroupBalancesPanel members={balancesQuery.data.members} myMemberId={myMember?.member_id} onSettleUp={() => setSettleOpen(true)} disabled={members.length < 2} />
        )}
      </Box>

      {/* Create Group dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 700 }}>
            Create Group
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField label="Name" size="small" fullWidth value={newName} onChange={(e) => setNewName(e.target.value)} required />
            <TextField select label="Type" size="small" fullWidth value={newType} onChange={(e) => setNewType(e.target.value)}>
              {GROUP_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            {createError && (
              <Typography color="error" variant="body2">
                {createError}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="contained" disabled={!newName.trim() || creating} onClick={handleCreateGroup}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </Box>
        </Box>
      </Dialog>

      {/* Add Member dialog */}
      <Dialog open={memberDialogOpen} onClose={() => setMemberDialogOpen(false)} maxWidth="xs" fullWidth>
        <Box sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 700 }}>
            Add Member
          </Typography>
          <Box sx={{ mb: 1.5 }}>
            <SegmentedTabs
              value={memberMode}
              onChange={setMemberMode}
              fullWidth
              options={[
                { value: 'email', label: 'Registered email' },
                { value: 'placeholder', label: 'Placeholder name' },
              ]}
            />
          </Box>
          {memberMode === 'email' ? (
            <TextField label="Email" type="email" size="small" fullWidth value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} />
          ) : (
            <TextField label="Name" size="small" fullWidth value={memberName} onChange={(e) => setMemberName(e.target.value)} helperText="For people who aren't on TrackSpense yet" />
          )}
          {memberError && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {memberError}
            </Typography>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
            <Button onClick={() => setMemberDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" disabled={memberSaving || (memberMode === 'email' ? !memberEmail.trim() : !memberName.trim())} onClick={handleAddMember}>
              {memberSaving ? 'Adding...' : 'Add'}
            </Button>
          </Box>
        </Box>
      </Dialog>

      {group && <GroupSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} group={group} setToast={setToast} />}

      {settleOpen && balancesQuery.data && (
        <SettleUpDialog
          open={settleOpen}
          groupId={groupId as string}
          members={balancesQuery.data.members}
          transfers={balancesQuery.data.transfers}
          myMemberId={myMember?.member_id}
          onClose={() => setSettleOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
            setToast({ open: true, message: 'Settlement recorded', severity: 'success' });
          }}
        />
      )}

      {selectedExpense && groupId && (
        <ExpenseDetailDialog
          open={!!selectedExpense}
          onClose={() => setSelectedExpense(null)}
          groupId={groupId}
          expense={selectedExpense}
          members={members}
          myMemberId={myMember?.member_id}
          groupCurrency={group?.currency || 'USD'}
          initialMode={expenseDialogMode}
          readOnly={isArchived}
          setToast={setToast}
          onSettled={() => {
            queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
            queryClient.invalidateQueries({ queryKey: ['group-expenses', groupId] });
            setSelectedExpense(null);
          }}
          onDeleted={() => {
            queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
            queryClient.invalidateQueries({ queryKey: ['group-expenses', groupId] });
            setSelectedExpense(null);
          }}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
            queryClient.invalidateQueries({ queryKey: ['group-expenses', groupId] });
            setSelectedExpense(null);
            setToast({ open: true, message: 'Expense updated', severity: 'success' });
          }}
        />
      )}

      <Snackbar open={toast.open} autoHideDuration={2500} onClose={() => setToast((t) => ({ ...t, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setToast((t) => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default GroupsPage;
