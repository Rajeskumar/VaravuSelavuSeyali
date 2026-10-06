import React from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField, Typography } from '@mui/material';
import PasswordField from '../common/PasswordField';

interface Props {
  open: boolean;
  email: string;
  /** Accounts created with Google have no password; they confirm by typing their email. */
  hasPassword: boolean;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (proof: { password?: string; confirm_email?: string }) => void;
}

/** Says exactly what is erased and what stays before asking for proof of ownership. */
const DeleteAccountDialog: React.FC<Props> = ({ open, email, hasPassword, deleting, error, onCancel, onConfirm }) => {
  const [typed, setTyped] = React.useState('');
  React.useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const ready = typed.length > 0 && !deleting;
  return (
    <Dialog open={open} onClose={() => !deleting && onCancel()} maxWidth="sm" fullWidth>
      <DialogTitle>Delete your account</DialogTitle>
      <DialogContent>
        <DialogContentText component="div" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            This can't be undone.
          </Typography>
          <Typography variant="body2" component="div">
            <strong>Deleted:</strong> your profile, personal expenses and receipt items, budgets, recurring templates, tags, cards and
            sign-ins.
          </Typography>
          <Typography variant="body2" component="div" sx={{ mt: 1 }}>
            <strong>Stays for the people you shared with:</strong> expenses you added to shared groups, with their descriptions and
            amounts, so everyone else's balances stay correct. Your name on them becomes "Anonymous User" and your email is removed.
            Download your data first if you want a copy.
          </Typography>
        </DialogContentText>
        {hasPassword ? (
          <PasswordField autoFocus margin="dense" label="Your password" fullWidth value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="current-password" />
        ) : (
          <TextField autoFocus margin="dense" label={`Type ${email} to confirm`} fullWidth value={typed} onChange={(e) => setTyped(e.target.value)} />
        )}
        {error && (
          <Typography role="alert" color="error" variant="body2" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={deleting}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          disabled={!ready}
          onClick={() => onConfirm(hasPassword ? { password: typed } : { confirm_email: typed })}
        >
          {deleting ? 'Deleting…' : 'Delete permanently'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteAccountDialog;
