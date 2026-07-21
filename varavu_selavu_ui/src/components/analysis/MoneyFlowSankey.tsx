import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { glassCardSx, withAlpha } from '../../theme';
import { chartTextColor, baseChartConfig } from '../../utils/chartTheme';
import { categoryTint } from '../expenses/categoryColors';

/**
 * "1b" from the Money Goes Alternatives design exploration
 * (claude.ai/design/p/2c4a99cb-45f7-4ea1-b06c-09af0c9257ee) — total → category → expense flow.
 * Built on Plotly's native `sankey` trace rather than hand-rolled SVG (the design doc's own
 * markup draws paths/nodes by hand and overlays plain HTML divs for labels/tooltips, positioned
 * in fixed pixel coordinates that only line up at the doc's fixed card width) — Plotly already
 * solves node layout, label placement, and hover tooltips responsively, matching how
 * `CategoryTreemap` (this section's previous occupant) already leans on Plotly for the same
 * reasons instead of reimplementing that by hand.
 *
 * The category → expense fan-out uses the same top-N + "Other" fold `CategoryTreemap` uses
 * (`topMerchantsPerCategory`) rather than one leaf per expense — a real account's category ×
 * merchant pair count is exactly what turned this app's original hand-built Sankey
 * (`MoneyFlowSankey`, since removed) into a crowded ribbon of crossing lines. Two more guards on
 * top of that fan-out cap, both aimed at the same root cause — too many nodes squeezed into a
 * fixed-height chart, which is what actually reads as "crowded" (Plotly holds `node.pad` fixed
 * and just shrinks/overlaps node thickness to fit whatever height it's given):
 *  1. Categories themselves are capped at `MAX_CATEGORIES`, folding the smallest ones into an
 *     "Other categories" node — a very active account can easily have 15-20+ distinct category
 *     strings (the category field here is closer to free-form than the fixed 7-group taxonomy),
 *     and no amount of vertical space fixes 20 stacked category bands from reading as noise.
 *  2. Chart height is derived from the actual node count post-folding (capped between a sane
 *     floor and ceiling) instead of a fixed pixel value, so `node.pad` always has real room to
 *     breathe regardless of how many categories/items a given period has.
 */

interface ExpenseDetail {
  date: string;
  description: string;
  category: string;
  cost: number;
}

// Neutral gray for the folded "Other categories" bucket — deliberately not a category color
// since it isn't one category, it's a grab-bag of whatever didn't make the cut. Matches
// theme.ts's `cerebro.textSecondary` exactly, so it reads as "muted text," not a hue choice.
const OTHER_CATEGORY_COLOR = '#9AA0AF';

/** Above this many distinct categories, the smallest ones fold into a single "Other categories"
 * node rather than each getting their own band — see the file-level comment for why. */
const MAX_CATEGORIES = 8;

/** Pixel budget per node (thickness + breathing room) used to size the chart to however many
 * nodes actually end up in its busiest column, rather than squeezing a fixed height. */
const PX_PER_NODE = 30;
const MIN_HEIGHT = 360;
const MAX_HEIGHT = 900;

interface Props {
  totalExpenses: number;
  categoryTotals: { category: string; total: number }[];
  details?: Record<string, ExpenseDetail[]>;
  /** How many top merchants/descriptions to break each category into before folding the rest into "Other". */
  topMerchantsPerCategory?: number;
}

