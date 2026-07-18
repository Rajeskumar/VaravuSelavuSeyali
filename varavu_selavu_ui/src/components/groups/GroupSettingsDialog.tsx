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
import { GroupDetailResponse, ApiError } from '../../api/groups';
import {
  updateGroup,
  archiveGroup,
  unarchiveGroup,
  restoreGroup,
  deleteGroup,
  getNotificationPreferences,
  updateNotificationPreferences,
  exportGroupCsv,
} from '../../api/groups';
import SplitEditor, { SplitEditorValue } from './SplitEditor';
import { useQueryClient } from '@tanstack/react-query';

interface GroupSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  group: GroupDetailResponse;
  setToast: (toast: { open: boolean; message: string; severity: 'success' | 'error' }) => void;
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
                onClick={async () => {
                  if (window.confirm('Are you sure you want to archive this group?')) {
                    setSaving(true);
                    try {
                      await archiveGroup(group.group_id);
                      queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
                      setToast({ open: true, message: 'Group archived', severity: 'success' });
                      onClose();
                    } catch(e) {
                      setError(e instanceof ApiError ? e.message : 'Failed to archive');
                    } finally {
                      setSaving(false);
                    }
                  }
                }}
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
                onClick={async () => {
                  if (!window.confirm('Are you sure you want to delete this group? This will permanently delete it after 30 days.')) {
                    return;
                  }
                  setSaving(true);
                  try {
                    await deleteGroup(group.group_id);
                    queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
                    setToast({ open: true, message: 'Group deleted', severity: 'success' });
                    onClose();
                  } catch (e) {
                    // Balance guard (group_service.delete_group) returns 409 when the group
                    // isn't settled — offer force delete instead of leaving the user stuck.
                    if (e instanceof ApiError && e.status === 409 && window.confirm(`${e.message}\n\nDelete anyway?`)) {
                      try {
                        await deleteGroup(group.group_id, true);
                        queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
                        setToast({ open: true, message: 'Group deleted', severity: 'success' });
                        onClose();
                      } catch (e2) {
                        setToast({ open: true, message: e2 instanceof ApiError ? e2.message : 'Failed to delete', severity: 'error' });
                      }
                    } else if (!(e instanceof ApiError && e.status === 409)) {
                      setToast({ open: true, message: e instanceof ApiError ? e.message : 'Failed to delete', severity: 'error' });
                    }
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Delete Group
              </Button>
            )}
          </Box>
        </Box>
        
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving || isArchived}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
