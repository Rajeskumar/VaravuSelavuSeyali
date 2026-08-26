import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/** Top-level render-error catch-all: without this, any unhandled exception thrown while
 * rendering (a bad API shape, a null-deref in a chart, etc.) unmounts the whole React tree
 * and leaves a blank white page with no way back short of a manual reload. */
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Box
        sx={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: 2,
          p: 4,
        }}
      >
        <ErrorOutlineRoundedIcon sx={{ fontSize: 56, color: 'error.main' }} />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Something broke
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 420 }}>
          We hit an unexpected error. Your data is safe — try reloading the page.
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </Box>
    );
  }
}

export default ErrorBoundary;