const MoneyFlowSankey: React.FC<Props> = ({
  totalExpenses,
  categoryTotals,
  details = {},
  topMerchantsPerCategory = 6,
}) => {
  const theme = useTheme();
  const mode = theme.palette.mode;

  const sankey = useMemo(() => {
    const labels: string[] = ['Total spent'];
    const nodeColors: string[] = [mode === 'dark' ? '#F0F1F5' : '#101218']; // cerebro.textPrimaryDark / textPrimary
    const sources: number[] = [];
    const targets: number[] = [];
    const values: number[] = [];
    const linkColors: string[] = [];
    let categoryNodeCount = 0;
    let itemNodeCount = 0;

    const sorted = [...categoryTotals].filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
    const TOTAL_IDX = 0;

    const visibleCats = sorted.length > MAX_CATEGORIES ? sorted.slice(0, MAX_CATEGORIES - 1) : sorted;
    const foldedCats = sorted.length > MAX_CATEGORIES ? sorted.slice(MAX_CATEGORIES - 1) : [];

    const addCategoryBranch = (catName: string, catTotal: number, catColor: string, items: ExpenseDetail[]) => {
      const catIdx = labels.length;
      labels.push(catName);
      nodeColors.push(catColor);
      sources.push(TOTAL_IDX);
      targets.push(catIdx);
      values.push(catTotal);
      linkColors.push(withAlpha(catColor, 0.35));
      categoryNodeCount += 1;

      if (items.length === 0) return;

      const byMerchant = new Map<string, number>();
      items.forEach((it) => {
        const key = it.description || 'Other';
        byMerchant.set(key, (byMerchant.get(key) || 0) + it.cost);
      });
      const merchantEntries = [...byMerchant.entries()].sort((a, b) => b[1] - a[1]);
      const top = merchantEntries.slice(0, topMerchantsPerCategory);
      const restTotal = merchantEntries.slice(topMerchantsPerCategory).reduce((s, [, v]) => s + v, 0);

      top.forEach(([merchant, amount]) => {
        const itemIdx = labels.length;
        labels.push(merchant);
        nodeColors.push(withAlpha(catColor, 0.6));
        sources.push(catIdx);
        targets.push(itemIdx);
        values.push(amount);
        linkColors.push(withAlpha(catColor, 0.22));
        itemNodeCount += 1;
      });

      if (restTotal > 0) {
        const itemIdx = labels.length;
        labels.push('Other');
        nodeColors.push(withAlpha(catColor, 0.6));
        sources.push(catIdx);
        targets.push(itemIdx);
        values.push(restTotal);
        linkColors.push(withAlpha(catColor, 0.22));
        itemNodeCount += 1;
      }
    };

    visibleCats.forEach((cat) => {
      addCategoryBranch(cat.category, cat.total, categoryTint(cat.category), details[cat.category] || []);
    });

    if (foldedCats.length > 0) {
      const otherTotal = foldedCats.reduce((s, c) => s + c.total, 0);
      const catIdx = labels.length;
      labels.push('Other categories');
      nodeColors.push(OTHER_CATEGORY_COLOR);
      sources.push(TOTAL_IDX);
      targets.push(catIdx);
      values.push(otherTotal);
      linkColors.push(withAlpha(OTHER_CATEGORY_COLOR, 0.35));
      categoryNodeCount += 1;

      // The folded categories become this branch's "items" — showing which smaller categories
      // it's made of is more useful here than drilling into their individual merchants too.
      foldedCats.forEach((cat) => {
        const itemIdx = labels.length;
        labels.push(cat.category);
        nodeColors.push(withAlpha(OTHER_CATEGORY_COLOR, 0.6));
        sources.push(catIdx);
        targets.push(itemIdx);
        values.push(cat.total);
        linkColors.push(withAlpha(OTHER_CATEGORY_COLOR, 0.22));
        itemNodeCount += 1;
      });
    }

    const busiestColumn = Math.max(categoryNodeCount, itemNodeCount, 1);
    const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, busiestColumn * PX_PER_NODE + 60));

    return { labels, nodeColors, sources, targets, values, linkColors, height };
  }, [categoryTotals, details, topMerchantsPerCategory, mode]);

  const hasData = sankey.values.length > 0 && totalExpenses > 0;

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
                  type: 'sankey',
                  orientation: 'h',
                  arrangement: 'snap',
                  node: {
                    label: sankey.labels,
                    color: sankey.nodeColors,
                    pad: 18,
                    thickness: 14,
                    line: { color: theme.palette.background.paper, width: 1 },
                    hovertemplate: '<b>%{label}</b><br>$%{value:,.2f}<extra></extra>',
                  },
                  link: {
                    source: sankey.sources,
                    target: sankey.targets,
                    value: sankey.values,
                    color: sankey.linkColors,
                    hovertemplate: '<b>%{source.label} → %{target.label}</b><br>$%{value:,.2f}<extra></extra>',
                  },
                  textfont: { family: "'Instrument Sans', -apple-system, BlinkMacSystemFont, sans-serif", color: chartTextColor(mode), size: 12 },
                } as any,
              ]}
              layout={{
                font: { family: "'Instrument Sans', -apple-system, BlinkMacSystemFont, sans-serif", color: chartTextColor(mode), size: 12 },
                margin: { l: 4, r: 4, t: 32, b: 4 },
                height: sankey.height,
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
