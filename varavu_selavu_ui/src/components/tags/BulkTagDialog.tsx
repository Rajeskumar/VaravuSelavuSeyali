import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import TagInput from '../expenses/TagInput';
import { bulkApplyTags, bulkRemoveTags } from '../../api/tags';

interface BulkTagDialogProps {
  open: boolean;
  mode: 'apply' | 'remove';
  expenseIds: string[];
  onClose: () => void;
  /** Called after a successful apply/remove with a short human-readable summary. */
  onDone: (message: string) => void;
}

/**
 * TS-TAG-108 — the "Tag"/"Untag" actions off the Expenses list's bulk-select bar. Uses the
 * explicit `expense_ids` form of the bulk API (not the date/filter form `TagBulkApplyDialog`
 * uses under Profile — this dialog only ever acts on the rows the user actually checked).
 * The bulk endpoints take exactly one tag per call, so multiple chosen tags here are applied/
 * removed with one sequential request per tag rather than a single batched call.
 */
const BulkTagDialog: React.FC<BulkTagDialogProps> = ({ open, mode, expenseIds, onClose, onDone }) => {
  const [tagNames, setTagNames] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTagNames([]);
      setError(null);
    }
  }, [open]);

  const isApply = mode === 'apply';

  const handleSubmit = async () => {
    if (tagNames.length === 0 || expenseIds.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const call = isApply ? bulkApplyTags : bulkRemoveTags;
      let affected = 0;
      for (const tag_name of tagNames) {
        const result = await call({ tag_name, expense_ids: expenseIds, dry_run: false });
        affected += isApply ? result.applied_count : result.matched_count;
      }
      const verb = isApply ? 'Tagged' : 'Untagged';
      onDone(`${verb} ${expenseIds.length} expense${expenseIds.length === 1 ? '' : 's'} with ${tagNames.length} tag${tagNames.length === 1 ? '' : 's'}.`);
    } catch (e: any) {
      setError(e?.message || `Failed to ${isApply ? 'apply' : 'remove'} tags.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{isApply ? 'Tag' : 'Remove tag from'} {expenseIds.length} expense{expenseIds.length === 1 ? '' : 's'}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {isApply
            ? 'Choose one or more tags to apply to every selected expense.'
            : 'Choose one or more tags to remove from every selected expense. Rows that don’t have a chosen tag are left unchanged.'}
        </DialogContentText>
        <TagInput value={tagNames} onChange={setTagNames} maxTags={10} />
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={submitting || tagNames.length === 0}>
          {submitting ? 'Working…' : isApply ? 'Apply' : 'Remove'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkTagDialog;
