import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Box, Typography, Paper, List, ListItemButton, ListItemText,
  Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, LinearProgress, Button, Skeleton, Grid,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import ReceiptIcon from '@mui/icons-material/ReceiptRounded';
import StorefrontIcon from '@mui/icons-material/StorefrontRounded';
import TimelineIcon from '@mui/icons-material/TimelineRounded';
import TrendingUpIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownIcon from '@mui/icons-material/TrendingDownRounded';
import RepeatIcon from '@mui/icons-material/RepeatRounded';
import InsightsIcon from '@mui/icons-material/InsightsRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeRounded';
import { useNavigate } from 'react-router-dom';
import {
  getTopItems, getItemDetail,
  ItemInsightSummary, ItemInsightDetail,
} from '../api/analytics';
import InsightScopeFilter, { ScopeBadge, defaultInsightScopeState, resolveScopeFilters } from '../components/common/InsightScopeFilter';
import { motion } from 'framer-motion';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Confidence = 'Low' | 'Medium' | 'High';

/** Prefers the backend-computed confidence (TS-ANL-009) if present; falls back to a client-side estimate. */
function getConfidence(transactionCount: number, distinctMerchants?: number, backendConfidence?: string | null): Confidence {
  if (backendConfidence) {
    const capitalized = backendConfidence.charAt(0).toUpperCase() + backendConfidence.slice(1);
    if (capitalized === 'High' || capitalized === 'Medium' || capitalized === 'Low') return capitalized;
  }
  if (transactionCount >= 6 && (distinctMerchants ?? 0) >= 2) return 'High';
  if (transactionCount >= 3) return 'Medium';
  return 'Low';
}

function monthSpan(firstSeenAt?: string | null, lastSeenAt?: string | null): number {
  if (!firstSeenAt || !lastSeenAt) return 1;
  const first = new Date(firstSeenAt);
  const last = new Date(lastSeenAt);
  if (isNaN(first.getTime()) || isNaN(last.getTime())) return 1;
  const months = (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()) + 1;
  return Math.max(1, months);
}

const SummaryCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; sub?: React.ReactNode }> = ({ label, value, icon, sub }) => (
  <Paper sx={{ p: 2.5, borderRadius: 2, height: '100%' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: 'text.secondary' }}>
      {icon}
      <Typography variant="caption">{label}</Typography>
    </Box>
    <Typography variant="h6" fontWeight={700} noWrap>{value}</Typography>
    {sub}
  </Paper>
);

