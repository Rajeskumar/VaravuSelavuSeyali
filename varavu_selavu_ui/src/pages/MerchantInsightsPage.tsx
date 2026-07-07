import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Chip, IconButton, LinearProgress, Button, Skeleton, Grid, useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import StorefrontIcon from '@mui/icons-material/StorefrontRounded';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeRounded';
import ChevronRightIcon from '@mui/icons-material/ChevronRightRounded';
import {
  getTopMerchants, getMerchantDetail,
  MerchantInsightSummary, MerchantInsightDetail,
} from '../api/analytics';
import InsightScopeFilter, { ScopeBadge, defaultInsightScopeState, resolveScopeFilters } from '../components/common/InsightScopeFilter';
import { motion } from 'framer-motion';

// Reconcile components
import { StatBlock } from '../components/analysis/StatBlock';
import { MonthlySpendSparkline } from '../components/analysis/MonthlySpendSparkline';
import { WhatChangedCallout } from '../components/analysis/WhatChangedCallout';
import { typeScale } from '../theme';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MerchantInsightsPage: React.FC = () => {
  const theme = useTheme();
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
  }, [userId, scope.mode, scope.year, scope.month, scope.startDate, scope.endDate]);

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
      <Box sx={{ py: 4, maxWidth: 600, mx: 'auto' }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          <Skeleton width={220} />
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
    const avgPerVisit = detail.transaction_count > 0 ? detail.total_spent / detail.transaction_count : 0;
    
    // Synthesize "What Changed" callout based on MoM delta
    const mom = detail.month_over_month_change_percent;
    let whatChangedMsg = 'Your average spend per visit is steady.';
    if (mom != null) {
      if (mom > 5) {
        whatChangedMsg = `Spend here is up ${mom.toFixed(1)}% vs last period.`;
      } else if (mom < -5) {
        whatChangedMsg = `Spend here is down ${Math.abs(mom).toFixed(1)}% vs last period.`;
      } else {
        whatChangedMsg = `Roughly flat vs last period.`;
      }
    }

    const sparklineData = detail.monthly_aggregates.slice(-6).map(a => ({
      label: MONTH_NAMES[a.month - 1],
      value: a.total_spent,
    }));

    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', pb: 8 }}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
            <IconButton onClick={() => setDetail(null)} sx={{ p: 0.5, mr: 0.5, color: 'text.primary' }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 500 }}>
              Merchant Insights
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
            <Typography sx={{ ...typeScale.display, fontSize: '1.75rem', mb: 1, wordBreak: 'break-word' }}>
              {detail.merchant_name}
            </Typography>
            <Chip
              icon={<AutoAwesomeIcon sx={{ fontSize: '16px !important' }} />}
              label="Ask AI"
              onClick={() => askAi(`Tell me about my spending at ${detail.merchant_name} — trends and how it compares to my other merchants.`)}
              clickable
              color="primary"
              variant="outlined"
              size="small"
              sx={{ fontWeight: 600, flexShrink: 0 }}
            />
          </Box>

          {/* KPI Row */}
          <Box sx={{ display: 'flex', gap: 2, mb: 4, flexWrap: 'wrap' }}>
            <StatBlock label="Lifetime Spent" value={`$${detail.total_spent.toFixed(2)}`} />
            <StatBlock label="Visits" value={detail.transaction_count} />
            <StatBlock label="Avg / visit" value={`$${avgPerVisit.toFixed(2)}`} />
          </Box>

          {/* Monthly Spend Sparkline */}
          {sparklineData.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography sx={{ ...typeScale.label, color: 'text.secondary', mb: 1.5 }}>
                MONTHLY SPEND
              </Typography>
              <MonthlySpendSparkline data={sparklineData} />
            </Box>
          )}

          {/* What Changed Callout */}
          <Box sx={{ mb: 4 }}>
            <WhatChangedCallout message={whatChangedMsg} />
          </Box>

          {/* Yearly Rollup (Keep historical data accessible) */}
          {yearlyRollup.length > 1 && (
            <Box sx={{ mb: 4 }}>
               <Typography sx={{ ...typeScale.label, color: 'text.secondary', mb: 1.5 }}>
                YEARLY SUMMARY
               </Typography>
               <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                 {yearlyRollup.map((y) => (
                   <Box key={y.year}>
                     <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 0.5 }}>{y.year}</Typography>
                     <Typography sx={{ ...typeScale.amount, color: 'text.primary' }}>${y.total_spent.toFixed(2)}</Typography>
                   </Box>
                 ))}
               </Box>
            </Box>
          )}

          {/* Items Bought Here */}
          {detail.items_bought.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography sx={{ ...typeScale.label, color: 'text.secondary', mb: 1.5 }}>
                WHAT YOU BUY HERE
              </Typography>
              <Box
                sx={{
                  backgroundColor: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 2.5,
                  overflow: 'hidden',
                }}
              >
                {detail.items_bought.map((item, i) => (
                  <Box
                    key={item.item_name}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 2,
                      py: 1.5,
                      borderBottom: i < detail.items_bought.length - 1 ? `1px solid ${theme.palette.divider}` : 'none',
                    }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1, mr: 2 }}>
                       <Typography sx={{ fontFamily: 'Inter', fontSize: 14, color: 'text.primary', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                         {item.item_name}
                       </Typography>
                       <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                         {item.purchase_count} purchases
                       </Typography>
                    </Box>
                    <Typography
                      sx={{
                        ...typeScale.amount,
                        fontSize: 14,
                        color: 'text.primary',
                        textAlign: 'right'
                      }}
                    >
                      ${(item.avg_price ?? 0).toFixed(2)} avg
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </motion.div>
      </Box>
    );
  }

  // List view
  // Sort descending by total_spent
  const listRows = [...merchants].sort((a, b) => (b.total_spent ?? 0) - (a.total_spent ?? 0));

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', pb: 8 }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 2 }}>
          <Typography sx={{ ...typeScale.display, fontSize: '1.75rem', display: 'flex', alignItems: 'center', gap: 1 }}>
            Merchant Insights
          </Typography>
          <InsightScopeFilter value={scope} onChange={setScope} />
        </Box>
        <Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 3 }}>
          Where your money goes, by place
        </Typography>

        {listRows.length === 0 ? (
          <Paper sx={{ p: 6, mt: 4, borderRadius: 2, textAlign: 'center', bgcolor: 'transparent', borderStyle: 'dashed' }}>
            <StorefrontIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" fontWeight={600} gutterBottom>
              No merchant insights yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Add expenses with a merchant name to see spending patterns, trends, and comparisons here.
            </Typography>
            <Button variant="contained" onClick={() => navigate('/expenses')}>
              Add an Expense
            </Button>
          </Paper>
        ) : (
          <Box sx={{ position: 'relative' }}>
            {detailLoading && <LinearProgress sx={{ position: 'absolute', top: -4, left: 0, right: 0, borderRadius: 2 }} />}
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {listRows.map((row) => (
                <Box
                  key={row.merchant_name}
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
                      {row.merchant_name}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                      {row.transaction_count ?? 0} visits
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

export default MerchantInsightsPage;
