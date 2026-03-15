import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, CircularProgress, List, ListItemButton, ListItemText,
  Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, LinearProgress, Alert,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  getTopItems, getItemDetail,
  ItemInsightSummary, ItemInsightDetail,
} from '../api/analytics';

const ItemInsightsPage: React.FC = () => {
  const userId = localStorage.getItem('vs_user') || '';
  const [items, setItems] = useState<ItemInsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ItemInsightDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getTopItems(userId)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSelect = async (item: ItemInsightSummary) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await getItemDetail(userId, item.normalized_name);
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
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <IconButton onClick={() => setDetail(null)} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" fontWeight={700}>{detail.normalized_name}</Typography>
        </Box>

        {/* Price summary */}
        <Paper sx={{ p: 3, mb: 2, borderRadius: 3 }}>
          <Typography variant="h6" gutterBottom>Price Summary</Typography>
          <Box sx={{ display: 'flex', gap: 4 }}>
            <Box>
              <Typography color="text.secondary" variant="caption">Average Price</Typography>
              <Typography variant="h5" fontWeight={700}>${detail.avg_unit_price.toFixed(2)}</Typography>
            </Box>
            <Box>
              <Typography color="text.secondary" variant="caption">Min</Typography>
              <Typography variant="h5" fontWeight={700} color="success.main">${detail.min_price.toFixed(2)}</Typography>
            </Box>
            <Box>
              <Typography color="text.secondary" variant="caption">Max</Typography>
              <Typography variant="h5" fontWeight={700} color="error.main">${detail.max_price.toFixed(2)}</Typography>
            </Box>
            <Box>
              <Typography color="text.secondary" variant="caption">Total Spent</Typography>
              <Typography variant="h5" fontWeight={700}>${detail.total_spent.toFixed(2)}</Typography>
            </Box>
          </Box>
          <Chip label={`${detail.total_quantity_bought} purchased`} sx={{ mt: 1 }} />
        </Paper>

        {/* Store comparison */}
        {detail.store_comparison.length > 0 && (
          <Paper sx={{ p: 3, mb: 2, borderRadius: 3 }}>
            <Typography variant="h6" gutterBottom>🏪 Store Comparison</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Store</TableCell>
                    <TableCell align="right">Avg Price</TableCell>
                    <TableCell align="right">Min</TableCell>
                    <TableCell align="right">Max</TableCell>
                    <TableCell align="right">Purchases</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.store_comparison.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell>{s.store_name}</TableCell>
                      <TableCell align="right">${s.avg_price.toFixed(2)}</TableCell>
                      <TableCell align="right">${s.min_price.toFixed(2)}</TableCell>
                      <TableCell align="right">${s.max_price.toFixed(2)}</TableCell>
                      <TableCell align="right">{s.purchase_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* Price history */}
        {detail.price_history.length > 0 && (
          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" gutterBottom>📈 Price History</Typography>
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Store</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Qty</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.price_history.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell>{h.date ? new Date(h.date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>{h.store_name || '—'}</TableCell>
                      <TableCell align="right">${h.unit_price.toFixed(2)}</TableCell>
                      <TableCell align="right">{h.quantity}</TableCell>
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
        🛒 Item Insights
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Your top purchased items ranked by total spend
      </Typography>

      {items.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          No item insights yet. Add expenses with itemized receipts to see insights here.
        </Alert>
      ) : (
        <Paper sx={{ borderRadius: 3 }}>
          {detailLoading && <LinearProgress />}
          <List>
            {items.map((item) => (
              <ListItemButton key={item.id} onClick={() => handleSelect(item)} sx={{ borderRadius: 2 }}>
                <ListItemText
                  primary={item.normalized_name}
                  secondary={`Avg $${item.avg_unit_price.toFixed(2)} · ${item.total_quantity_bought} purchased`}
                />
                <Typography variant="subtitle1" fontWeight={700} color="primary">
                  ${item.total_spent.toFixed(2)}
                </Typography>
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
};

export default ItemInsightsPage;
