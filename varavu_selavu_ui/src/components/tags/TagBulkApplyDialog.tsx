import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { useQuery } from '@tanstack/react-query';
import { bulkApplyTags, TagBulkFilter } from '../../api/tags';
import { listGroups, GroupSummary } from '../../api/groups';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

interface TagBulkApplyDialogProps {
  open: boolean;
  onClose: () => void;
  onApplied?: () => void;
  /** Pre-fills the tag field — e.g. opened from a specific tag's row in tag management. */
  initialTagName?: string;
}

/**
 * "Tag a trip" — the primary path for G6 (PRD §7.3): pick a tag, a date range, and optional
 * narrowing filters (group/category/merchant), see a live dry-run preview, then apply. This is
 * the single action that makes "absorb my trip group into this tag" possible — per §4.2, a tags
 * feature without this is dead weight.
 */
const TagBulkApplyDialog: React.FC<TagBulkApplyDialogProps> = ({ open, onClose, onApplied, initialTagName }) => {
  const [tagName, setTagName] = React.useState(initialTagName || '');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [groupId, setGroupId] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [merchantName, setMerchantName] = React.useState('');
  const [applying, setApplying] = React.useState(false);
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [appliedMessage, setAppliedMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTagName(initialTagName || '');
      setStartDate('');
      setEndDate('');
      setGroupId('');
      setCategory('');
      setMerchantName('');
      setApplyError(null);
      setAppliedMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: groups = [] } = useQuery({
    queryKey: ['groups', 'for-tag-bulk-apply'],
    queryFn: () => listGroups(),
    enabled: open,
  });

  const filter: TagBulkFilter = {
    start_date: startDate || undefined,
    end_date: endDate || undefined,
    group_id: groupId || undefined,
    category: category || undefined,
    merchant_name: merchantName || undefined,
  };
  const ready = tagName.trim().length > 0 && !!startDate && !!endDate;
  const debouncedFilter = useDebouncedValue(JSON.stringify(filter), 300);
  const debouncedTagName = useDebouncedValue(tagName, 300);

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['tag-bulk-apply-preview', debouncedTagName, debouncedFilter],
    queryFn: () => bulkApplyTags({ tag_name: debouncedTagName.trim(), filter: JSON.parse(debouncedFilter), dry_run: true }),
    enabled: open && ready,
  });

  const handleApply = async () => {
    setApplying(true);
    setApplyError(null);
    try {
      const result = await bulkApplyTags({ tag_name: tagName.trim(), filter, dry_run: false });
      setAppliedMessage(`Tagged ${result.applied_count} expense${result.applied_count === 1 ? '' : 's'}.`);
      onApplied?.();
    } catch (e) {
      setApplyError('Failed to apply the tag. Please try again.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Tag a trip</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 0.5 }}>
          <TextField
            label="Tag"
            fullWidth
            size="small"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            placeholder="Trip 1"
            autoFocus
          />
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              label="From date"
              type="date"
              fullWidth
              size="small"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="To date"
              type="date"
              fullWidth
              size="small"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>

          <Typography variant="caption" color="text.secondary">Optional narrowing filters</Typography>
          <TextField
            select
            label="Group"
            fullWidth
            size="small"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <MenuItem value="">Any (personal + all your groups)</MenuItem>
            {groups.map((g: GroupSummary) => (
              <MenuItem key={g.group_id} value={g.group_id}>{g.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Category"
            fullWidth
            size="small"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Groceries"
          />
          <TextField
            label="Merchant"
            fullWidth
            size="small"
            value={merchantName}
            onChange={(e) => setMerchantName(e.target.value)}
            placeholder="e.g. Delta"
          />

          {ready && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 24 }}>
              {previewLoading ? (
                <CircularProgress size={14} />
              ) : preview ? (
                <Typography variant="body2" color="text.secondary">
                  Will tag {preview.matched_count - preview.already_tagged_count} expense
                  {preview.matched_count - preview.already_tagged_count === 1 ? '' : 's'} · ${preview.my_expenses_total.toFixed(2)} my share
                  {preview.already_tagged_count > 0 && ` (${preview.already_tagged_count} already tagged)`}
                </Typography>
              ) : null}
            </Box>
          )}

          {applyError && <Alert severity="error">{applyError}</Alert>}
          {appliedMessage && <Alert severity="success">{appliedMessage}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{appliedMessage ? 'Close' : 'Cancel'}</Button>
        {!appliedMessage && (
          <Button
            variant="contained"
            disabled={!ready || applying || previewLoading}
            onClick={handleApply}
          >
            {applying ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : 'Apply'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default TagBulkApplyDialog;