const ItemInsightsPage: React.FC = () => {
  const userId = localStorage.getItem('vs_user') || '';
  const navigate = useNavigate();
  const [items, setItems] = useState<ItemInsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ItemInsightDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scope, setScope] = useState(defaultInsightScopeState());
  const location = useLocation();

  const activeFilters = resolveScopeFilters(scope);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getTopItems(activeFilters)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, scope.mode, scope.year, scope.month, scope.startDate, scope.endDate]);

  // Auto-load an item detail if `?item=` is present in URL
  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(location.search);
    const itemParam = params.get('item');
    if (itemParam) {
      (async () => {
        setDetailLoading(true);
        try {
          const d = await getItemDetail(itemParam, activeFilters);
          setDetail(d);
        } catch {
          // ignore
        } finally {
          setDetailLoading(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, userId]);

  const handleSelect = async (item: ItemInsightSummary) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const itemName = item.item_name || item.normalized_name || '';
      const d = await getItemDetail(itemName, activeFilters);
      setDetail(d);
    } catch {
      // non-fatal
    } finally {
      setDetailLoading(false);
    }
  };

  const askAi = (question: string) => {
    navigate(`/ai-analyst?q=${encodeURIComponent(question)}`);
  };

  // Summary KPIs derived from the currently filtered item list
  const summary = useMemo(() => {
    if (items.length === 0) return null;
    const withMom = items.filter((i) => i.month_over_month_change_percent != null);
    const personalInflation = withMom.length > 0
      ? withMom.reduce((sum, i) => sum + (i.month_over_month_change_percent ?? 0), 0) / withMom.length
      : null;
    const biggestIncrease = [...withMom]
      .filter((i) => (i.month_over_month_change_percent ?? 0) > 0)
      .sort((a, b) => (b.month_over_month_change_percent ?? 0) - (a.month_over_month_change_percent ?? 0))[0];
    const mostFrequent = [...items].sort((a, b) => b.transaction_count - a.transaction_count)[0];
    return { personalInflation, biggestIncrease, mostFrequent };
  }, [items]);

  if (loading) {
    return (
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          <Skeleton width={200} />
        </Typography>
        <Grid container spacing={2} sx={{ mb: 2, mt: 1 }}>
          {[1, 2, 3].map((i) => (
            <Grid size={{ xs: 6, md: 4 }} key={i}>
              <Skeleton variant="rounded" height={90} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
        <Paper sx={{ borderRadius: 2, mt: 4, p: 2 }}>
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
    const itemLabel = detail.item_name || detail.normalized_name || '';
    const span = monthSpan(detail.first_seen_at, detail.last_seen_at);
    const detailConfidence = getConfidence(
      detail.transaction_count ?? detail.purchase_count ?? 0,
      detail.distinct_merchants_count,
      detail.confidence
    );
    const avgMonthlySpend = (detail.total_spent ?? 0) / span;
    const purchaseFrequency = (detail.purchase_count ?? detail.transaction_count ?? 0) / span;
    const mom = detail.month_over_month_change_percent;
    const hasStoreComparison = (detail.store_comparison?.length ?? 0) >= 2;

    return (
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton onClick={() => setDetail(null)} sx={{ mr: 1 }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5" fontWeight={700}>{itemLabel}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScopeBadge state={scope} />
            <Chip
              icon={<AutoAwesomeIcon />}
              label="Ask AI about this item"
              onClick={() => askAi(`Tell me about my spending on ${itemLabel} — price trends and where I buy it cheapest.`)}
              clickable
              color="primary"
              variant="outlined"
            />
          </Box>
        </Box>

        {/* Price summary */}
        <Paper sx={{ p: 3, mb: 2, borderRadius: 2 }}>
          <Typography variant="h6" gutterBottom>Price Summary</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <Box>
              <Typography color="text.secondary" variant="caption">Average Price</Typography>
              <Typography variant="h5" fontWeight={700}>${(detail.average_unit_price ?? detail.avg_unit_price ?? 0).toFixed(2)}</Typography>
              {mom != null && (
                <Chip
                  size="small"
                  icon={mom >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                  color={mom >= 0 ? 'error' : 'success'}
                  label={`${mom >= 0 ? '+' : ''}${mom.toFixed(1)}% vs last period`}
                  sx={{ mt: 0.5 }}
                />
              )}
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
            <Box>
              <Typography color="text.secondary" variant="caption">Avg Monthly Spend</Typography>
              <Typography variant="h5" fontWeight={700}>${avgMonthlySpend.toFixed(2)}</Typography>
            </Box>
            <Box>
              <Typography color="text.secondary" variant="caption">Purchase Frequency</Typography>
              <Typography variant="h5" fontWeight={700}>{purchaseFrequency.toFixed(1)}/mo</Typography>
            </Box>
          </Box>
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
             <Chip label={`${detail.total_quantity_bought ?? 0} purchased`} size="small" />
             <Chip
               label={`${detailConfidence} confidence`}
               size="small"
               color={detailConfidence === 'High' ? 'success' : detailConfidence === 'Medium' ? 'warning' : 'default'}
             />
             <Typography variant="caption" color="text.secondary" fontStyle="italic">
               Prices and quantities are extracted directly from your uploaded receipts.
             </Typography>
          </Box>
        </Paper>

        {/* Store comparison */}
        {hasStoreComparison ? (
          <Paper sx={{ p: 3, mb: 2, borderRadius: 2 }}>
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
            <Paper sx={{ p: 4, mb: 2, borderRadius: 2, textAlign: 'center', bgcolor: 'rgba(0,0,0,0.02)' }}>
                <StorefrontIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography variant="subtitle1" fontWeight={600} color="text.secondary">Not enough data to compare stores.</Typography>
                <Typography variant="body2" color="text.secondary">
                    Buy this item at 2 or more different stores to unlock a price comparison.
                </Typography>
            </Paper>
        )}

        {/* Price history */}
        {detail.price_history?.length > 0 ? (
          <Paper sx={{ p: 3, borderRadius: 2 }}>
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
      </motion.div>
    );
  }

  // List view
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="h4" fontWeight={700}>
            🛒 Item Insights
          </Typography>
          <ScopeBadge state={scope} />
        </Box>
        <InsightScopeFilter value={scope} onChange={setScope} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Your top purchased items ranked by total spend
      </Typography>

      {items.length === 0 ? (
        <Paper sx={{ p: 6, mt: 4, borderRadius: 2, textAlign: 'center', bgcolor: 'rgba(255, 255, 255, 0.7)' }}>
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
        <>
          {summary && (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <SummaryCard
                  label="Personal Inflation"
                  icon={<InsightsIcon fontSize="small" />}
                  value={summary.personalInflation != null ? `${summary.personalInflation >= 0 ? '+' : ''}${summary.personalInflation.toFixed(1)}%` : '—'}
                  sub={<Typography variant="caption" color="text.secondary">avg price change vs last period</Typography>}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <SummaryCard
                  label="Biggest Price Increase"
                  icon={<TrendingUpIcon fontSize="small" />}
                  value={summary.biggestIncrease ? (summary.biggestIncrease.item_name || summary.biggestIncrease.normalized_name) : '—'}
                  sub={summary.biggestIncrease ? (
                    <Chip size="small" color="error" label={`+${(summary.biggestIncrease.month_over_month_change_percent ?? 0).toFixed(1)}%`} sx={{ mt: 0.5 }} />
                  ) : (
                    <Typography variant="caption" color="text.secondary">No change data for this scope</Typography>
                  )}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <SummaryCard
                  label="Most Frequent"
                  icon={<RepeatIcon fontSize="small" />}
                  value={summary.mostFrequent ? (summary.mostFrequent.item_name || summary.mostFrequent.normalized_name) : '—'}
                  sub={<Typography variant="caption" color="text.secondary">{summary.mostFrequent?.transaction_count ?? 0} purchases</Typography>}
                />
              </Grid>
            </Grid>
          )}

          <Paper sx={{ borderRadius: 2, position: 'relative' }}>
            {detailLoading && <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, borderTopLeftRadius: 12, borderTopRightRadius: 12 }} />}
            <List>
              {items.map((item) => {
                const confidence = getConfidence(item.transaction_count, item.distinct_merchants_count, item.confidence);
                return (
                  <ListItemButton key={item.id || item.item_name || item.normalized_name} onClick={() => handleSelect(item)} sx={{ borderRadius: 2 }}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {item.item_name || item.normalized_name}
                          <Chip
                            label={confidence}
                            size="small"
                            variant="outlined"
                            color={confidence === 'High' ? 'success' : confidence === 'Medium' ? 'warning' : 'default'}
                            sx={{ height: 18, fontSize: '0.65rem' }}
                          />
                        </Box>
                      }
                      primaryTypographyProps={{ fontWeight: 600, component: 'div' }}
                      secondary={`Avg $${(item.average_unit_price ?? item.avg_unit_price ?? 0).toFixed(2)} · ${item.total_quantity_bought ?? 0} purchased`}
                    />
                    {item.month_over_month_change_percent != null && (
                      <Chip
                        size="small"
                        variant="outlined"
                        icon={item.month_over_month_change_percent >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                        color={item.month_over_month_change_percent >= 0 ? 'error' : 'success'}
                        label={`${item.month_over_month_change_percent >= 0 ? '+' : ''}${item.month_over_month_change_percent.toFixed(1)}%`}
                        sx={{ mr: 2 }}
                      />
                    )}
                    <Typography variant="subtitle1" fontWeight={700} color="primary">
                      ${(item.total_spent ?? 0).toFixed(2)}
                    </Typography>
                  </ListItemButton>
                );
              })}
            </List>
          </Paper>
        </>
      )}
    </motion.div>
  );
};

export default ItemInsightsPage;
