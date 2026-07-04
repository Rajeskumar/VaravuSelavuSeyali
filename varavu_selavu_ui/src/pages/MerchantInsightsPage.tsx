import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, List, ListItemButton, ListItemText,
  ListItemAvatar, Avatar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, LinearProgress, Button, Skeleton, Chip, Grid,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import StorefrontIcon from '@mui/icons-material/StorefrontRounded';
import PaidOutlinedIcon from '@mui/icons-material/PaidRounded';
import TrendingUpIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownIcon from '@mui/icons-material/TrendingDownRounded';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLongRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeRounded';
import {
  getTopMerchants, getMerchantDetail,
  MerchantInsightSummary, MerchantInsightDetail,
} from '../api/analytics';
import InsightScopeFilter, { ScopeBadge, defaultInsightScopeState, resolveScopeFilters } from '../components/common/InsightScopeFilter';
import { motion } from 'framer-motion';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

const MerchantInsightsPage: React.FC = () => {
  const userId = localStorage.getItem('vs_user') || '';
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState<MerchantInsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<MerchantInsightDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [scope, setScope] = useState(defaultInsightScopeState());
  const location = useLocation();

  const activeFilters = resolveScopeFilters(scope);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getTopMerchants(activeFilters)
      .then(setMerchants)
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, scope.mode, scope.year, scope.month, scope.startDate, scope.endDate]);

  // Auto-load a merchant detail if `?merchant=` is present in URL
  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(location.search);
    const merchantParam = params.get('merchant');
    if (merchantParam) {
      (async () => {
        setDetailLoading(true);
        try {
          const d = await getMerchantDetail(merchantParam, activeFilters);
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

  const handleSelect = async (m: MerchantInsightSummary) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await getMerchantDetail(m.merchant_name, activeFilters);
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

  // Summary KPIs derived from the currently filtered merchant list
  const summary = useMemo(() => {
    if (merchants.length === 0) return null;
    const totalSpend = merchants.reduce((sum, m) => sum + (m.total_spent || 0), 0);
    const totalTransactions = merchants.reduce((sum, m) => sum + (m.transaction_count || 0), 0);
    const topMerchant = merchants[0];
    const biggestRiser = merchants
      .filter((m) => (m.month_over_month_change_percent ?? 0) > 0)
      .sort((a, b) => (b.month_over_month_change_percent ?? 0) - (a.month_over_month_change_percent ?? 0))[0];
    return {
      totalSpend,
      avgBasket: totalTransactions > 0 ? totalSpend / totalTransactions : 0,
      topMerchant,
      biggestRiser,
    };
  }, [merchants]);

  const yearlyRollup = useMemo(() => {
    if (!detail) return [];
    const byYear = new Map<number, { total_spent: number; transaction_count: number }>();
    for (const a of detail.monthly_aggregates) {
      const existing = byYear.get(a.year) || { total_spent: 0, transaction_count: 0 };
      existing.total_spent += a.total_spent;
      existing.transaction_count += a.transaction_count;
      byYear.set(a.year, existing);
    }
    return Array.from(byYear.entries())
      .map(([yr, v]) => ({ year: yr, ...v }))
      .sort((a, b) => b.year - a.year);
  }, [detail]);

  if (loading) {
    return (
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          <Skeleton width={220} />
        </Typography>
        <Grid container spacing={2} sx={{ mb: 2, mt: 1 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid size={{ xs: 6, md: 3 }} key={i}>
              <Skeleton variant="rounded" height={90} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
        <Paper sx={{ borderRadius: 2, mt: 2, p: 2 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Box key={i} sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
              <Skeleton variant="circular" width={40} height={40} />
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
    const maxSpent = Math.max(...(detail.monthly_aggregates.map(a => a.total_spent) || [1]));
    const mom = detail.month_over_month_change_percent;

    return (
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton onClick={() => setDetail(null)} sx={{ mr: 1 }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5" fontWeight={700}>{detail.merchant_name}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScopeBadge state={scope} />
            <Chip
              icon={<AutoAwesomeIcon />}
              label="Ask AI about this merchant"
              onClick={() => askAi(`Tell me about my spending at ${detail.merchant_name} — trends and how it compares to my other merchants.`)}
              clickable
              color="primary"
              variant="outlined"
            />
          </Box>
        </Box>

        {/* Summary */}
        <Paper sx={{ p: 3, mb: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <Box>
              <Typography color="text.secondary" variant="caption">Total Spent</Typography>
              <Typography variant="h5" fontWeight={700}>${detail.total_spent.toFixed(2)}</Typography>
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
              <Typography color="text.secondary" variant="caption">Transactions</Typography>
              <Typography variant="h5" fontWeight={700}>{detail.transaction_count}</Typography>
            </Box>
            {detail.average_transaction_amount != null && (
              <Box>
                <Typography color="text.secondary" variant="caption">Avg Basket</Typography>
                <Typography variant="h5" fontWeight={700}>${detail.average_transaction_amount.toFixed(2)}</Typography>
              </Box>
            )}
            {detail.highest_transaction && (
              <Box>
                <Typography color="text.secondary" variant="caption">Highest Transaction</Typography>
                <Typography variant="h5" fontWeight={700}>${detail.highest_transaction.amount.toFixed(2)}</Typography>
              </Box>
            )}
            {detail.spend_share_percent != null && (
              <Box>
                <Typography color="text.secondary" variant="caption">Share of Total Spend</Typography>
                <Typography variant="h5" fontWeight={700}>{detail.spend_share_percent.toFixed(1)}%</Typography>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Yearly rollup */}
        {yearlyRollup.length > 1 && (
          <Paper sx={{ p: 3, mb: 2, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>📆 Yearly Summary</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {yearlyRollup.map((y) => (
                <Box key={y.year}>
                  <Typography color="text.secondary" variant="caption">{y.year}</Typography>
                  <Typography variant="subtitle1" fontWeight={700}>${y.total_spent.toFixed(2)}</Typography>
                  <Typography variant="caption" color="text.secondary">{y.transaction_count} transactions</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        )}

        {/* Monthly spending */}
        {detail.monthly_aggregates.length > 0 && (
          <Paper sx={{ p: 3, mb: 2, borderRadius: 2 }}>
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

        {/* Recent transactions */}
        {detail.recent_transactions && detail.recent_transactions.length > 0 && (
          <Paper sx={{ p: 3, mb: 2, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ReceiptLongIcon fontSize="small" /> Recent Transactions
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell align="right">Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.recent_transactions.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell>{t.date ? new Date(t.date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>{t.description || '—'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 500 }}>${t.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* Items bought */}
        {detail.items_bought.length > 0 && (
          <Paper sx={{ p: 3, borderRadius: 2 }}>
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
      </motion.div>
    );
  }

  // List view
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="h4" fontWeight={700}>
            🏪 Merchant Insights
          </Typography>
          <ScopeBadge state={scope} />
        </Box>
        <InsightScopeFilter value={scope} onChange={setScope} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Your top merchants ranked by total spend
      </Typography>

      {merchants.length === 0 ? (
        <Paper sx={{ p: 6, mt: 4, borderRadius: 2, textAlign: 'center', bgcolor: 'rgba(255, 255, 255, 0.7)' }}>
          <StorefrontIcon sx={{ fontSize: 64, color: 'primary.light', mb: 2 }} />
          <Typography variant="h6" fontWeight={700} gutterBottom>
            No merchant insights yet
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Add expenses with a merchant name to see spending patterns, trends, and comparisons here.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/expenses')} startIcon={<StorefrontIcon />}>
            Add an Expense
          </Button>
        </Paper>
      ) : (
        <>
          {summary && (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 6, md: 3 }}>
                <SummaryCard
                  label="Top Merchant"
                  icon={<StorefrontIcon fontSize="small" />}
                  value={summary.topMerchant.merchant_name}
                  sub={<Typography variant="caption" color="text.secondary">${summary.topMerchant.total_spent.toFixed(2)}</Typography>}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <SummaryCard
                  label="Total Spend"
                  icon={<PaidOutlinedIcon fontSize="small" />}
                  value={`$${summary.totalSpend.toFixed(2)}`}
                  sub={<Typography variant="caption" color="text.secondary">across {merchants.length} merchants</Typography>}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <SummaryCard
                  label="Avg Basket"
                  icon={<ReceiptLongIcon fontSize="small" />}
                  value={`$${summary.avgBasket.toFixed(2)}`}
                  sub={<Typography variant="caption" color="text.secondary">per transaction</Typography>}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <SummaryCard
                  label="Biggest Riser"
                  icon={<TrendingUpIcon fontSize="small" />}
                  value={summary.biggestRiser ? summary.biggestRiser.merchant_name : '—'}
                  sub={
                    summary.biggestRiser ? (
                      <Chip
                        size="small"
                        color="error"
                        label={`+${(summary.biggestRiser.month_over_month_change_percent ?? 0).toFixed(1)}%`}
                        sx={{ mt: 0.5 }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.secondary">No change data for this scope</Typography>
                    )
                  }
                />
              </Grid>
            </Grid>
          )}

          <Paper sx={{ borderRadius: 2, position: 'relative' }}>
            {detailLoading && <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, borderTopLeftRadius: 12, borderTopRightRadius: 12 }} />}
            <List>
              {merchants.map((m) => (
                <ListItemButton key={m.merchant_name} onClick={() => handleSelect(m)} sx={{ borderRadius: 2 }}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.light' }}>
                      <StorefrontIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={m.merchant_name}
                    secondary={`${m.transaction_count} transactions`}
                  />
                  {m.month_over_month_change_percent != null && (
                    <Chip
                      size="small"
                      variant="outlined"
                      icon={m.month_over_month_change_percent >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                      color={m.month_over_month_change_percent >= 0 ? 'error' : 'success'}
                      label={`${m.month_over_month_change_percent >= 0 ? '+' : ''}${m.month_over_month_change_percent.toFixed(1)}%`}
                      sx={{ mr: 2 }}
                    />
                  )}
                  <Typography variant="subtitle1" fontWeight={700} color="primary">
                    ${m.total_spent.toFixed(2)}
                  </Typography>
                </ListItemButton>
              ))}
            </List>
          </Paper>
        </>
      )}
    </motion.div>
  );
};

export default MerchantInsightsPage;
