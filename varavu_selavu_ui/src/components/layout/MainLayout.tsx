import React from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Fab from '@mui/material/Fab';
import Dialog from '@mui/material/Dialog';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import AddIcon from '@mui/icons-material/Add';
import { useQueryClient } from '@tanstack/react-query';
import SideNav from './SideNav';
import AddExpenseForm from '../expenses/AddExpenseForm';
import { notifyExpenseChanged } from '../../utils/expenseEvents';

interface Props {
  children: React.ReactNode;
  mobileOpen: boolean;
  handleDrawerToggle: () => void;
}

/**
 * Persistent "Add Expense" FAB (TS-DES-111) — reachable from every
 * authenticated route since every route wraps its page in this layout,
 * bringing web to parity with mobile's existing center "+" tab. Opens the
 * same AddExpenseForm ExpensesPage uses, scoped to personal expenses only
 * (group-scoped entry already has its own flow on GroupDetailPage).
 */
const MainLayout: React.FC<Props> = ({ children, mobileOpen, handleDrawerToggle }) => {
  const queryClient = useQueryClient();
  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') || '' : '';
  const [addOpen, setAddOpen] = React.useState(false);
  const [toast, setToast] = React.useState<{ open: boolean; message: string; severity: 'success' | 'error' }>(
    { open: false, message: '', severity: 'success' }
  );

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses', user] });
    notifyExpenseChanged();
    setAddOpen(false);
    setToast({ open: true, message: 'Expense added', severity: 'success' });
  };

  return (
    <Box>
      <SideNav mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle} />
      {/* Extra bottom padding clears the fixed FAB (56px + 24px offset) so it
          never overlaps the last row of page content. */}
      <Container maxWidth="lg" sx={{ pb: 12, pt: 4 }}>
        {children}
      </Container>

      <Fab
        color="primary"
        aria-label="Add expense"
        onClick={() => setAddOpen(true)}
        sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: (theme) => theme.zIndex.speedDial }}
      >
        <AddIcon />
      </Fab>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <Box sx={{ p: 2 }}>
          <AddExpenseForm
            onSuccess={handleSuccess}
            onError={(msg) => setToast({ open: true, message: msg, severity: 'error' })}
            onCancel={() => setAddOpen(false)}
          />
        </Box>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={2500}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToast((t) => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MainLayout;
