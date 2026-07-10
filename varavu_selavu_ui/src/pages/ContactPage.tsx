import React, { useState } from 'react';
import { Box, Typography, TextField, Button, CircularProgress, Alert, Paper } from '@mui/material';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { sendEmail } from '../api/email';
import { motion } from 'framer-motion';
import PageContainer from '../components/layout/PageContainer';

const ContactPage: React.FC = () => {
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState(localStorage.getItem('vs_user') || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !contactEmail.trim()) {
      setErrorMsg('Please provide your email and a message.');
      return;
    }

    setSending(true);
    setErrorMsg('');
    setSuccess(false);

    try {
      await sendEmail({
        formType: 'contact_us',
        userEmail: contactEmail,
        subject: subject.trim() || `Contact form message${name ? ` from ${name}` : ''}`,
        messageBody: message,
        name: name || undefined,
      });
      setSuccess(true);
      setName('');
      setSubject('');
      setMessage('');
    } catch (error: any) {
      setErrorMsg(error.message || 'Failed to send. Please try again later.');
    } finally {
      setSending(false);
    }
  };

  return (
    <PageContainer maxWidth="sm" sx={{ mt: { xs: 4, md: 8 }, mb: 4 }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <MailOutlineIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
          <Typography variant="h3" sx={{ fontWeight: 800, mb: 1, letterSpacing: '-0.5px' }}>
            Contact Us
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Questions, feedback, or a data request? Send us a message and we'll get back to you.
          </Typography>
        </Box>

        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 4,
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.08)',
          }}
        >
          {success && (
            <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>
              Thanks! Your message has been sent — we'll reply by email soon.
            </Alert>
          )}

          {errorMsg && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
              {errorMsg}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
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
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              sx={{ mb: 3 }}
              required
            />

            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
              Subject (Optional)
            </Typography>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="What's this about?"
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
              placeholder="How can we help?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              sx={{ mb: 4 }}
              required
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={sending}
              sx={{ py: 1.5, fontWeight: 700, fontSize: '1rem' }}
            >
              {sending ? <CircularProgress size={24} color="inherit" /> : 'Send Message'}
            </Button>
          </form>
        </Paper>
      </motion.div>
    </PageContainer>
  );
};

export default ContactPage;
