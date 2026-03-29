import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Box, Typography, Paper, List, ListItemButton, ListItemText,
  Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, LinearProgress, FormControl, InputLabel, Select, MenuItem, Button, Skeleton,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ReceiptIcon from '@mui/icons-material/Receipt';
import StorefrontIcon from '@mui/icons-material/Storefront';
import TimelineIcon from '@mui/icons-material/Timeline';
import { useNavigate } from 'react-router-dom';
import {
  getTopItems, getItemDetail,
  ItemInsightSummary, ItemInsightDetail,
} from '../api/analytics';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ItemInsightsPage: React.FC = () => {
  const userId = localStorage.getItem('vs_user') || '';
  const navigate = useNavigate();
  const [items, setItems] = useState<ItemInsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ItemInsightDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [year, setYear] = useState<number | string>(new Date().getFullYear());
  const [month, setMonth] = useState<number | string>(new Date().getMonth() + 1);
  const location = useLocation();

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getTopItems(userId, {
      year: year === 'all' ? undefined : Number(year),
      month: month === 'all' ? undefined : Number(month),
    })
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, year, month]);

  // Auto-load an item detail if `?item=` is present in URL
  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(location.search);
    const itemParam = params.get('item');
    if (itemParam) {
      (async () => {
        setDetailLoading(true);
        try {
          const d = await getItemDetail(userId, itemParam);
          setDetail(d);
        } catch {
          // ignore
        } finally {
          setDetailLoading(false);
        }
      })();
    }
  }, [location.search, userId]);

  const handleSelect = async (item: ItemInsightSummary) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const itemName = item.item_name || item.normalized_name || '';
      const d = await getItemDetail(userId, itemName);
      setDetail(d);
    } catch {
      // non-fatal
    } finally {
      setDetailLoading(false);
    }
  };

  const years = ['all', ...Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)];
  const months = ['all', ...Array.from({ length: 12 }, (_, i) => i + 1)];

  if (loading) {
    return (
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          <Skeleton width={200} />
        </Typography>
        <Paper sx={{ borderRadius: 3, mt: 4, p: 2 }}>
            {[1, 2, 3, 4, 5].map((i) => (
               <Box key={i} sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
                  <Box sx={{ flex: 1 }}>
                     <Skeleton width="40%" height={24} />
                     <Skeleton width="20%" height={20} />
                  </Box>
                  <Skeleton width={60} height={30} />
               </Box>
            ))}
        </Paper>
      </Box>
    );
  }

  // Detail view
  if (detail) {
    return (
      <Box sx={{ animation: 'fadeIn 0.3s ease' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <IconButton onClick={() => setDetail(null)} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" fontWeight={700}>{detail.item_name || detail.normalized_name}</Typography>
        </Box>

        {/* Price summary */}
        <Paper sx={{ p: 3, mb: 2, borderRadius: 3 }}>
          <Typography variant="h6" gutterBottom>Price Summary</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <Box>
              <Typography color="text.secondary" variant="caption">Average Price</Typography>
              <Typography variant="h5" fontWeight={700}>${(detail.average_unit_price ?? detail.avg_unit_price ?? 0).toFixed(2)}</Typography>
            </Box>
            <Box>
              <Typography color="text.secondary" variant="caption">Min</Typography>
              <Typography variant="h5" fontWeight={700} color="success.main">${(detail.min_unit_price ?? detail.min_price ?? 0).toFixed(2)}</Typography>
            </Box>
            <Box>
              <Typography color="text.secondary" variant="caption">Max</Typography>
              <Typography variant="h5" fontWeight={700} color="error.main">${(detail.max_unit_price ?? detail.max_price ?? 0).toFixed(2)}</Typography>
            </Box>
            <Box>
              <Typography color="text.secondary" variant="caption">Total Spent</Typography>
              <Typography variant="h5" fontWeight={700}>${(detail.total_spent ?? 0).toFixed(2)}</Typography>
            </Box>
          </Box>
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
             <Chip label={`${detail.total_quantity_bought ?? 0} purchased`} size="small" />
             <Typography variant="caption" color="text.secondary" fontStyle="italic">
               Prices and quantities are extracted directly from your uploaded receipts.
             </Typography>
          </Box>
        </Paper>

        {/* Store comparison */}
        {detail.store_comparison?.length > 0 ? (
          <Paper sx={{ p: 3, mb: 2, borderRadius: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StorefrontIcon fontSize="small" /> Store Comparison
            </Typography>
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
                      <TableCell align="right" sx={{ fontWeight: 500 }}>${(s.avg_price ?? 0).toFixed(2)}</TableCell>
                      <TableCell align="right" sx={{ color: 'success.main' }}>${(s.min_price ?? 0).toFixed(2)}</TableCell>
                      <TableCell align="right" sx={{ color: 'error.main' }}>${(s.max_price ?? 0).toFixed(2)}</TableCell>
                      <TableCell align="right">{s.purchase_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        ) : (
            <Paper sx={{ p: 4, mb: 2, borderRadius: 3, textAlign: 'center', bgcolor: 'rgba(0,0,0,0.02)' }}>
                <StorefrontIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography variant="subtitle1" fontWeight={600} color="text.secondary">Not enough data to compare stores.</Typography>
                <Typography variant="body2" color="text.secondary">
                    Shop for this item at different locations to unlock comparison insights.
                </Typography>
            </Paper>
        )}

        {/* Price history */}
        {detail.price_history?.length > 0 ? (
          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TimelineIcon fontSize="small" /> Price History
            </Typography>
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
                      <TableCell align="right" sx={{ fontWeight: 500 }}>${(h.unit_price ?? 0).toFixed(2)}</TableCell>
                      <TableCell align="right">{h.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        ) : null}
      </Box>
    );
  }

  // List view
  return (
    <Box sx={{ animation: 'fadeIn 0.3s ease' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4" fontWeight={700}>
          🛒 Item Insights
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small">
            <InputLabel>Year</InputLabel>
            <Select value={year} label="Year" onChange={(e) => setYear(e.target.value)}>
              {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Month</InputLabel>
            <Select value={month} label="Month" onChange={(e) => setMonth(e.target.value)}>
              {months.map(m => <MenuItem key={m} value={m}>{m === 'all' ? 'All' : MONTH_NAMES[(m as number)-1]}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Your top purchased items ranked by total spend
      </Typography>

      {items.length === 0 ? (
        <Paper sx={{ p: 6, mt: 4, borderRadius: 3, textAlign: 'center', bgcolor: 'rgba(255, 255, 255, 0.7)' }}>
          <ReceiptIcon sx={{ fontSize: 64, color: 'primary.light', mb: 2 }} />
          <Typography variant="h6" fontWeight={700} gutterBottom>
            No item insights yet
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Upload a receipt to unlock detailed item-level insights, price tracking, and store comparisons.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/expenses')} startIcon={<ReceiptIcon />}>
            Add Receipt Expense
          </Button>
        </Paper>
      ) : (
        <Paper sx={{ borderRadius: 3, position: 'relative' }}>
          {detailLoading && <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, borderTopLeftRadius: 12, borderTopRightRadius: 12 }} />}
          <List>
            {items.map((item) => (
              <ListItemButton key={item.id || item.item_name || item.normalized_name} onClick={() => handleSelect(item)} sx={{ borderRadius: 2 }}>
                <ListItemText
                  primary={item.item_name || item.normalized_name}
                  primaryTypographyProps={{ fontWeight: 600 }}
                  secondary={`Avg $${(item.average_unit_price ?? item.avg_unit_price ?? 0).toFixed(2)} · ${item.total_quantity_bought ?? 0} purchased`}
                />
                <Typography variant="subtitle1" fontWeight={700} color="primary">
                  ${(item.total_spent ?? 0).toFixed(2)}
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
