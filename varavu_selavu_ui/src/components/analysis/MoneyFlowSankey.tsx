import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { glassCardSx, withAlpha } from '../../theme';
import { baseChartConfig, categoryPalette, chartTextColor } from '../../utils/chartTheme';

/**
 * TS-DES-105 — "Where the money goes" Sankey flow (Design Spec §4.3's signature analytical view:
 * income/spend → categories → merchants). Web-only by design: Design Spec §4.3 / TS-DES-105
 * explicitly rules out a mobile Sankey as illegible on a phone; mobile keeps the ranked spectrum
 * as its only category view instead. This lives on `ExpenseAnalysisPage` specifically, per the
 * ticket's scope.
 */

interface ExpenseDetail {
  date: string;
  description: string;
  category: string;
  cost: number;
}

interface Props {
  totalExpenses: number;
  categoryTotals: { category: string; total: number }[];
  details?: Record<string, ExpenseDetail[]>;
  /** How many top merchants/descriptions to break each category into before folding the rest into "Other". */
  topMerchantsPerCategory?: number;
}

const ROOT_LABEL = 'Total Spend';

const MoneyFlowSankey: React.FC<Props> = ({
  totalExpenses,
  categoryTotals,
  details = {},
  topMerchantsPerCategory = 3,
}) => {
  const theme = useTheme();
  const mode = theme.palette.mode;

  const sankey = useMemo(() => {
    const labels: string[] = [ROOT_LABEL];
    const nodeColors: string[] = [chartTextColor(mode)];
    const source: number[] = [];
    const target: number[] = [];
    const value: number[] = [];
    const linkColors: string[] = [];
    const palette = categoryPalette(mode);

    const sorted = [...categoryTotals].filter(c => c.total > 0).sort((a, b) => b.total - a.total);

    sorted.forEach((cat, catIdx) => {
      const catColor = palette[catIdx % palette.length];
      const catNodeIdx = labels.length;
      labels.push(cat.category);
      nodeColors.push(catColor);
      source.push(0);
      target.push(catNodeIdx);
      value.push(cat.total);
      linkColors.push(withAlpha(catColor, 0.35));

      // Fan out into top merchants/descriptions within this category, folding the remainder into "Other".
      const items = details[cat.category] || [];
      if (items.length > 0) {
        const byMerchant = new Map<string, number>();
        items.forEach(it => {
          const key = it.description || 'Other';
          byMerchant.set(key, (byMerchant.get(key) || 0) + it.cost);
        });
        const merchantEntries = [...byMerchant.entries()].sort((a, b) => b[1] - a[1]);
        const top = merchantEntries.slice(0, topMerchantsPerCategory);
        const restTotal = merchantEntries.slice(topMerchantsPerCategory).reduce((s, [, v]) => s + v, 0);

        top.forEach(([merchant, amount]) => {
          const merchantNodeIdx = labels.length;
          labels.push(merchant);
          nodeColors.push(withAlpha(catColor, 0.7));
          source.push(catNodeIdx);
          target.push(merchantNodeIdx);
          value.push(amount);
          linkColors.push(withAlpha(catColor, 0.2));
        });

        if (restTotal > 0) {
          const otherNodeIdx = labels.length;
          labels.push(`${cat.category} — Other`);
          nodeColors.push(withAlpha(catColor, 0.7));
          source.push(catNodeIdx);
          target.push(otherNodeIdx);
          value.push(restTotal);
          linkColors.push(withAlpha(catColor, 0.2));
        }
      }
    });

    return { labels, nodeColors, source, target, value, linkColors };
  }, [categoryTotals, details, mode, topMerchantsPerCategory]);

  const hasData = sankey.value.length > 0 && totalExpenses > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card sx={{ ...glassCardSx(theme), animation: 'fadeIn 0.5s ease' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Where the Money Goes</Typography>
          {!hasData ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Not enough data yet to draw the flow — add a few expenses to see it fill in.
              </Typography>
            </Box>
          ) : (
            <Plot
              data={[
                {
                  type: 'sankey',
                  orientation: 'h',
                  arrangement: 'snap',
                  node: {
                    label: sankey.labels,
                    color: sankey.nodeColors,
                    pad: 14,
                    thickness: 14,
                    line: { color: chartTextColor(mode), width: 0.5 },
                  },
                  link: {
                    source: sankey.source,
                    target: sankey.target,
                    value: sankey.value,
                    color: sankey.linkColors,
                  },
                  textfont: { family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', color: chartTextColor(mode), size: 12 },
                  hovertemplate: '<b>%{source.label} → %{target.label}</b><br>$%{value:,.2f}<extra></extra>',
                } as any,
              ]}
              layout={{
                font: { family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', color: chartTextColor(mode), size: 12 },
                margin: { l: 8, r: 8, t: 10, b: 10 },
                height: 420,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
              }}
              config={baseChartConfig}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
            />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default MoneyFlowSankey;
