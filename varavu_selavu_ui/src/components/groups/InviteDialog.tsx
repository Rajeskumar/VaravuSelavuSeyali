import React from 'react';
import Dialog from '@mui/material/Dialog';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import InputAdornment from '@mui/material/InputAdornment';
import { createInvite, ApiError } from '../../api/groups';

interface InviteDialogProps {
  open: boolean;
  groupId: string;
  memberId: string;
  displayName: string;
  onClose: () => void;
}

const InviteDialog: React.FC<InviteDialogProps> = ({ open, groupId, memberId, displayName, onClose }) => {
  const [loading, setLoading] = React.useState(false);
  const [url, setUrl] = React.useState<string | null>(null);
  const [expiresAt, setExpiresAt] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setUrl(null);
    setError(null);
    setCopied(false);
    setLoading(true);
    createInvite(groupId, memberId)
      .then((res) => {
        setUrl(res.url);
        setExpiresAt(res.expires_at);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to create invite'))
      .finally(() => setLoading(false));
  }, [open, groupId, memberId]);

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* clipboard API unavailable — user can still select/copy manually */
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Invite {displayName}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Share this link so {displayName} can join the group.
        </Typography>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {error && (
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        )}
        {url && (
          <>
            <TextField
              fullWidth
              value={url}
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <Button size="small" onClick={handleCopy} startIcon={<ContentCopyIcon fontSize="small" />}>
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </InputAdornment>
                ),
              }}
            />
            {expiresAt && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Expires {new Date(expiresAt).toLocaleDateString()}
              </Typography>
            )}
          </>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
          <Button onClick={onClose}>Close</Button>
        </Box>
      </Box>
    </Dialog>
  );
};

export default InviteDialog;
