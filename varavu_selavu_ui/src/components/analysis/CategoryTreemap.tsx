import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { glassCardSx, withAlpha } from '../../theme';
import { chartTextColor, baseChartConfig } from '../../utils/chartTheme';
import { categoryTint } from '../expenses/categoryColors';

/**
 * Replaces `MoneyFlowSankey` — a Sankey's link count grows with every category × merchant pair,
 * so a real account with a dozen-plus categories turned it into a crowded ribbon of crossing
 * lines. A treemap allocates *area* instead of link paths: it stays legible at any category
 * count (more categories just means more, smaller tiles, never more crossings), and each tile's
 * size already *is* the "how much" answer without needing to trace a flow to a value. Colored by
 * `categoryTint` — the same category→color mapping `ExpenseFeed`'s tint dots and
 * `CategorySpectrum` use, so a category reads as the same color everywhere in the app.
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

const ROOT_ID = 'root';

const CategoryTreemap: React.FC<Props> = ({
  totalExpenses,
  categoryTotals,
  details = {},
  topMerchantsPerCategory = 6,
}) => {
  const theme = useTheme();
  const mode = theme.palette.mode;

  const treemap = useMemo(() => {
    const ids: string[] = [];
    const labels: string[] = [];
    const parents: string[] = [];
    const values: number[] = [];
    const colors: string[] = [];

    const sorted = [...categoryTotals].filter((c) => c.total > 0).sort((a, b) => b.total - a.total);

    sorted.forEach((cat) => {
      const catColor = categoryTint(cat.category);
      const catId = `cat::${cat.category}`;
      ids.push(catId);
      labels.push(cat.category);
      parents.push(ROOT_ID);
      values.push(cat.total);
      colors.push(catColor);

      const items = details[cat.category] || [];
      if (items.length > 0) {
        const byMerchant = new Map<string, number>();
        items.forEach((it) => {
          const key = it.description || 'Other';
          byMerchant.set(key, (byMerchant.get(key) || 0) + it.cost);
        });
        const merchantEntries = [...byMerchant.entries()].sort((a, b) => b[1] - a[1]);
        const top = merchantEntries.slice(0, topMerchantsPerCategory);
        const restTotal = merchantEntries.slice(topMerchantsPerCategory).reduce((s, [, v]) => s + v, 0);

        top.forEach(([merchant, amount]) => {
          ids.push(`${catId}::${merchant}`);
          labels.push(merchant);
          parents.push(catId);
          values.push(amount);
          colors.push(withAlpha(catColor, 0.6));
        });

        if (restTotal > 0) {
          ids.push(`${catId}::other`);
          labels.push('Other');
          parents.push(catId);
          values.push(restTotal);
          colors.push(withAlpha(catColor, 0.6));
        }
      }
    });

    return { ids, labels, parents, values, colors };
  }, [categoryTotals, details, topMerchantsPerCategory]);

  const hasData = treemap.values.length > 0 && totalExpenses > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card sx={{ ...glassCardSx(theme) }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Where the Money Goes</Typography>
          {!hasData ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Not enough data yet — add a few expenses to see it fill in.
              </Typography>
            </Box>
          ) : (
            <Plot
              data={[
                {
                  type: 'treemap',
                  ids: treemap.ids,
                  labels: treemap.labels,
                  parents: treemap.parents,
                  values: treemap.values,
                  branchvalues: 'total',
                  marker: { colors: treemap.colors, line: { color: theme.palette.background.paper, width: 2 } },
                  textinfo: 'label+value',
                  texttemplate: '%{label}<br>$%{value:,.2f}',
                  textfont: { family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', color: '#fff', size: 12 },
                  hovertemplate: '<b>%{label}</b><br>$%{value:,.2f}<extra></extra>',
                  pathbar: { visible: true, textfont: { family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', color: chartTextColor(mode), size: 12 } },
                } as any,
              ]}
              layout={{
                font: { family: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif', color: chartTextColor(mode), size: 12 },
                margin: { l: 4, r: 4, t: 32, b: 4 },
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

export default CategoryTreemap;
