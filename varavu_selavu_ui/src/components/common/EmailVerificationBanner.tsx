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

/** Non-blocking nag — shown under the header when `/auth/me` reports an unverified email.
 * Deliberately doesn't gate any feature: verification exists so unverified addresses don't
 * later collide with group invites/password recovery, not as an access-control mechanism. */
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
        bgcolor: 'warning.main',
        color: 'warning.contrastText',
      }}
    >
      <MarkEmailUnreadRoundedIcon fontSize="small" />
      <Typography variant="body2" sx={{ flex: 1 }}>
        {sent ? "Verification email sent — check your inbox." : 'Please verify your email address.'}
      </Typography>
      {!sent && (
        <Button
          size="small"
          color="inherit"
          variant="outlined"
          disabled={sending}
          onClick={handleResend}
          sx={{ borderColor: 'currentColor' }}
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
