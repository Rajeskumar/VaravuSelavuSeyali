import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import { motion } from 'framer-motion';
import MemberAvatarStack from '../components/groups/MemberAvatarStack';
import GroupAvatar from '../components/groups/GroupAvatar';
import SegmentedTabs from '../components/common/SegmentedTabs';
import SplitEditor, { SplitEditorValue } from '../components/groups/SplitEditor';
import BalanceList from '../components/groups/BalanceList';
import SettleUpDialog from '../components/groups/SettleUpDialog';
import InviteDialog from '../components/groups/InviteDialog';
import {
  getGroup,
  listGroupExpenses,
  getBalances,
  createGroupExpense,
  addMember,
  ApiError,
  MemberDTO,
} from '../api/groups';
import { isoToMMDDYYYY } from '../utils/date';
import { glassCardSx } from '../theme';

type TabKey = 'expenses' | 'balances';

const GroupDetailPage: React.FC = () => {
  const { id: groupId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const [tab, setTab] = React.useState<TabKey>('expenses');
  const [toast, setToast] = React.useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

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

  // --- Add expense dialog ---
  const [addOpen, setAddOpen] = React.useState(false);
  const [date, setDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [amount, setAmount] = React.useState<number>(0);
  const [payerId, setPayerId] = React.useState('');
  const [splitValue, setSplitValue] = React.useState<SplitEditorValue>({ type: 'equal', entries: [] });
  const [splitValid, setSplitValid] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const resetAddForm = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setDescription('');
    setCategory('');
    setAmount(0);
    setPayerId(members[0]?.member_id || '');
    setSplitValue({ type: 'equal', entries: members.map((m) => ({ member_id: m.member_id })) });
    setFormError(null);
  };

  const openAddDialog = () => {
    resetAddForm();
    setAddOpen(true);
  };

  const handleAddExpense = async () => {
    if (!groupId) return;
    setFormError(null);
    setSaving(true);
    try {
      await createGroupExpense(groupId, {
        date: isoToMMDDYYYY(date),
        description,
        category,
        amount,
        payers: [{ member_id: payerId, amount_paid: amount }],
        split: { type: splitValue.type, entries: splitValue.entries },
      });
      queryClient.invalidateQueries({ queryKey: ['group-expenses', groupId] });
      queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
      setAddOpen(false);
      setToast({ open: true, message: 'Expense added', severity: 'success' });
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Failed to add expense');
    } finally {
      setSaving(false);
    }
  };

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
      await addMember(
        groupId,
        memberMode === 'email' ? { email: memberEmail } : { display_name: memberName }
      );
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

  // --- Settle up + invite dialogs ---
  const [settleOpen, setSettleOpen] = React.useState(false);
  const [inviteMember, setInviteMember] = React.useState<MemberDTO | null>(null);

  if (groupQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (groupQuery.isError || !groupQuery.data) {
    return (
      <Box sx={{ mt: 4 }}>
        <Typography color="error">Failed to load this group.</Typography>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/groups')} sx={{ mt: 2 }}>
          Back to Groups
        </Button>
      </Box>
    );
  }

  const group = groupQuery.data;

  const balanceLabel = myBalance > 0 ? `You're owed $${myBalance.toFixed(2)}` : myBalance < 0 ? `You owe $${Math.abs(myBalance).toFixed(2)}` : "You're all settled up";
  const balanceColor = myBalance > 0 ? theme.palette.success.main : myBalance < 0 ? theme.palette.error.main : theme.palette.text.secondary;

  return (
    <Box sx={{ mt: 4 }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <IconButton onClick={() => navigate('/groups')} size="small">
            <ArrowBackIcon />
          </IconButton>
          <GroupAvatar seed={group.group_id} groupType={group.group_type} size={44} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
              {group.name}
            </Typography>
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
            sx={{ flexShrink: 0 }}
          >
            Add Member
          </Button>
        </Box>

        <Card sx={{ ...glassCardSx(theme), p: 2.5, mb: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Your balance in this group</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: balanceColor }}>
              {balanceLabel}
            </Typography>
          </Box>
          {members.some((m) => m.status === 'invited') && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {members.filter((m) => m.status === 'invited').map((m) => (
                <Chip
                  key={m.member_id}
                  label={`${m.display_name} · pending`}
                  size="small"
                  onDelete={() => setInviteMember(m)}
                  deleteIcon={<MailOutlineIcon fontSize="small" />}
                />
              ))}
            </Box>
          )}
        </Card>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 1.5 }}>
          <SegmentedTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'expenses', label: 'Expenses' },
              { value: 'balances', label: 'Balances' },
            ]}
          />
          {tab === 'expenses' ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAddDialog} disabled={members.length === 0}>
              Add Expense
            </Button>
          ) : (
            <Button variant="contained" onClick={() => setSettleOpen(true)} disabled={members.length < 2}>
              Settle Up
            </Button>
          )}
        </Box>

        {tab === 'expenses' && (
          <Box>
            {expensesQuery.isLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            )}
            {!expensesQuery.isLoading && (expensesQuery.data?.items.length ?? 0) === 0 && (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
                <Typography color="text.secondary">No group expenses yet.</Typography>
              </Paper>
            )}
            {!expensesQuery.isLoading && (expensesQuery.data?.items.length ?? 0) > 0 && (
              <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
                {expensesQuery.data?.items.map((row, idx) => (
                  <Box
                    key={row.row_id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      px: 2.5,
                      py: 1.75,
                      borderTop: idx === 0 ? 'none' : `1px solid ${theme.palette.divider}`,
                      transition: 'background-color 0.15s ease',
                      '&:hover': { backgroundColor: theme.palette.action.hover },
                    }}
                  >
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                        color: 'text.secondary',
                      }}
                    >
                      <ReceiptLongRoundedIcon fontSize="small" />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body1" sx={{ fontWeight: 600 }} noWrap>
                        {row.description}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.category} · {row.date}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography variant="body1" sx={{ fontWeight: 700 }}>
                        ${row.my_share.toFixed(2)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ${row.cost.toFixed(2)} total
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Paper>
            )}
          </Box>
        )}

        {tab === 'balances' && (
          <Box>
            {balancesQuery.isLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            )}
            {balancesQuery.data && <BalanceList balances={balancesQuery.data} />}
          </Box>
        )}
      </motion.div>

      {/* Add Expense dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Add Group Expense
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Description"
              fullWidth
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Date"
                type="date"
                fullWidth
                value={date}
                onChange={(e) => setDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Amount"
                type="number"
                fullWidth
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Box>
            <TextField label="Category" fullWidth value={category} onChange={(e) => setCategory(e.target.value)} required />
            <TextField select label="Paid by" fullWidth value={payerId} onChange={(e) => setPayerId(e.target.value)}>
              {members.map((m) => (
                <MenuItem key={m.member_id} value={m.member_id}>
                  {m.display_name}
                </MenuItem>
              ))}
            </TextField>
            <Divider />
            <Typography variant="subtitle2">Split</Typography>
            <SplitEditor
              amount={amount}
              members={members}
              value={splitValue}
              onChange={setSplitValue}
              onValidityChange={setSplitValid}
            />
            {formError && (
              <Typography color="error" variant="body2">
                {formError}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
            <Button onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={saving || !description.trim() || !category.trim() || amount <= 0 || !payerId || !splitValid}
              onClick={handleAddExpense}
            >
              {saving ? 'Saving...' : 'Add Expense'}
            </Button>
          </Box>
        </Box>
      </Dialog>

      {/* Add Member dialog */}
      <Dialog open={memberDialogOpen} onClose={() => setMemberDialogOpen(false)} maxWidth="xs" fullWidth>
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Add Member
          </Typography>
          <Box sx={{ mb: 2 }}>
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
            <TextField
              label="Email"
              type="email"
              fullWidth
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
            />
          ) : (
            <TextField
              label="Name"
              fullWidth
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              helperText="For people who aren't on TrackSpense yet — invite them later"
            />
          )}
          {memberError && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {memberError}
            </Typography>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
            <Button onClick={() => setMemberDialogOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={memberSaving || (memberMode === 'email' ? !memberEmail.trim() : !memberName.trim())}
              onClick={handleAddMember}
            >
              {memberSaving ? 'Adding...' : 'Add'}
            </Button>
          </Box>
        </Box>
      </Dialog>

      {settleOpen && balancesQuery.data && (
        <SettleUpDialog
          open={settleOpen}
          groupId={groupId as string}
          members={balancesQuery.data.members}
          onClose={() => setSettleOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['group-balances', groupId] });
            setToast({ open: true, message: 'Settlement recorded', severity: 'success' });
          }}
        />
      )}

      {inviteMember && (
        <InviteDialog
          open={!!inviteMember}
          groupId={groupId as string}
          memberId={inviteMember.member_id}
          displayName={inviteMember.display_name}
          onClose={() => setInviteMember(null)}
        />
      )}

      <Snackbar
        open={toast.open}
        autoHideDuration={2500}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToast((t) => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default GroupDetailPage;
