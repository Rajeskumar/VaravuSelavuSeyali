import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Card, CardContent, Typography, Button, Grid, TextField, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Link } from '@mui/material';
import { logout as apiLogout, forgotPassword } from '../api/auth';
import { getProfile, updateProfile, deleteProfile } from '../api/profile';
import { exportMyExpensesCsv } from '../api/expenses';
import { motion } from 'framer-motion';
import TagManagementSection from '../components/tags/TagManagementSection';

const ProfilePage: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [venmoHandle, setVenmoHandle] = React.useState('');
  const [paypalHandle, setPaypalHandle] = React.useState('');
  const [upiId, setUpiId] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [openDeleteDialog, setOpenDeleteDialog] = React.useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [resetState, setResetState] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Changing a password reuses the reset-by-email flow, so it needs no new endpoint and still
  // proves control of the inbox.
  const handleSendReset = async () => {
    setResetState('sending');
    try {
      await forgotPassword({ email });
      setResetState('sent');
    } catch {
      setResetState('error');
    }
  };
  const [exportError, setExportError] = React.useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportMyExpensesCsv();
    } catch {
      setExportError("Couldn't export your expenses. Check your connection and try again.");
    } finally {
      setExporting(false);
    }
  };

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = await getProfile();
        if (!mounted) return;
        setEmail(p.email || localStorage.getItem('vs_user') || '');
        setName(p.name || '');
        setPhone(p.phone || '');
        setVenmoHandle(p.venmo_handle || '');
        setPaypalHandle(p.paypal_handle || '');
        setUpiId(p.upi_id || '');
      } catch (e) {
        setError('Failed to load profile');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleLogout = () => {
    // Revokes the refresh token and expires the auth cookies server-side.
    apiLogout();
    localStorage.removeItem('vs_user');
    window.dispatchEvent(new Event('vs_auth_changed'));
    // Do not navigate here; header handler does on menu. This page can be reached directly too.
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateProfile({
        name, phone,
        venmo_handle: venmoHandle, paypal_handle: paypalHandle, upi_id: upiId,
      });
      setName(updated.name || '');
      setPhone(updated.phone || '');
      setVenmoHandle(updated.venmo_handle || '');
      setPaypalHandle(updated.paypal_handle || '');
      setUpiId(updated.upi_id || '');
      setSuccess('Profile updated');
    } catch (e) {
      setError('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') return;
    setDeleting(true);
    setError(null);
    try {
      await deleteProfile();
      handleLogout();
    } catch (e) {
      setError('Failed to delete profile');
      setDeleting(false);
      setOpenDeleteDialog(false);
    }
  };

  return (
    // 400px read as an unrelated narrow island next to Dashboard/Expenses' ~1000px content
    // column with no visual link between them. 640px keeps the form at a readable width (a
    // single-column form stretched to 1000px would look broken, with inputs far wider than
    // their content) while no longer looking like an accidental leftover from a different
    // layout system.
    <Box sx={{ mt: 4, maxWidth: 640, mx: 'auto', px: { xs: 1, sm: 2 } }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
      {/* Section order (design review 2026-09, UI-13): everyday details → how people pay you →
          organization (tags) → help & legal → sign out → account deletion last and set apart.
          Tags used to sit *after* the red Delete Account button. */}
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Account
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
          <Box component="form" onSubmit={handleSave} noValidate>
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField label="Email" fullWidth value={email} InputProps={{ readOnly: true }} />
              </Grid>
              <Grid size={12}>
                {/* Fields stay disabled until getProfile() lands: anything typed earlier was
                    silently overwritten by the loaded values, then saved as the old ones. */}
                <TextField label="Name" disabled={loading} fullWidth value={name} onChange={e => setName(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <TextField label="Phone (optional)" disabled={loading} fullWidth value={phone} onChange={e => setPhone(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>
                  How people can pay you
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Optional. When someone settles up with you in a group, these give them a one-tap link to pay you directly. Leave blank to skip.
                </Typography>
              </Grid>
              <Grid size={12}>
                <TextField label="Venmo username" disabled={loading} placeholder="@yourname" fullWidth value={venmoHandle} onChange={e => setVenmoHandle(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <TextField label="PayPal.me username" disabled={loading} fullWidth value={paypalHandle} onChange={e => setPaypalHandle(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <TextField label="UPI ID" disabled={loading} placeholder="yourname@bank" fullWidth value={upiId} onChange={e => setUpiId(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <Button type="submit" variant="contained" fullWidth disabled={saving || loading}>
                  {saving ? 'Saving...' : 'Save changes'}
                </Button>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>

      <TagManagementSection />

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Password
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            We'll email {email || 'you'} a link to set a new password. If you sign in with Google, this adds a password too.
          </Typography>
          {resetState === 'sent' && <Alert severity="success" sx={{ mb: 2 }}>Check your inbox for the reset link.</Alert>}
          {resetState === 'error' && <Alert severity="error" sx={{ mb: 2 }}>Couldn't send the email. Try again in a minute.</Alert>}
          <Button variant="outlined" fullWidth onClick={handleSendReset} disabled={!email || resetState === 'sending' || resetState === 'sent'}>
            {resetState === 'sending' ? 'Sending…' : resetState === 'sent' ? 'Email sent' : 'Change password'}
          </Button>
        </CardContent>
      </Card>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Your data
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Download every expense as a CSV: your personal expenses plus your share of each group expense, with tags, notes and card.
          </Typography>
          {exportError && <Alert severity="error" sx={{ mb: 2 }}>{exportError}</Alert>}
          <Button variant="outlined" fullWidth onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export all expenses (CSV)'}
          </Button>
        </CardContent>
      </Card>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Help &amp; legal
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            <Link component={RouterLink} to="/contact">Help &amp; support</Link>
            {' '}•{' '}
            <Link href={`${process.env.REACT_APP_API_BASE_URL || ''}/terms-of-service`} target="_blank" rel="noopener noreferrer">Terms of Service</Link>
            {' '}•{' '}
            <Link href={`${process.env.REACT_APP_API_BASE_URL || ''}/privacy-policy`} target="_blank" rel="noopener noreferrer">Privacy Policy</Link>
          </Typography>
          {email && (
            <Button variant="outlined" color="primary" fullWidth onClick={handleLogout}>
              Log out
            </Button>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mt: 3, borderColor: 'error.main' }}>
        <CardContent>
          <Typography variant="h6" color="error" gutterBottom>
            Danger Zone
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Permanently delete your account and all associated expense data. This action cannot be undone.
          </Typography>
          <Button variant="contained" color="error" fullWidth onClick={() => setOpenDeleteDialog(true)}>
            Delete Account
          </Button>
        </CardContent>
      </Card>
      </motion.div>

      <Dialog open={openDeleteDialog} onClose={() => !deleting && setOpenDeleteDialog(false)}>
        <DialogTitle>Delete Account</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Are you absolutely sure? All your expenses, receipts, recurring templates, and profile data will be permanently deleted and cannot be recovered.
            Type <strong>DELETE</strong> below to confirm.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Type DELETE"
            fullWidth
            variant="outlined"
            value={deleteConfirmation}
            onChange={(e) => setDeleteConfirmation(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)} disabled={deleting}>Cancel</Button>
          <Button 
            onClick={handleDeleteAccount} 
            color="error" 
            variant="contained"
            disabled={deleteConfirmation !== 'DELETE' || deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Permanently'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProfilePage;
