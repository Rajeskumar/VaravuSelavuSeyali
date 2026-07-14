import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import { FOOTER_HEIGHT } from './layoutConstants';

/**
 * TS-DES-210 — app-shell footer, confirmed net-new (no `Footer` component existed anywhere in
 * the codebase before this ticket). Spans the full width of `MainLayout`'s content column at
 * every authenticated route. Terms/Privacy use the same external `REACT_APP_API_URL`-backed link
 * pattern `ProfilePage.tsx` already uses (those pages are backend-served, not client routes);
 * Help and Submit an idea are real client routes.
 */
const Footer: React.FC = () => (
  <Box
    component="footer"
    sx={{
      height: FOOTER_HEIGHT,
      flexShrink: 0,
      // Hidden below `md`: BottomNav (TrackSpense v3 Mobile) now owns the bottom of the
      // mobile viewport — a website-style link footer under a fixed tab bar is redundant.
      display: { xs: 'none', md: 'flex' },
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 2,
      px: { xs: 2, md: 4 },
      borderTop: '1px solid',
      borderColor: 'divider',
      backgroundColor: 'background.paper',
      flexWrap: 'wrap',
    }}
  >
    <Typography variant="caption" color="text.secondary">
      © {new Date().getFullYear()} TrackSpense
    </Typography>
    <Box sx={{ display: 'flex', gap: 2.5 }}>
      <Link
        href={`${process.env.REACT_APP_API_URL || ''}/privacy-policy`}
        target="_blank"
        rel="noopener noreferrer"
        variant="caption"
        color="text.secondary"
        underline="hover"
      >
        Privacy
      </Link>
      <Link
        href={`${process.env.REACT_APP_API_URL || ''}/terms-of-service`}
        target="_blank"
        rel="noopener noreferrer"
        variant="caption"
        color="text.secondary"
        underline="hover"
      >
        Terms
      </Link>
      <Link component={RouterLink} to="/contact" variant="caption" color="text.secondary" underline="hover">
        Help
      </Link>
      <Link component={RouterLink} to="/account?tab=feedback" variant="caption" color="text.secondary" underline="hover">
        Submit an idea
      </Link>
    </Box>
  </Box>
);

export default Footer;
