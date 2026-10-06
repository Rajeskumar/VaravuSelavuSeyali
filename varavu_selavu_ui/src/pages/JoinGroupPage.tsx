import React from 'react';
import Box from '@mui/material/Box';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { acceptInvite, ApiError } from '../api/groups';
import PageContainer from '../components/layout/PageContainer';
import VerifyEmailPrompt from '../components/common/VerifyEmailPrompt';

export const PENDING_INVITE_KEY = 'vs_pending_invite_token';

// 409 now covers two cases — the acceptor is already in the group, and the seat the invite
// points at was claimed by someone else before this link was opened — so the copy has to fit
// both. 403 means the invite was addressed to a different email than the one signed in.
const STATUS_MESSAGES: Record<number, string> = {
  403: 'This invite was sent to a different email address. Sign in with that address to join.',
  404: 'This invite link is invalid.',
  410: 'This invite has expired or already been used.',
  409: "This invite can't be used — you're already in this group, or someone else has already taken this spot.",
};

const JoinGroupPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = React.useState<'checking' | 'need-login' | 'accepting' | 'error' | 'success'>('checking');
  // Email not verified yet. The invite stays pending (sessionStorage), so after verifying
  // the user can retry here instead of being sent away to an empty Groups page.
  const [needsVerify, setNeedsVerify] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) return;
    // Auth tokens are HttpOnly cookies; vs_user is the readable session marker.
    const isLoggedIn = !!localStorage.getItem('vs_user');
    if (!isLoggedIn) {
      sessionStorage.setItem(PENDING_INVITE_KEY, token);
      setState('need-login');
      return;
    }

    setState('accepting');
    acceptInvite(token)
      .then((res) => {
        sessionStorage.removeItem(PENDING_INVITE_KEY);
        setState('success');
        navigate(`/groups/${res.group_id}`, { replace: true });
      })
      .catch((e) => {
        const status = e instanceof ApiError ? e.status : 0;
        // 403 covers two cases; the unverified-email one is told apart by its server message.
        const unverified = status === 403 && e instanceof ApiError && /verify your email/i.test(e.message);
        setMessage((e instanceof ApiError && !unverified && STATUS_MESSAGES[status]) || (e instanceof ApiError ? e.message : 'Failed to accept invite'));
        setNeedsVerify(unverified);
        setState('error');
      });
  }, [token, navigate]);

  return (
    <PageContainer center maxWidth="sm" sx={{ p: 4 }}>
      <Card sx={{ maxWidth: 420, width: '100%' }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          {(state === 'checking' || state === 'accepting') && (
            <>
              <CircularProgress sx={{ mb: 2 }} />
              <Typography>Joining group…</Typography>
            </>
          )}
          {state === 'need-login' && (
            <>
              <Typography variant="h6" component="h1" gutterBottom>
                Log in to accept this invite
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                We'll bring you right back here once you're signed in.
              </Typography>
              <Button variant="contained" onClick={() => navigate('/login')}>
                Go to Login
              </Button>
            </>
          )}
          {state === 'error' && (
            <>
              <Typography component="h1" variant="h6" color={needsVerify ? 'text.primary' : 'error'} gutterBottom>
                {needsVerify ? 'Verify your email to join' : "Couldn't join group"}
              </Typography>
              {needsVerify ? (
                <Box sx={{ mb: 2 }}>
                  <VerifyEmailPrompt onCheckAgain={() => window.location.reload()} />
                </Box>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    {message}
                  </Typography>
                  <Button variant="contained" onClick={() => navigate('/groups')}>
                    Go to Groups
                  </Button>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default JoinGroupPage;
