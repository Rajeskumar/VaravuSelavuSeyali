import React from 'react';
import { Box, Card, CardContent, Typography, Button, Grid, TextField, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Divider, Link } from '@mui/material';
import { logout as apiLogout } from '../api/auth';
import { getProfile, updateProfile, deleteProfile } from '../api/profile';
import { motion } from 'framer-motion';

const ProfilePage: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [address, setAddress] = React.useState('');
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

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = await getProfile();
        if (!mounted) return;
        setEmail(p.email || localStorage.getItem('vs_user') || '');
        setName(p.name || '');
        setPhone(p.phone || '');
        setAddress(p.address || '');
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
    const refresh = localStorage.getItem('vs_refresh');
    if (refresh) {
      apiLogout(refresh);
    }
    localStorage.removeItem('vs_user');
    localStorage.removeItem('vs_token');
    localStorage.removeItem('vs_refresh');
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
        name, phone, address,
        venmo_handle: venmoHandle, paypal_handle: paypalHandle, upi_id: upiId,
      });
      setName(updated.name || '');
      setPhone(updated.phone || '');
      setAddress(updated.address || '');
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
    <Box sx={{ mt: 4, maxWidth: 400, mx: 'auto', px: { xs: 1, sm: 2 } }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Profile
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
          <Box component="form" onSubmit={handleSave} noValidate>
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField label="Email" fullWidth value={email} InputProps={{ readOnly: true }} />
              </Grid>
              <Grid size={12}>
                <TextField label="Name" fullWidth value={name} onChange={e => setName(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <TextField label="Phone" fullWidth value={phone} onChange={e => setPhone(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <TextField label="Address" fullWidth multiline rows={2} value={address} onChange={e => setAddress(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
                  Payment handles (for Settle Up deep links)
                </Typography>
              </Grid>
              <Grid size={12}>
                <TextField label="Venmo username" placeholder="@yourname" fullWidth value={venmoHandle} onChange={e => setVenmoHandle(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <TextField label="PayPal.me username" fullWidth value={paypalHandle} onChange={e => setPaypalHandle(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <TextField label="UPI ID" placeholder="yourname@bank" fullWidth value={upiId} onChange={e => setUpiId(e.target.value)} />
              </Grid>
              <Grid size={12}>
                <Button type="submit" variant="contained" fullWidth disabled={saving || loading}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </Grid>
            </Grid>
          </Box>
          {email && (
            <Button sx={{ mt: 2 }} variant="outlined" color="primary" fullWidth onClick={handleLogout}>
              Logout
            </Button>
          )}

          <Divider sx={{ my: 3 }} />
          
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
      <Box sx={{ mt: 4, mb: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          <Link href={`${process.env.REACT_APP_API_URL || ''}/terms-of-service`} target="_blank" rel="noopener noreferrer">Terms of Service</Link>
          {' '}•{' '}
          <Link href={`${process.env.REACT_APP_API_URL || ''}/privacy-policy`} target="_blank" rel="noopener noreferrer">Privacy Policy</Link>
        </Typography>
      </Box>
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
