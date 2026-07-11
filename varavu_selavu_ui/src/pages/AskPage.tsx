import React from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Paper } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AIAnalystChat from '../components/ai-analyst/AIAnalystChat';
import { glassCardSx } from '../theme';

/**
 * TS-DES-207 — full-page fallback for direct navigation to `/ask` (deep links, bookmarks, the
 * `?q=...` auto-submit cross-links from Item/Merchant Insights, back-navigation from the ambient
 * overlay). The *primary* way to reach Ask is now the header icon (desktop) / summonable sheet
 * (mobile) — `AskOverlay.tsx` — not this page; this route exists so those entry points still
 * resolve to something concrete rather than a floating panel with no page underneath it.
 * Supersedes the old `AIAnalystPage.tsx` (same content, `/ai-analyst` → `/ask`).
 */
const AskPage: React.FC = () => {
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const theme = useTheme();
  const location = useLocation();
  const initialQuery = new URLSearchParams(location.search).get('q') || undefined;

  return (
    <Box sx={{ mt: 4 }}>
      <Paper elevation={2} sx={{
        ...glassCardSx(theme),
        p: 0,
        height: '75vh',
        minHeight: 600,
        maxWidth: 700,
        mx: 'auto',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <AIAnalystChat userId={user} initialQuery={initialQuery} />
      </Paper>
    </Box>
  );
};

export default AskPage;
