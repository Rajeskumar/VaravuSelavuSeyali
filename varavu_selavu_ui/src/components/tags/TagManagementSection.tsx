import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Divider from '@mui/material/Divider';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ArchiveRoundedIcon from '@mui/icons-material/ArchiveRounded';
import UnarchiveRoundedIcon from '@mui/icons-material/UnarchiveRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listTags, updateTag, deleteTag, TagDTO } from '../../api/tags';
import { useTagsEnabled } from '../../hooks/useTagsEnabled';
import TagBulkApplyDialog from './TagBulkApplyDialog';

const PALETTE = ['#5E48C8', '#2E9E6B', '#D97706', '#DC2626', '#0EA5E9', '#DB2777', '#65A30D', '#7C3AED'];

/**
 * Tag management (PRD §7.5) — list all tags (active + archived), rename, recolor,
 * archive/unarchive, delete (with a confirmation stating how many expenses will lose the tag),
 * per-tag usage count, and an entry point to the date-range "tag a trip" apply dialog (§7.3).
 */
const TagManagementSection: React.FC = () => {
  const { enabled: tagsEnabled } = useTagsEnabled();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = React.useState(false);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const [deleteTarget, setDeleteTarget] = React.useState<TagDTO | null>(null);
  const [bulkApplyOpen, setBulkApplyOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags', 'management', showArchived],
    queryFn: () => listTags({ status: showArchived ? 'all' : 'active', limit: 100 }),
    enabled: tagsEnabled,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tags'] });

  const startRename = (tag: TagDTO) => {
    setRenamingId(tag.id);
    setRenameValue(tag.name);
  };

  const commitRename = async (tag: TagDTO) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === tag.name) {
      setRenamingId(null);
      return;
    }
    try {
      setError(null);
      await updateTag(tag.id, { name: trimmed });
      invalidate();
    } catch (e: any) {
      setError(e?.message || 'A tag with that name already exists.');
    } finally {
      setRenamingId(null);
    }
  };

  const recolor = async (tag: TagDTO, color: string) => {
    await updateTag(tag.id, { color });
    invalidate();
  };

  const toggleArchive = async (tag: TagDTO) => {
    await updateTag(tag.id, { status: tag.status === 'Active' ? 'Archived' : 'Active' });
    invalidate();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteTag(deleteTarget.id);
    setDeleteTarget(null);
    invalidate();
  };

  if (!tagsEnabled) return null;

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">Tags</Typography>
          <Button size="small" variant="outlined" onClick={() => setBulkApplyOpen(true)}>
            Tag a trip…
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Group expenses across categories — a trip, a project, anything.
        </Typography>

        {error && (
          <Typography variant="body2" color="error" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}

        {isLoading ? (
          <Typography variant="body2" color="text.secondary">Loading…</Typography>
        ) : tags.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No tags yet — create one from the tag field when adding an expense.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {tags.map((tag) => (
              <Box key={tag.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75 }}>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {PALETTE.map((c) => (
                      <Box
                        key={c}
                        onClick={() => recolor(tag, c)}
                        sx={{
                          width: 14, height: 14, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                          border: c === tag.color ? '2px solid' : '2px solid transparent',
                          borderColor: c === tag.color ? 'text.primary' : 'transparent',
                        }}
                      />
                    ))}
                  </Box>

                  {renamingId === tag.id ? (
                    <>
                      <TextField
                        size="small"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                        sx={{ flex: 1 }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(tag);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                      />
                      <IconButton size="small" onClick={() => commitRename(tag)}><CheckRoundedIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => setRenamingId(null)}><CloseRoundedIcon fontSize="small" /></IconButton>
                    </>
                  ) : (
                    <>
                      <Chip label={tag.name} size="small" sx={{ bgcolor: tag.color, color: '#fff' }} />
                      {tag.status === 'Archived' && <Chip label="Archived" size="small" variant="outlined" />}
                      <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                        {tag.usage_count} expense{tag.usage_count === 1 ? '' : 's'}
                      </Typography>
                      <IconButton size="small" onClick={() => startRename(tag)} aria-label="Rename">
                        <EditRoundedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => toggleArchive(tag)} aria-label={tag.status === 'Active' ? 'Archive' : 'Unarchive'}>
                        {tag.status === 'Active' ? <ArchiveRoundedIcon fontSize="small" /> : <UnarchiveRoundedIcon fontSize="small" />}
                      </IconButton>
                      <IconButton size="small" onClick={() => setDeleteTarget(tag)} aria-label="Delete" color="error">
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </Box>
                <Divider />
              </Box>
            ))}
          </Box>
        )}

        <Button size="small" onClick={() => setShowArchived((s) => !s)} sx={{ mt: 1 }}>
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Button>
      </CardContent>

      <TagBulkApplyDialog
        open={bulkApplyOpen}
        onClose={() => setBulkApplyOpen(false)}
        onApplied={invalidate}
      />

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will remove the tag from {deleteTarget?.usage_count} expense{deleteTarget?.usage_count === 1 ? '' : 's'}.
            This can't be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default TagManagementSection;
