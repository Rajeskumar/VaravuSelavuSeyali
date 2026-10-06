import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import PasswordField from '../common/PasswordField';
import { fetchMe } from '../../api/auth';
import { changePassword, endSession, listSessions, signOutEverywhere } from '../../api/account';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown');

/** Password, signed-in devices and "sign out everywhere". Lives on Profile next to the rest of the
 * account controls; nothing here is shown to other people. */
const SecuritySection: React.FC<{ onSignedOut: () => void; children?: React.ReactNode }> = ({ onSignedOut, children }) => {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['auth-me'], queryFn: fetchMe, staleTime: 60_000, retry: false });
  const sessions = useQuery({ queryKey: ['auth-sessions'], queryFn: listSessions, retry: false });
  const hasPassword = me.data?.has_password !== false;

  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = next.length >= 8 && next === confirm && (!hasPassword || current.length > 0) && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setMsg(null);
    try {
      await changePassword({ current_password: hasPassword ? current : undefined, new_password: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setMsg({ kind: 'success', text: 'Password changed. Your other devices have been signed out.' });
      qc.invalidateQueries({ queryKey: ['auth-sessions'] });
      qc.invalidateQueries({ queryKey: ['auth-me'] });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Could not change your password' });
    } finally {
      setBusy(false);
    }
  };

  const endOne = async (id: string) => {
    try {
      await endSession(id);
      qc.invalidateQueries({ queryKey: ['auth-sessions'] });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Could not sign that device out' });
    }
  };

  const everywhere = async () => {
    setBusy(true);
    try {
      await signOutEverywhere();
      onSignedOut();
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Could not sign you out everywhere' });
      setBusy(false);
    }
  };

  return (
    <Card sx={{ mt: 3 }} component="section" aria-labelledby="security-h">
      <CardContent>
        <Typography id="security-h" variant="h6" component="h2" gutterBottom>
          Security
        </Typography>

        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 420 }}>
          <Typography variant="subtitle2">{hasPassword ? 'Change password' : 'Set a password'}</Typography>
          {!hasPassword && (
            <Typography variant="body2" color="text.secondary">
              You sign in with Google. Setting a password also lets you sign in with your email.
            </Typography>
          )}
          {hasPassword && (
            <PasswordField label="Current password" size="small" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          )}
          <PasswordField label="New password" size="small" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" helperText="At least 8 characters. Avoid common passwords." />
          <PasswordField
            label="Confirm new password"
            size="small"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            error={mismatch}
            helperText={mismatch ? "Passwords don't match." : ' '}
          />
          {msg && (
            <Alert severity={msg.kind} role={msg.kind === 'error' ? 'alert' : 'status'}>
              {msg.text}
            </Alert>
          )}
          <Box>
            <Button type="submit" variant="contained" disabled={!canSubmit}>
              {busy ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
            </Button>
          </Box>
        </Box>

        {children}

        <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
          Where you're signed in
        </Typography>
        {sessions.isLoading && <Typography variant="body2" color="text.secondary">Loading…</Typography>}
        {sessions.isError && <Typography variant="body2" color="text.secondary">Couldn't load your sign-ins.</Typography>}
        <Stack divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>
          {(sessions.data ?? []).map((s, i) => (
            <Box key={s.family_id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Sign-in {i + 1} {s.current && <Chip label="This device" size="small" color="primary" variant="outlined" sx={{ ml: 0.5, height: 20 }} />}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Started {when(s.signed_in_at)} · last active {when(s.last_active_at)}
                </Typography>
              </Box>
              {!s.current && (
                <Button size="small" color="error" onClick={() => endOne(s.family_id)}>
                  Sign out
                </Button>
              )}
            </Box>
          ))}
        </Stack>
        <Button sx={{ mt: 1.5 }} variant="outlined" color="error" onClick={everywhere} disabled={busy}>
          Sign out of all devices
        </Button>
      </CardContent>
    </Card>
  );
};

export default SecuritySection;
