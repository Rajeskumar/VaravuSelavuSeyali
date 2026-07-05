import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Chip,
  Box,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { formatAppDate } from '../../utils/date';
import { glassCardSx } from '../../theme';

interface Activity {
  date: string;
  description: string;
  category: string;
  cost: number;
  /** Present only for group-sourced rows in the unified feed (spec §11.2) — `cost` is
   * already the user's share for these; `groupTotal` is the full expense amount. */
  groupName?: string;
  groupTotal?: number;
}

interface Props {
  items: Activity[];
}

const RecentActivityList: React.FC<Props> = ({ items }) => {
  const theme = useTheme();
  return (
  <motion.div
    initial={{ opacity: 0, y: 32 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-80px' }}
    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
  >
  <Card
    sx={{
      ...glassCardSx(theme),
      animation: 'fadeIn 0.5s ease'
    }}
  >
    <CardContent>
      <Typography variant="h6" gutterBottom>
        Recent Transactions
      </Typography>
      <TableContainer sx={{ overflowX: 'hidden' }}>
        <Table size="small" sx={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '18%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '39%' }} />
            <col style={{ width: '25%' }} />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Description</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item, idx) => (
              <TableRow key={`${item.date}-${item.description}-${idx}`}>
                <TableCell sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatAppDate(item.date)}</TableCell>
                <TableCell sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{item.category}</TableCell>
                <TableCell sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {item.description}
                  {item.groupName && (
                    <Chip size="small" label={item.groupName} sx={{ ml: 1, verticalAlign: 'middle' }} />
                  )}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }} align="right">
                  {item.groupName ? (
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>${item.cost.toFixed(2)}</Typography>
                      <Typography variant="caption" color="text.secondary">${(item.groupTotal ?? item.cost).toFixed(2)} total</Typography>
                    </Box>
                  ) : (
                    `$${item.cost.toFixed(2)}`
                  )}
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <Typography color="text.secondary">No recent transactions</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </CardContent>
  </Card>
  </motion.div>
  );
};

export default RecentActivityList;
