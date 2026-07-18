import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import SegmentedTabs from '../common/SegmentedTabs';
import { sendEmail } from '../../api/email';

type FeedbackType = 'feature_request' | 'bug_report' | 'contact_us';

// TS-DES-2xx: merged replacement for the old standalone FeatureRequestPage
// ('feature_request') tab and — for the "Something's wrong"/"Question" cases
// — a new client-side split of what ContactPage.tsx still separately covers
// for logged-out visitors ('contact_us'). form_type is unrestricted free
// text server-side (see SendEmailRequest/email_service.py), so introducing
// 'bug_report' needs no backend change; it just gives the inbox an accurate
// [BUG REPORT] subject line instead of lumping it under contact_us.
const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: 'feature_request', label: 'Idea' },
  { value: 'bug_report', label: "Something's wrong" },
  { value: 'contact_us', label: 'Question' },
];

const SUBJECT_PLACEHOLDER: Record<FeedbackType, string> = {
  feature_request: "What's your idea?",
  bug_report: 'What went wrong?',
  contact_us: "What's this about?",
};

const MESSAGE_PLACEHOLDER: Record<FeedbackType, string> = {
  feature_request: 'Describe your feature idea in detail...',
  bug_report: 'What happened, and what did you expect instead?',
  contact_us: 'How can we help?',
};

const SUBJECT_FALLBACK: Record<FeedbackType, string> = {
  feature_request: 'Feature Request',
  bug_report: 'Bug Report',
  contact_us: 'Contact form message',
};

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Feedback entry point — reached from the avatar dropdown (UserMenu), not a route,
 * matching the app's existing pattern for lightweight header-triggered actions
 * (QuickCaptureSheet, AskOverlay). Replaces the old Account-page "Feedback" tab. */
const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ open, onClose }) => {
  const [type, setType] = React.useState<FeedbackType>('feature_request');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState(localStorage.getItem('vs_user') || '');
  const [subject, setSubject] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  const handleClose = () => {
    onClose();
    // Delay the reset until after the close transition so the form doesn't
    // visibly blank out while the dialog is still animating away.
    setTimeout(() => {
      setType('feature_request');
      setName('');
      setSubject('');
      setMessage('');
      setSuccess(false);
      setErrorMsg('');
    }, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !email.trim()) {
      setErrorMsg('Please provide your email and a message.');
      return;
    }
    setSending(true);
    setErrorMsg('');
    try {
      await sendEmail({
        formType: type,
        userEmail: email.trim(),
        subject: subject.trim() || `${SUBJECT_FALLBACK[type]}${name ? ` from ${name}` : ''}`,
        messageBody: message,
        name: name || undefined,
      });
      setSuccess(true);
      setSubject('');
      setMessage('');
    } catch (error: any) {
      setErrorMsg(error.message || 'Failed to send. Please try again later.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Feedback
        <IconButton aria-label="close" onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 0 }}>
          {success ? (
            <Alert severity="success" sx={{ borderRadius: 2 }}>
              Thanks! Your message has been sent — we'll reply by email soon.
            </Alert>
          ) : (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                <SegmentedTabs<FeedbackType>
                  value={type}
                  onChange={setType}
                  options={TYPE_OPTIONS}
                  ariaLabel="Feedback type"
                />
              </Box>

              {errorMsg && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                  {errorMsg}
                </Alert>
              )}

              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
                Your Name (Optional)
              </Typography>
              <TextField
                fullWidth
                variant="outlined"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                sx={{ mb: 3 }}
              />

              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
                Your Email *
              </Typography>
              <TextField
                fullWidth
                type="email"
                variant="outlined"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                sx={{ mb: 3 }}
                required
              />

              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
                Subject (Optional)
              </Typography>
              <TextField
                fullWidth
                variant="outlined"
                placeholder={SUBJECT_PLACEHOLDER[type]}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                sx={{ mb: 3 }}
              />

              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
                Message *
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={5}
                variant="outlined"
                placeholder={MESSAGE_PLACEHOLDER[type]}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </>
          )}
        </DialogContent>
        {!success && (
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={handleClose} disabled={sending}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={sending} sx={{ fontWeight: 700 }}>
              {sending ? <CircularProgress size={20} color="inherit" /> : 'Send'}
            </Button>
          </DialogActions>
        )}
      </form>
    </Dialog>
  );
};

export default FeedbackDialog;
