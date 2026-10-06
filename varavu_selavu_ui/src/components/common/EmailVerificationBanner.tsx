import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import MarkEmailUnreadRoundedIcon from '@mui/icons-material/MarkEmailUnreadRounded';
import { resendVerification } from '../../api/auth';

interface Props {
  onDismiss: () => void;
}

/** Shown under the header when `/auth/me` reports an unverified email. Personal tracking works
 * without verification; creating or joining groups requires it (403 server-side), which the
 * Groups screens explain with their own VerifyEmailPrompt. */
const EmailVerificationBanner: React.FC<Props> = ({ onDismiss }) => {
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const handleResend = async () => {
    setSending(true);
    try {
      await resendVerification();
      setSent(true);
    } catch {
      // Silently no-op — this is a soft nag, not worth a second error surface on top of it.
    } finally {
      setSending(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1,
        // Informational, not an error: a full dark-orange bar read as something being broken.
        bgcolor: (t) => (t.palette.mode === 'dark' ? 'rgba(124, 108, 255, 0.16)' : 'rgba(91, 76, 219, 0.08)'),
        color: 'text.primary',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <MarkEmailUnreadRoundedIcon fontSize="small" />
      <Typography variant="body2" sx={{ flex: 1 }}>
        {sent
          ? 'Verification email sent — check your inbox.'
          : 'Verify your email to create and join groups.'}
      </Typography>
      {!sent && (
        <Button
          size="small"
          color="primary"
          variant="contained"
          disabled={sending}
          onClick={handleResend}
        >
          {sending ? 'Sending...' : 'Resend email'}
        </Button>
      )}
      <IconButton size="small" color="inherit" onClick={onDismiss} aria-label="Dismiss">
        <CloseRoundedIcon fontSize="small" />
      </IconButton>
    </Box>
  );
};

export default EmailVerificationBanner;
