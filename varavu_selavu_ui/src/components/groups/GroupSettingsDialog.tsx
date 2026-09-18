import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  Switch,
  Typography,
  Box,
  Divider,
  TextField,
  MenuItem,
  Chip,
  Alert,
} from '@mui/material';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import { GroupDetailResponse, ApiError, MemberDTO } from '../../api/groups';
import {
  updateGroup,
  removeMember,
  leaveGroup,
  createInvite,
  archiveGroup,
  unarchiveGroup,
  restoreGroup,
  deleteGroup,
  getNotificationPreferences,
  updateNotificationPreferences,
  exportGroupCsv,
} from '../../api/groups';
import SplitEditor, { SplitEditorValue } from './SplitEditor';
import PersonRemoveRoundedIcon from '@mui/icons-material/PersonRemoveRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import { useQueryClient } from '@tanstack/react-query';
import ConfirmDialog from '../common/ConfirmDialog';

interface GroupSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  group: GroupDetailResponse;
  setToast: (toast: {
    open: boolean;
    message: string;
    severity: 'success' | 'error';
    action?: { label: string; onClick: () => void };
  }) => void;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CNY', 'SGD', 'MXN'];

export const GroupSettingsDialog: React.FC<GroupSettingsDialogProps> = ({
  open,
  onClose,
  group,
  setToast,
}) => {
  const queryClient = useQueryClient();
  const isArchived = group.status === 'archived';
  const [simplifyDebts, setSimplifyDebts] = useState(group.simplify_debts);
  const [currency, setCurrency] = useState(group.currency);

  // TS-GRP-125: notification preferences — self-scoped, saved immediately on
  // toggle (independent of the "Save" button below, which only covers
  // group-level settings the admin controls).
  const [muted, setMuted] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    if (!open) return;
    getNotificationPreferences(group.group_id)
      .then((p) => {
        setMuted(p.muted);
        setPrefsLoaded(true);
      })
      .catch(() => setPrefsLoaded(true));
  }, [open, group.group_id]);

  const handleToggleMuted = async (checked: boolean) => {
    setMuted(checked);
    try {
      await updateNotificationPreferences(group.group_id, { muted: checked });
    } catch (e) {
      setMuted(!checked);
      setToast({ open: true, message: 'Failed to update notification preference', severity: 'error' });
    }
  };

  const handleExport = async () => {
    try {
      await exportGroupCsv(group.group_id, group.name);
    } catch (e) {
      setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to export group', severity: 'error' });
    }
  };


  const defaultSplitVal: SplitEditorValue = group.default_split 
    ? { type: group.default_split.type, entries: group.default_split.entries }
    : { type: 'equal', entries: [] };
  const [splitValue, setSplitValue] = useState<SplitEditorValue>(defaultSplitVal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Balance guard (group_service.delete_group) returns 409 when the group isn't settled —
  // this holds the confirmed 409 error message so the "delete anyway" confirm can quote it.
  const [confirmForceDelete, setConfirmForceDelete] = useState<string | null>(null);

  // --- Members (removal / leave / re-invite) ---------------------------------------------
  // removeMember/leaveGroup/createInvite existed in the API client but had no UI at all, so
  // a member added by mistake could never be removed and a placeholder seat could never be
  // invited after the fact.
  const myEmail = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const me = group.members.find((m) => m.user_email === myEmail);
  const isAdmin = me?.role === 'admin';
  const visibleMembers = group.members.filter((m) => m.status !== 'left');
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<MemberDTO | null>(null);
  const [forceRemove, setForceRemove] = useState<{ member: MemberDTO; reason: string } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');

  const refreshGroup = () => {
    queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
    queryClient.invalidateQueries({ queryKey: ['group-balances', group.group_id] });
    queryClient.invalidateQueries({ queryKey: ['groups'] });
  };

  const doRemove = async (member: MemberDTO, force: boolean) => {
    setMemberBusy(member.member_id);
    try {
      await removeMember(group.group_id, member.member_id, force);
      refreshGroup();
      setToast({ open: true, message: `${member.display_name} removed`, severity: 'success' });
      setPendingRemove(null);
      setForceRemove(null);
    } catch (e) {
      // Balance guard: 409 when they still owe / are owed — offer to remove anyway.
      if (!force && e instanceof ApiError && e.status === 409) {
        setPendingRemove(null);
        setForceRemove({ member, reason: e.message });
      } else {
        setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to remove member', severity: 'error' });
        setPendingRemove(null);
        setForceRemove(null);
      }
    } finally {
      setMemberBusy(null);
    }
  };

  const doLeave = async () => {
    setMemberBusy('me');
    try {
      await leaveGroup(group.group_id);
      refreshGroup();
      setConfirmLeave(false);
      onClose();
      setToast({ open: true, message: `You left ${group.name}`, severity: 'success' });
    } catch (e) {
      setConfirmLeave(false);
      setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to leave group', severity: 'error' });
    } finally {
      setMemberBusy(null);
    }
  };

  const copyInviteLink = async (member: MemberDTO) => {
    setMemberBusy(member.member_id);
    try {
      const inv = await createInvite(group.group_id, member.member_id);
      await navigator.clipboard.writeText(inv.url);
      setToast({ open: true, message: 'Invite link copied — anyone with it can take this seat', severity: 'success' });
    } catch (e) {
      setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to create invite link', severity: 'error' });
    } finally {
      setMemberBusy(null);
    }
  };

  const sendInviteEmail = async (member: MemberDTO) => {
    const email = inviteEmail.trim();
    if (!email) return;
    setMemberBusy(member.member_id);
    try {
      await createInvite(group.group_id, member.member_id, email);
      setToast({ open: true, message: `Invite emailed to ${email}`, severity: 'success' });
      setInviteFor(null);
      setInviteEmail('');
    } catch (e) {
      setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to send invite', severity: 'error' });
    } finally {
      setMemberBusy(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateGroup(group.group_id, {
        simplify_debts: simplifyDebts,
        currency,
        default_split: splitValue.type === 'equal' && splitValue.entries.length === 0 ? null : { type: splitValue.type, entries: splitValue.entries },
      });
      queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
      queryClient.invalidateQueries({ queryKey: ['group-balances', group.group_id] });
      setToast({ open: true, message: 'Settings saved', severity: 'success' });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        Group Settings
        {isArchived && <Chip label="Archived" size="small" color="warning" variant="outlined" />}
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Typography color="error" gutterBottom>
            {error}
          </Typography>
        )}

        {isArchived && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            Currency, Simplify Debts, and Default Split are locked while this group is archived.
            Unarchive below to edit them again.
          </Alert>
        )}

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>Members</Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {isAdmin
              ? 'Removed members keep their past expenses and splits; only their seat closes.'
              : 'Only a group admin can remove members.'}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', mt: 1 }}>
            {visibleMembers.map((m) => {
              const isMe = m.member_id === me?.member_id;
              const pending = m.status === 'invited' && !m.user_email;
              const busy = memberBusy === m.member_id;
              return (
                <Box key={m.member_id} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {m.display_name}{isMe ? ' (you)' : ''}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25 }}>
                        {m.role === 'admin' && <Chip label="Admin" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />}
                        {pending && <Chip label="Hasn't joined yet" size="small" color="warning" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />}
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                      {pending && !isArchived && (
                        <>
                          <Button size="small" variant="text" startIcon={<MailOutlineRoundedIcon fontSize="small" />} disabled={busy} onClick={() => { setInviteFor(inviteFor === m.member_id ? null : m.member_id); setInviteEmail(''); }}>
                            Email invite
                          </Button>
                          <Button size="small" variant="text" startIcon={<LinkRoundedIcon fontSize="small" />} disabled={busy} onClick={() => copyInviteLink(m)}>
                            Copy link
                          </Button>
                        </>
                      )}
                      {isAdmin && !isMe && !isArchived && (
                        <Button size="small" variant="text" color="error" startIcon={<PersonRemoveRoundedIcon fontSize="small" />} disabled={busy} onClick={() => setPendingRemove(m)}>
                          Remove
                        </Button>
                      )}
                    </Box>
                  </Box>
                  {inviteFor === m.member_id && (
                    <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <TextField
                        size="small"
                        type="email"
                        label="Their email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        autoFocus
                        sx={{ flex: '1 1 200px' }}
                        helperText="They get a join link that only this address can use"
                      />
                      <Button variant="contained" size="small" disabled={busy || !inviteEmail.trim()} onClick={() => sendInviteEmail(m)} sx={{ mt: 0.25 }}>
                        Send
                      </Button>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
          {me && !isArchived && (
            <Button size="small" variant="text" color="inherit" sx={{ mt: 1.5, color: 'text.secondary' }} onClick={() => setConfirmLeave(true)} disabled={memberBusy === 'me'}>
              Leave this group
            </Button>
          )}
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>Currency</Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            One currency for the whole group — every expense is recorded in this currency.
          </Typography>
          <TextField select size="small" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={isArchived} sx={{ minWidth: 140, mt: 1 }}>
            {CURRENCIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>Simplify Debts</Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Automatically minimize the total number of transactions needed to settle all debts in the group.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={simplifyDebts}
                onChange={(e) => setSimplifyDebts(e.target.checked)}
                disabled={isArchived}
                color="primary"
              />
            }
            label="Enable Simplify Debts"
          />
        </Box>
        
        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>Notifications</Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Mute push notifications for this group. This only affects you — other members are unaffected.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={muted}
                disabled={!prefsLoaded}
                onChange={(e) => handleToggleMuted(e.target.checked)}
                color="primary"
              />
            }
            label="Mute this group"
          />
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>Export</Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Download every expense and settlement in this group as a CSV file.
          </Typography>
          <Button variant="outlined" startIcon={<FileDownloadRoundedIcon />} onClick={handleExport}>
            Export CSV
          </Button>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box>
          <Typography variant="h6" gutterBottom>Default Split</Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Set a default split rule for all new expenses in this group.
          </Typography>
          
          <Box sx={{ mt: 2, pointerEvents: isArchived ? 'none' : 'auto', opacity: isArchived ? 0.5 : 1 }}>
            <SplitEditor
              amount={100} // Dummy amount for UI purposes
              members={group.members}
              value={splitValue}
              onChange={setSplitValue}
              currency={currency}
            />
          </Box>
        </Box>
        
        <Divider sx={{ my: 3 }} />
        
        <Box>
          <Typography variant="h6" color="error" gutterBottom>Danger Zone</Typography>
          
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
            {group.status === 'active' && (
              <Button
                variant="outlined"
                color="warning"
                disabled={saving}
                onClick={() => setConfirmArchive(true)}
              >
                Archive Group
              </Button>
            )}
            
            {group.status === 'archived' && (
              <Button 
                variant="outlined" 
                color="primary" 
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await unarchiveGroup(group.group_id);
                    queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
                    setToast({ open: true, message: 'Group unarchived', severity: 'success' });
                    onClose();
                  } catch(e) {
                    setError(e instanceof ApiError ? e.message : 'Failed to unarchive');
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Unarchive Group
              </Button>
            )}

            {group.status === 'deleted' && (
              <Button 
                variant="outlined" 
                color="primary" 
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await restoreGroup(group.group_id);
                    queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
                    setToast({ open: true, message: 'Group restored', severity: 'success' });
                    onClose();
                  } catch(e) {
                    setError(e instanceof ApiError ? e.message : 'Failed to restore');
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Restore Group
              </Button>
            )}

            {group.status !== 'deleted' && (
              <Button
                variant="outlined"
                color="error"
                disabled={saving}
                onClick={() => setConfirmDelete(true)}
              >
                Delete Group
              </Button>
            )}
          </Box>
        </Box>

      </DialogContent>

      <ConfirmDialog
        open={confirmArchive}
        title="Archive this group?"
        message="Existing balances and history stay intact — you can unarchive it any time from this same Settings panel."
        confirmLabel="Archive"
        loading={saving}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={async () => {
          setSaving(true);
          try {
            await archiveGroup(group.group_id);
            queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
            setToast({
              open: true,
              message: 'Group archived',
              severity: 'success',
              action: {
                label: 'Undo',
                onClick: async () => {
                  try {
                    await unarchiveGroup(group.group_id);
                    queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
                    setToast({ open: true, message: 'Group unarchived', severity: 'success' });
                  } catch (e) {
                    setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to unarchive', severity: 'error' });
                  }
                },
              },
            });
            setConfirmArchive(false);
            onClose();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Failed to archive');
            setConfirmArchive(false);
          } finally {
            setSaving(false);
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this group?"
        message="This will permanently delete it after 30 days. You can undo this from the confirmation toast in the meantime."
        confirmLabel="Delete"
        destructive
        loading={saving}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setSaving(true);
          try {
            await deleteGroup(group.group_id);
            queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
            setToast({
              open: true,
              message: 'Group deleted',
              severity: 'success',
              action: {
                label: 'Undo',
                onClick: async () => {
                  try {
                    await restoreGroup(group.group_id);
                    queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
                    setToast({ open: true, message: 'Group restored', severity: 'success' });
                  } catch (e) {
                    setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to restore', severity: 'error' });
                  }
                },
              },
            });
            setConfirmDelete(false);
            onClose();
          } catch (e) {
            // Balance guard (group_service.delete_group) returns 409 when the group isn't
            // settled — offer force delete instead of leaving the user stuck.
            if (e instanceof ApiError && e.status === 409) {
              setConfirmForceDelete(e.message);
            } else {
              setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to delete', severity: 'error' });
            }
            setConfirmDelete(false);
          } finally {
            setSaving(false);
          }
        }}
      />

      <ConfirmDialog
        open={!!confirmForceDelete}
        title="Group isn't settled up"
        message={
          <>
            {confirmForceDelete}
            <br />
            <br />
            Delete anyway? This will permanently delete it after 30 days.
          </>
        }
        confirmLabel="Delete anyway"
        destructive
        loading={saving}
        onCancel={() => setConfirmForceDelete(null)}
        onConfirm={async () => {
          setSaving(true);
          try {
            await deleteGroup(group.group_id, true);
            queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
            setToast({
              open: true,
              message: 'Group deleted',
              severity: 'success',
              action: {
                label: 'Undo',
                onClick: async () => {
                  try {
                    await restoreGroup(group.group_id);
                    queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
                    setToast({ open: true, message: 'Group restored', severity: 'success' });
                  } catch (e2) {
                    setToast({ open: true, message: e2 instanceof ApiError ? e2.message : 'Failed to restore', severity: 'error' });
                  }
                },
              },
            });
            setConfirmForceDelete(null);
            onClose();
          } catch (e2) {
            setToast({ open: true, message: e2 instanceof ApiError ? e2.message : 'Failed to delete', severity: 'error' });
            setConfirmForceDelete(null);
          } finally {
            setSaving(false);
          }
        }}
      />

      <ConfirmDialog
        open={!!pendingRemove}
        title={`Remove ${pendingRemove?.display_name ?? 'member'}?`}
        message="They'll lose access to this group. Their past expenses and splits stay in the history."
        confirmLabel="Remove"
        destructive
        loading={!!memberBusy}
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => pendingRemove && doRemove(pendingRemove, false)}
      />
      <ConfirmDialog
        open={!!forceRemove}
        title={`${forceRemove?.member.display_name ?? 'Member'} isn't settled up`}
        message={
          <>
            {forceRemove?.reason}
            <br />
            <br />
            Remove anyway? Their balance stays on the books until it's settled.
          </>
        }
        confirmLabel="Remove anyway"
        destructive
        loading={!!memberBusy}
        onCancel={() => setForceRemove(null)}
        onConfirm={() => forceRemove && doRemove(forceRemove.member, true)}
      />
      <ConfirmDialog
        open={confirmLeave}
        title={`Leave ${group.name}?`}
        message="You'll stop seeing this group's expenses. You need to be settled up first; an admin can add you back later."
        confirmLabel="Leave group"
        destructive
        loading={memberBusy === 'me'}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={doLeave}
      />

      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving || isArchived}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
