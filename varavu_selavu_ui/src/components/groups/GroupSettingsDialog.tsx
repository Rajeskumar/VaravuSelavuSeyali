import React, { useState } from 'react';
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
} from '@mui/material';
import { GroupDetailResponse, ApiError } from '../../api/groups';
import { updateGroup, archiveGroup, unarchiveGroup, restoreGroup, deleteGroup } from '../../api/groups';
import SplitEditor, { SplitEditorValue } from './SplitEditor';
import { useQueryClient } from '@tanstack/react-query';

interface GroupSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  group: GroupDetailResponse;
  setToast: (toast: { open: boolean; message: string; severity: 'success' | 'error' }) => void;
}

export const GroupSettingsDialog: React.FC<GroupSettingsDialogProps> = ({
  open,
  onClose,
  group,
  setToast,
}) => {
  const queryClient = useQueryClient();
  const [simplifyDebts, setSimplifyDebts] = useState(group.simplify_debts);
  
  const defaultSplitVal: SplitEditorValue = group.default_split 
    ? { type: group.default_split.split_type, entries: group.default_split.entries }
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
        default_split: splitValue.type === 'equal' && splitValue.entries.length === 0 ? null : { split_type: splitValue.type, entries: splitValue.entries },
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
      <DialogTitle>Group Settings</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Typography color="error" gutterBottom>
            {error}
          </Typography>
        )}
        
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
                color="primary"
              />
            }
            label="Enable Simplify Debts"
          />
        </Box>
        
        <Divider sx={{ my: 3 }} />
        
        <Box>
          <Typography variant="h6" gutterBottom>Default Split</Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Set a default split rule for all new expenses in this group.
          </Typography>
          
          <Box sx={{ mt: 2 }}>
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
                  if (window.confirm('Are you sure you want to delete this group? This will permanently delete it after 30 days.')) {
                    setSaving(true);
                    try {
                      await deleteGroup(group.group_id);
                      queryClient.invalidateQueries({ queryKey: ['group', group.group_id] });
                      setToast({ open: true, message: 'Group deleted', severity: 'success' });
                      onClose();
                    } catch(e) {
                      setError(e instanceof ApiError ? e.message : 'Failed to delete');
                    } finally {
                      setSaving(false);
                    }
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
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
