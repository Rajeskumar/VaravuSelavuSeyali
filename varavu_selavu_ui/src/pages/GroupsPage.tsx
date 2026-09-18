import React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
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
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
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
  createGroupExpense,
  deleteGroupExpense,
  addMember,
  createInvite,
  ApiError,
  MemberDTO,
  GroupExpenseRow,
} from '../api/groups';
import { typeScale, tabularNums } from '../theme';
import { formatMoney } from '../utils/money';
import ConfirmDialog from '../components/common/ConfirmDialog';

type TabKey = 'expenses' | 'activity';
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
  // Redesign (2026-09): Balances used to be a third tab, but its content is now always
  // inline (see the disclosure below the group header) rather than gated behind a click —
  // collapsed by default at `lg+`, where the side panel already gives the gist.
  const isDesktopWithPanel = useMediaQuery(theme.breakpoints.up('lg'));
  const [balancesExpanded, setBalancesExpanded] = React.useState(false);
  React.useEffect(() => {
    setBalancesExpanded(!isDesktopWithPanel);
  }, [isDesktopWithPanel]);
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
  const [toast, setToast] = React.useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
    action?: { label: string; onClick: () => void };
  }>({
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
      let message = 'Member added';
      if (memberMode === 'email') {
        const email = memberEmail.trim();
        try {
          // Already on TrackSpense: seat them directly.
          await addMember(groupId, { email });
        } catch (e) {
          // Not registered: the backend says so with a 400. Create a placeholder seat and
          // email them a join link pinned to this address — before this, the seat was
          // created and nothing else happened, which read as "invite not sent".
          const notRegistered = e instanceof ApiError && e.status === 400 && /No registered user/i.test(e.message);
          if (!notRegistered) throw e;
          const fallbackName = memberName.trim() || email.split('@')[0];
          const seat = await addMember(groupId, { display_name: fallbackName });
          await createInvite(groupId, seat.member_id, email);
          message = `Invite emailed to ${email}`;
        }
      } else {
        await addMember(groupId, { display_name: memberName.trim() });
      }
      queryClient.invalidateQueries({ queryKey: ['group', groupId] });
      setMemberDialogOpen(false);
      setMemberEmail('');
      setMemberName('');
      setToast({ open: true, message, severity: 'success' });
    } catch (e) {
      // Non-ApiError = no response at all (offline, blocked, timed out), not a server rejection.
      setMemberError(e instanceof ApiError ? e.message : "Couldn't reach TrackSpense, so the member wasn't added. Check your connection and try again.");
    } finally {
      setMemberSaving(false);
    }
  };

  // --- Expense detail dialog (view / edit / comments / history / settle-share) ---
  const [selectedExpense, setSelectedExpense] = React.useState<GroupExpenseRow | null>(null);
  const [expenseDialogMode, setExpenseDialogMode] = React.useState<'view' | 'edit'>('view');

  // --- Settle up dialog ---
  const [settleOpen, setSettleOpen] = React.useState(false);

  const [confirmDeleteExpense, setConfirmDeleteExpense] = React.useState<GroupExpenseRow | null>(null);
  const [deletingExpense, setDeletingExpense] = React.useState(false);

  const handleQuickDeleteExpense = (row: GroupExpenseRow) => setConfirmDeleteExpense(row);

  // Deletion has no server-side undo (unlike groups, which soft-delete for 30 days), so "Undo"
  // re-creates the expense from the row's own data instead — same description/amount/category/
  // payers/split, via the same create endpoint a user would use to re-log it by hand. It lands as
  // a new row (new id, new activity-log entry), not a byte-for-byte restore, but is indistinguishable
  // in the UI and is the standard pattern for undo-without-soft-delete.
  const undoDeleteExpense = async (row: GroupExpenseRow) => {
    if (!groupId) return;
    try {
      await createGroupExpense(groupId, {
        date: row.date,
        description: row.description,
        category: row.category,
        amount: row.cost,
        merchant_name: row.merchant_name || undefined,
        payers: row.payer_summary.map((p) => ({ member_id: p.member_id, amount_paid: p.amount_paid })),
        split: { type: 'exact', entries: row.splits.map((s) => ({ member_id: s.member_id, value: s.share })) },
        currency: row.currency || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['group-expenses', groupId] });
      queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
      setToast({ open: true, message: 'Expense restored', severity: 'success' });
    } catch (e) {
      setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to restore expense', severity: 'error' });
    }
  };

  const confirmDeleteExpenseNow = async () => {
    if (!groupId || !confirmDeleteExpense) return;
    const row = confirmDeleteExpense;
    setDeletingExpense(true);
    try {
      await deleteGroupExpense(groupId, row.row_id);
      queryClient.invalidateQueries({ queryKey: ['group-expenses', groupId] });
      queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
      setToast({
        open: true,
        message: 'Expense deleted',
        severity: 'success',
        action: { label: 'Undo', onClick: () => undoDeleteExpense(row) },
      });
      setConfirmDeleteExpense(null);
    } catch (e) {
      setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to delete expense', severity: 'error' });
    } finally {
      setDeletingExpense(false);
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
        currency: row.currency || group?.currency,
        payerSummary: row.payer_summary,
      })),
    [expensesQuery.data, groupId, group?.name, group?.currency]
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
              {/* Design review (2026-09): this used to be a management-controls-first header
                  (name, Add Member button, settings gear) with the balance either hidden below
                  `lg` or off in the side panel — never leading. The compact "You're owed/owe"
                  line is now the first thing in the column at every width; management controls
                  (Add Member) drop to a plain text affordance rather than a bordered button. */}
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
                <Typography sx={{ ...typeScale.label, color: 'text.secondary' }}>{balanceDirectionLabel}</Typography>
                {myBalance !== 0 && (
                  <Typography component="span" sx={{ ...typeScale.display, ...tabularNums, color: balanceColor }}>
                    {formatMoney(myBalance, group.currency)}
                  </Typography>
                )}
              </Box>
              {invitedMembers.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                  {invitedMembers.map((m) => (
                    <Chip key={m.member_id} label={`${m.display_name} · pending`} size="small" variant="outlined" />
                  ))}
                </Box>
              )}

              {/* Redesign (2026-09): "Balances" used to be its own tab, duplicating the
                  desktop side panel's net numbers while also being the only place to see the
                  per-member breakdown and "who owes whom" — content the panel doesn't carry
                  and that would have been stranded below `lg`, where the panel is hidden. This
                  disclosure is now the one place that detail lives, at every width — collapsed
                  to a one-line summary by default at `lg+` (the panel already gives the gist),
                  expanded by default below it. */}
              {members.length > 1 && (
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 2.5, overflow: 'hidden' }}>
                  <Box
                    onClick={() => setBalancesExpanded((v) => !v)}
                    role="button"
                    aria-expanded={balancesExpanded}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      px: 2,
                      py: 1.25,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>Balances</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {balancesQuery.isLoading
                          ? 'Loading…'
                          : !balancesQuery.data?.transfers.length
                            ? 'Everyone is settled up'
                            : `${balancesQuery.data.transfers.length} payment${balancesQuery.data.transfers.length === 1 ? '' : 's'} to settle up`}
                      </Typography>
                    </Box>
                    <ExpandMoreRoundedIcon
                      fontSize="small"
                      sx={{ color: 'text.secondary', flexShrink: 0, transition: 'transform 0.15s', transform: balancesExpanded ? 'rotate(180deg)' : 'none' }}
                    />
                  </Box>
                  {balancesExpanded && (
                    <Box sx={{ px: 2, pb: 2.5, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                      {balancesQuery.isLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                          <CircularProgress size={22} />
                        </Box>
                      ) : balancesQuery.data ? (
                        <>
                          <BalanceList balances={balancesQuery.data} simplifyDebts={group.simplify_debts} currency={group.currency} />
                          <Button
                            fullWidth
                            variant="contained"
                            sx={{ mt: 2 }}
                            onClick={() => setSettleOpen(true)}
                            disabled={isArchived}
                          >
                            Settle up
                          </Button>
                        </>
                      ) : null}
                    </Box>
                  )}
                </Box>
              )}

              {/* Name is allowed to wrap (was `noWrap`, which truncated "UX Audit Test" to
                  "UX Aud…" on phones); the management controls wrap onto their own row
                  instead of squeezing the name. */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, mt: 2, flexWrap: 'wrap' }}>
                <IconButton onClick={() => navigate('/groups')} aria-label="Back to groups" size="small" sx={{ display: { xs: 'inline-flex', md: 'none' } }}>
                  <ArrowBackIcon />
                </IconButton>
                <GroupAvatar seed={group.group_id} groupType={group.group_type} size={40} />
                <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
                      {group.name}
                    </Typography>
                    {isArchived && <Chip label="Archived" size="small" color="warning" variant="outlined" />}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {members.length} member{members.length === 1 ? '' : 's'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto', flexShrink: 0 }}>
                  <MemberAvatarStack members={members} />
                  <Button
                    size="small"
                    variant="text"
                    color="inherit"
                    startIcon={<PersonAddAlt1RoundedIcon fontSize="small" />}
                    onClick={() => setMemberDialogOpen(true)}
                    disabled={isArchived}
                    sx={{ flexShrink: 0, color: 'text.secondary' }}
                  >
                    Add Member
                  </Button>
                  <IconButton onClick={() => setSettingsOpen(true)} aria-label="Group settings" size="small">
                    <SettingsRoundedIcon />
                  </IconButton>
                </Box>
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

              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 1.5 }}>
                <SegmentedTabs
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: 'expenses', label: 'Expenses' },
                    { value: 'activity', label: 'Activity' },
                  ]}
                />
                {tab === 'expenses' && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => openQuickCapture(groupId)} disabled={members.length === 0 || isArchived}>
                    Add Expense
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
          <GroupBalancesPanel members={balancesQuery.data.members} myMemberId={myMember?.member_id} onSettleUp={() => setSettleOpen(true)} disabled={members.length < 2} currency={group.currency} />
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
                { value: 'email', label: 'Invite by email' },
                { value: 'placeholder', label: 'Name only' },
              ]}
            />
          </Box>
          {memberMode === 'email' ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <TextField label="Email" type="email" size="small" fullWidth autoFocus value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} helperText="Already on TrackSpense? They're added right away. Otherwise they get an email with a join link." />
              <TextField label="Name (optional)" size="small" fullWidth value={memberName} onChange={(e) => setMemberName(e.target.value)} helperText="Shown in the group until they join" />
            </Box>
          ) : (
            <TextField label="Name" size="small" fullWidth autoFocus value={memberName} onChange={(e) => setMemberName(e.target.value)} helperText="A seat with no account — for someone who won't use the app. You can email them an invite later from Group settings." />
          )}
          {memberError && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {memberError}
            </Typography>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
            <Button onClick={() => setMemberDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" disabled={memberSaving || (memberMode === 'email' ? !memberEmail.trim() : !memberName.trim())} onClick={handleAddMember}>
              {memberSaving ? 'Adding...' : memberMode === 'email' ? 'Add or invite' : 'Add'}
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
          currency={group?.currency}
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

      <ConfirmDialog
        open={!!confirmDeleteExpense}
        title="Delete expense?"
        message={`Delete "${confirmDeleteExpense?.description}"? You can undo this from the confirmation toast.`}
        confirmLabel="Delete"
        destructive
        loading={deletingExpense}
        onConfirm={confirmDeleteExpenseNow}
        onCancel={() => setConfirmDeleteExpense(null)}
      />

      <Snackbar
        open={toast.open}
        autoHideDuration={toast.action ? 6000 : 2500}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          severity={toast.severity}
          variant="filled"
          sx={{ width: '100%' }}
          action={
            toast.action ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  toast.action?.onClick();
                  setToast((t) => ({ ...t, open: false }));
                }}
              >
                {toast.action.label}
              </Button>
            ) : undefined
          }
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default GroupsPage;
