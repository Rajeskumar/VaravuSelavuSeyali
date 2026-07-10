import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { acceptInvite, ApiError } from '../api/groups';
import PageContainer from '../components/layout/PageContainer';

export const PENDING_INVITE_KEY = 'vs_pending_invite_token';

const STATUS_MESSAGES: Record<number, string> = {
  404: 'This invite link is invalid.',
  410: 'This invite has expired or already been used.',
  409: "You're already a member of this group.",
};

const JoinGroupPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = React.useState<'checking' | 'need-login' | 'accepting' | 'error' | 'success'>('checking');
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) return;
    const isLoggedIn = !!localStorage.getItem('vs_token');
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
        setMessage((e instanceof ApiError && STATUS_MESSAGES[status]) || (e instanceof ApiError ? e.message : 'Failed to accept invite'));
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
              <Typography variant="h6" gutterBottom>
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
              <Typography variant="h6" color="error" gutterBottom>
                Couldn't join group
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {message}
              </Typography>
              <Button variant="contained" onClick={() => navigate('/groups')}>
                Go to Groups
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default JoinGroupPage;
