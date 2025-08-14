import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: { main: '#4F46E5' },
    secondary: { main: '#14B8A6' },
    background: { default: '#F6F7FB', paper: '#FFFFFF' },
    success: { main: '#16A34A' },
    error: { main: '#DC2626' },
    warning: { main: '#F59E0B' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Inter, Roboto, Helvetica, Arial, sans-serif',
    fontSize: 15,
    h5: { fontWeight: 700 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0px 1px 4px rgba(0,0,0,0.1)',
          transition: 'transform 0.2s ease',
          '&:hover': {
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0px 2px 8px rgba(0,0,0,0.2)',
          },
        },
      },
    },
  },
});

export default theme;
