import React from 'react';
import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { useQuery } from '@tanstack/react-query';
import {
  listGroups,
  getGroup,
  moveExpenseToGroup,
  ApiError,
  GroupSummary,
} from '../../api/groups';
import SplitEditor, { SplitEditorValue } from '../groups/SplitEditor';

interface MoveToGroupDialogProps {
  open: boolean;
  expenseId: number | null;
  amount: number;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * TS-GRP-121: lets the user convert a personal expense into a group expense
 * in place. The converter becomes sole payer server-side (E11) — this dialog
 * only collects which group and how to split it.
 */
const MoveToGroupDialog: React.FC<MoveToGroupDialogProps> = ({ open, expenseId, amount, onClose, onSuccess }) => {
  const [groupId, setGroupId] = React.useState('');
  const [splitValue, setSplitValue] = React.useState<SplitEditorValue>({ type: 'equal', entries: [] });
  const [splitValid, setSplitValid] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const groupsQuery = useQuery({
    queryKey: ['groups-for-move'],
    queryFn: () => listGroups(),
    enabled: open,
  });

  const groupDetailQuery = useQuery({
    queryKey: ['group-detail-for-move', groupId],
    queryFn: () => getGroup(groupId),
    enabled: open && !!groupId,
  });

  React.useEffect(() => {
    if (!open) {
      setGroupId('');
      setSplitValue({ type: 'equal', entries: [] });
      setError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (groupDetailQuery.data) {
      setSplitValue({ type: 'equal', entries: groupDetailQuery.data.members.map((m) => ({ member_id: m.member_id })) });
    }
  }, [groupDetailQuery.data]);

  const handleSubmit = async () => {
    if (!expenseId || !groupId) return;
    setSubmitting(true);
    setError(null);
    try {
      await moveExpenseToGroup(expenseId, {
        group_id: groupId,
        split: { type: splitValue.type, entries: splitValue.entries },
      });
      onSuccess();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to move expense to group.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="h6">Move to group</Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          select
          label="Group"
          fullWidth
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
        >
          {(groupsQuery.data || []).map((g: GroupSummary) => (
            <MenuItem key={g.group_id} value={g.group_id}>
              {g.name}
            </MenuItem>
          ))}
        </TextField>
        {groupDetailQuery.data && (
          <SplitEditor
            amount={amount}
            members={groupDetailQuery.data.members}
            value={splitValue}
            onChange={setSplitValue}
            onValidityChange={setSplitValid}
          />
        )}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !groupId || !splitValid}
          >
            {submitting ? <CircularProgress size={20} sx={{ color: 'inherit' }} /> : 'Move'}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default MoveToGroupDialog;
