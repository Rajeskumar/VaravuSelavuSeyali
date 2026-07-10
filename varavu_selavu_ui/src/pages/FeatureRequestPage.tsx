import React, { useState } from 'react';
import { Box, Typography, TextField, Button, CircularProgress, Alert, Paper } from '@mui/material';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { sendEmail } from '../api/email';
import { motion } from 'framer-motion';
import PageContainer from '../components/layout/PageContainer';

const FeatureRequestPage: React.FC = () => {
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState(localStorage.getItem('vs_user') || '');
  const [idea, setIdea] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim() || !contactEmail.trim()) {
      setErrorMsg('Please provide your email and describe your feature idea.');
      return;
    }

    setSending(true);
    setErrorMsg('');
    setSuccess(false);

    try {
      await sendEmail({
        formType: 'feature_request',
        userEmail: contactEmail || 'anonymous',
        subject: `Feature Request${name ? ` from ${name}` : ''}`,
        messageBody: idea,
        name: name || undefined,
      });
      setSuccess(true);
      setName('');
      setIdea('');
    } catch (error: any) {
      setErrorMsg(error.message || 'Failed to submit. Please try again later.');
    } finally {
      setSending(false);
    }
  };

  return (
    <PageContainer maxWidth="lg" sx={{ mt: { xs: 4, md: 8 }, mb: 4 }}>
      {/* TS-GRP-141: outer frame matches every other authenticated page (lg), but the form
          itself stays a comfortable reading/typing width — a full-width multiline textarea
          at 1200px would be worse, not better. */}
      <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <LightbulbOutlinedIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
        <Typography variant="h3" sx={{ fontWeight: 800, mb: 1, letterSpacing: '-0.5px' }}>
          Submit an Idea
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Got an idea to make TrackSpense better? We'd love to hear it!
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
            Thank you! 🎉 Your feature request has been submitted successfully.
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
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ mb: 3 }}
          />

          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
            Contact Email *
          </Typography>
          <TextField
            fullWidth
            type="email"
            variant="outlined"
            placeholder="your@email.com"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            sx={{ mb: 3 }}
            required
          />

          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}>
            Your Idea *
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={5}
            variant="outlined"
            placeholder="Describe your feature idea in detail..."
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            sx={{ mb: 4 }}
            required
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={sending}
            sx={{
              py: 1.5,
              borderRadius: 2,
              fontWeight: 700,
              fontSize: '1rem',
              boxShadow: '0 4px 14px 0 rgba(79, 70, 229, 0.39)',
              '&:hover': {
                boxShadow: '0 6px 20px rgba(79, 70, 229, 0.23)',
              },
            }}
          >
            {sending ? <CircularProgress size={24} color="inherit" /> : 'Submit Request'}
          </Button>
        </form>
      </Paper>
      </motion.div>
      </Box>
    </PageContainer>
  );
};

export default FeatureRequestPage;
