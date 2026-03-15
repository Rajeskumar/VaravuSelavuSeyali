import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, CircularProgress, List, ListItemButton, ListItemText,
  ListItemAvatar, Avatar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, LinearProgress, Alert, Chip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import StorefrontIcon from '@mui/icons-material/Storefront';
import {
  getTopMerchants, getMerchantDetail,
  MerchantInsightSummary, MerchantInsightDetail,
} from '../api/analytics';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MerchantInsightsPage: React.FC = () => {
  const userId = localStorage.getItem('vs_user') || '';
  const [merchants, setMerchants] = useState<MerchantInsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<MerchantInsightDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getTopMerchants(userId)
      .then(setMerchants)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSelect = async (m: MerchantInsightSummary) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await getMerchantDetail(userId, m.merchant_name);
      setDetail(d);
    } catch {
      // non-fatal
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Detail view
  if (detail) {
    const maxSpent = Math.max(...(detail.monthly_aggregates.map(a => a.total_spent) || [1]));

    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <IconButton onClick={() => setDetail(null)} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" fontWeight={700}>{detail.merchant_name}</Typography>
        </Box>

        {/* Summary */}
        <Paper sx={{ p: 3, mb: 2, borderRadius: 3 }}>
          <Box sx={{ display: 'flex', gap: 4 }}>
            <Box>
              <Typography color="text.secondary" variant="caption">Total Spent</Typography>
              <Typography variant="h5" fontWeight={700}>${detail.total_spent.toFixed(2)}</Typography>
            </Box>
            <Box>
              <Typography color="text.secondary" variant="caption">Transactions</Typography>
              <Typography variant="h5" fontWeight={700}>{detail.transaction_count}</Typography>
            </Box>
          </Box>
        </Paper>

        {/* Monthly spending */}
        {detail.monthly_aggregates.length > 0 && (
          <Paper sx={{ p: 3, mb: 2, borderRadius: 3 }}>
            <Typography variant="h6" gutterBottom>📅 Monthly Spending</Typography>
            {detail.monthly_aggregates.map((a, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" sx={{ width: 80, color: 'text.secondary' }}>
                  {MONTH_NAMES[a.month - 1]} {a.year}
                </Typography>
                <Box sx={{ flex: 1, mx: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={maxSpent > 0 ? (a.total_spent / maxSpent) * 100 : 0}
                    sx={{ height: 14, borderRadius: 2 }}
                  />
                </Box>
                <Typography variant="body2" fontWeight={600} sx={{ width: 80, textAlign: 'right' }}>
                  ${a.total_spent.toFixed(2)}
                </Typography>
              </Box>
            ))}
          </Paper>
        )}

        {/* Items bought */}
        {detail.items_bought.length > 0 && (
          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" gutterBottom>🛍️ Items Bought Here</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Item</TableCell>
                    <TableCell align="right">Avg Price</TableCell>
                    <TableCell align="right">Purchases</TableCell>
                    <TableCell align="right">Total Qty</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.items_bought.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>{item.item_name}</TableCell>
                      <TableCell align="right">${item.avg_price.toFixed(2)}</TableCell>
                      <TableCell align="right">{item.purchase_count}</TableCell>
                      <TableCell align="right">{item.total_quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </Box>
    );
  }

  // List view
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        🏪 Merchant Insights
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Your top merchants ranked by total spend
      </Typography>

      {merchants.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No merchant insights yet. Add expenses with merchant info to see insights here.
        </Alert>
      ) : (
        <Paper sx={{ borderRadius: 3 }}>
          {detailLoading && <LinearProgress />}
          <List>
            {merchants.map((m) => (
              <ListItemButton key={m.id} onClick={() => handleSelect(m)} sx={{ borderRadius: 2 }}>
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: 'primary.light' }}>
                    <StorefrontIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={m.merchant_name}
                  secondary={`${m.transaction_count} transactions`}
                />
                <Typography variant="subtitle1" fontWeight={700} color="primary">
                  ${m.total_spent.toFixed(2)}
                </Typography>
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
};

export default MerchantInsightsPage;
