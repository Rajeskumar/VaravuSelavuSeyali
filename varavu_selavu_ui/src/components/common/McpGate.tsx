import React, { useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { getConfig } from '../../api/config';
import NotFoundPage from '../../pages/NotFoundPage';

/**
 * The assistant (MCP) pages only exist while the server has MCP turned on. When it is off they
 * render the normal 404 instead of a working-looking page whose every call fails. If the flags
 * can't be loaded we also show the 404 rather than guess that the feature is on.
 */
const McpGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<'loading' | 'on' | 'off'>('loading');
  useEffect(() => {
    let live = true;
    getConfig()
      .then((c) => { if (live) setState(c.mcp_enabled ? 'on' : 'off'); })
      .catch(() => { if (live) setState('off'); });
    return () => { live = false; };
  }, []);
  if (state === 'loading') {
    return <Box role="status" aria-label="Loading" sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
  }
  return state === 'on' ? <>{children}</> : <NotFoundPage />;
};

export default McpGate;
