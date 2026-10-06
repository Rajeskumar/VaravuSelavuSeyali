import React from 'react';
import Box from '@mui/material/Box';

const visuallyHidden = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const;

/** The page's `<h1>` for screens whose design has no visible title (Dashboard, Ask, Analysis,
 * Groups). Screen-reader users navigate by heading and RouteA11y moves focus here after a route
 * change, so every routed page needs exactly one. Pages that already render a visible title make
 * that Typography `component="h1"` instead. */
const PageHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box component="h1" sx={visuallyHidden}>{children}</Box>
);

export default PageHeading;
