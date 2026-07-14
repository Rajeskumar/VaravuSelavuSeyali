import React from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuickLogBar } from '../../hooks/useQuickLogBar';
import WillLogPreview from '../common/WillLogPreview';

/**
 * Home's "type to log" bar (TrackSpense v3 Mobile design, mobile-only — see DashboardPage.tsx).
 * Thin wrapper around `useQuickLogBar` (shared with the desktop header's equivalent bar) plus
 * an inline pill input and the "WILL LOG" chip-row preview.
 */
const TypeToLogBar: React.FC = () => {
  const { text, setText, parsed, memberCount, isQuestion, submitting, error, submit } = useQuickLogBar();

  return (
    <Box sx={{ mt: 1.75 }}>
      <TextField
        fullWidth
        size="small"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="✨ Log or ask… “coffee 6.75 at Blue Bottle”"
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 999 } }}
      />

      {parsed && (
        <WillLogPreview parsed={parsed} memberCount={memberCount} submitting={submitting} onSubmit={submit} variant="card" />
      )}

      {isQuestion && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, ml: 1.5, color: 'text.secondary' }}>
          Press Enter to ask the AI
        </Typography>
      )}

      {error && (
        <Typography color="error" variant="caption" sx={{ display: 'block', mt: 0.75 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
};

export default TypeToLogBar;
