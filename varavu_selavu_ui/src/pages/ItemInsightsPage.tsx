import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Chip, IconButton, LinearProgress, Button, Skeleton, Grid, useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import ReceiptIcon from '@mui/icons-material/ReceiptRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import {
  getTopItems, getItemDetail,
  ItemInsightSummary, ItemInsightDetail,
} from '../api/analytics';
import InsightScopeFilter, { ScopeBadge, defaultInsightScopeState, resolveScopeFilters } from '../components/common/InsightScopeFilter';
import { motion } from 'framer-motion';

// New Reconcile components
import { StatBlock } from '../components/analysis/StatBlock';
import { StoreComparisonChips } from '../components/analysis/StoreComparisonChips';
import { PurchaseTape } from '../components/analysis/PurchaseTape';
import { PriceHistoryChart } from '../components/analysis/PriceHistoryChart';

import { typeScale } from '../theme';

type Confidence = 'Low' | 'Medium' | 'High';

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

const ItemInsightsPage: React.FC = () => {
  const theme = useTheme();
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
  }, [userId, scope.mode, scope.year, scope.month, scope.startDate, scope.endDate]);

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

  if (loading) {
    return (
      <Box sx={{ py: 4, maxWidth: 600, mx: 'auto' }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          <Skeleton width={200} />
        </Typography>
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
    const avgMonthlySpend = (detail.total_spent ?? 0) / span;
    const hasStoreComparison = (detail.store_comparison?.length ?? 0) >= 2;

    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', pb: 8 }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
            <IconButton onClick={() => setDetail(null)} sx={{ p: 0.5, mr: 0.5, color: 'text.primary' }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 500 }}>
              Item Insights
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
            <Typography sx={{ ...typeScale.display, fontSize: '1.75rem', mb: 1 }}>
              {itemLabel}
            </Typography>
            <Chip
              icon={<AutoAwesomeIcon sx={{ fontSize: '16px !important' }} />}
              label="Ask AI"
              onClick={() => askAi(`Tell me about my spending on ${itemLabel} — price trends and where I buy it cheapest.`)}
              clickable
              color="primary"
              variant="outlined"
              size="small"
              sx={{ fontWeight: 600 }}
            />
          </Box>

          {/* KPI Row */}
          <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
            <StatBlock label="Avg" value={`$${(detail.average_unit_price ?? detail.avg_unit_price ?? 0).toFixed(2)}`} />
            <StatBlock label="Lowest" value={`$${(detail.min_unit_price ?? detail.min_price ?? 0).toFixed(2)}`} color={theme.palette.success.main} />
            <StatBlock label="Highest" value={`$${(detail.max_unit_price ?? detail.max_price ?? 0).toFixed(2)}`} color={theme.palette.error.main} />
            <StatBlock label="Total Spent" value={`$${(detail.total_spent ?? 0).toFixed(2)}`} />
          </Box>

          {/* Price History Chart */}
          {detail.price_history?.length > 1 && (
            <Box sx={{ mb: 4 }}>
              <Typography sx={{ ...typeScale.label, color: 'text.secondary', mb: 1.5 }}>
                PRICE HISTORY
              </Typography>
              <PriceHistoryChart history={detail.price_history} />
            </Box>
          )}

          {/* Store Comparison */}
          <Box sx={{ mb: 4 }}>
            <Typography sx={{ ...typeScale.label, color: 'text.secondary', mb: 1.5 }}>
              WHERE YOU'VE BOUGHT THIS
            </Typography>
            {hasStoreComparison ? (
              <StoreComparisonChips stores={detail.store_comparison} />
            ) : (
              <Typography sx={{ fontSize: 13, color: 'text.secondary', fontStyle: 'italic' }}>
                Not enough data to compare stores. Buy at 2 or more places to see comparison.
              </Typography>
            )}
          </Box>

          {/* Purchase Tape */}
          {detail.price_history?.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography sx={{ ...typeScale.label, color: 'text.secondary', mb: 1.5 }}>
                PURCHASE HISTORY
              </Typography>
              <PurchaseTape history={detail.price_history} />
            </Box>
          )}
        </motion.div>
      </Box>
    );
  }

  // List view
  // Sort descending by total_spent
  const listRows = [...items].sort((a, b) => (b.total_spent ?? 0) - (a.total_spent ?? 0));

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', pb: 8 }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 2 }}>
          <Typography sx={{ ...typeScale.display, fontSize: '1.75rem', display: 'flex', alignItems: 'center', gap: 1 }}>
            Item Insights
          </Typography>
          <InsightScopeFilter value={scope} onChange={setScope} />
        </Box>
        <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 3 }}>
          What you buy, and what it costs over time
        </Typography>

        {listRows.length === 0 ? (
          <Paper sx={{ p: 6, mt: 4, borderRadius: 2, textAlign: 'center', bgcolor: 'transparent', borderStyle: 'dashed' }}>
            <ReceiptIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" fontWeight={600} gutterBottom>
              No item insights yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Upload a receipt to unlock detailed item-level insights, price tracking, and store comparisons.
            </Typography>
            <Button variant="contained" onClick={() => navigate('/expenses')}>
              Add Receipt Expense
            </Button>
          </Paper>
        ) : (
          <Box sx={{ position: 'relative' }}>
            {detailLoading && <LinearProgress sx={{ position: 'absolute', top: -4, left: 0, right: 0, borderRadius: 2 }} />}
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {listRows.map((row) => (
                <Box
                  key={row.id || row.item_name || row.normalized_name}
                  component="button"
                  onClick={() => handleSelect(row)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    py: 1.5,
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    background: 'none',
                    border: 'none',
                    borderBottomWidth: '1px',
                    borderBottomStyle: 'solid',
                    borderBottomColor: theme.palette.divider,
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    '&:hover': {
                      bgcolor: `${theme.palette.action.hover}`,
                    },
                    px: 1,
                    mx: -1,
                    borderRadius: 1,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.item_name || row.normalized_name}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                      {row.transaction_count ?? 0} purchases · avg ${(row.average_unit_price ?? row.avg_unit_price ?? 0).toFixed(2)}
                    </Typography>
                  </Box>
                  <Typography sx={{ ...typeScale.amount, color: 'text.primary' }}>
                    ${(row.total_spent ?? 0).toFixed(2)}
                  </Typography>
                  <ChevronRightIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </motion.div>
    </Box>
  );
};

export default ItemInsightsPage;
