import React from 'react';
import { Box, Button, Typography } from '@mui/material';

const clientId = () => process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

interface Props {
  /** Receives Google's credential after the person completes Google's own sign-in. */
  onCredential: (credential: string) => void | Promise<void>;
  text?: 'signin_with' | 'signup_with';
  disabled?: boolean;
}

/**
 * "Continue with Google" that loads nothing from Google until it is clicked.
 *
 * Google's sign-in script was injected on page load, so every visitor to Login or Register
 * contacted Google (and received a cookie) before choosing anything. Now the script is fetched on
 * the first click, and Google's own button then replaces this one; the person clicks that to
 * continue. With no client id configured, or if Google can't be reached, nothing renders but the
 * email form.
 */
const GoogleSignInButton: React.FC<Props> = ({ onCredential, text = 'signin_with', disabled }) => {
  const slot = React.useRef<HTMLDivElement>(null);
  const [stage, setStage] = React.useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const callback = React.useRef(onCredential);
  callback.current = onCredential;

  if (!clientId() || stage === 'failed') return null;

  const start = () => {
    setStage('loading');
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onerror = () => setStage('failed');
    script.onload = () => {
      const g = (window as any).google;
      if (!g || !slot.current) {
        setStage('failed');
        return;
      }
      g.accounts.id.initialize({
        client_id: clientId(),
        callback: (resp: { credential: string }) => callback.current(resp.credential),
      });
      g.accounts.id.renderButton(slot.current, {
        theme: 'outline',
        size: 'large',
        // GSI wants a pixel width (max 400).
        width: String(Math.min(400, slot.current.offsetWidth || 400)),
        text,
      });
      setStage('ready');
    };
    document.head.appendChild(script);
  };

  return (
    <Box sx={{ width: '100%' }}>
      <div ref={slot} style={{ width: '100%', display: stage === 'ready' ? 'flex' : 'none', justifyContent: 'center' }} />
      {stage !== 'ready' && (
        <>
          <Button variant="outlined" fullWidth onClick={start} disabled={disabled || stage === 'loading'} sx={{ textTransform: 'none', py: 1.1 }}>
            {stage === 'loading' ? 'Loading Google…' : text === 'signup_with' ? 'Sign up with Google' : 'Continue with Google'}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, textAlign: 'center' }}>
            Opens Google's sign-in. Nothing is loaded from Google until you click.
          </Typography>
        </>
      )}
    </Box>
  );
};

export const isGoogleSignInConfigured = () => Boolean(clientId());

export default GoogleSignInButton;
