import React from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableBody from '@mui/material/TableBody';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';

export interface ExpenseItem {
  date: string;
  description: string;
  category?: string;
  cost: number;
}

interface Props {
  open: boolean;
  title: string;
  items: ExpenseItem[];
  onClose: () => void;
}

const CategoryDetailsDrawer: React.FC<Props> = ({ open, title, items, onClose }) => {
  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 420 } } }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">{title}</Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>
        {items.length === 0 ? (
          <Typography color="text.secondary">No expenses found.</Typography>
        ) : (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((it, idx) => (
                <TableRow key={`${it.date}-${idx}`}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(it.date).toLocaleDateString()}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{it.description}</TableCell>
                  <TableCell align="right">${it.cost.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>
    </Drawer>
  );
};

export default CategoryDetailsDrawer;

