import React from 'react';
import Plot from 'react-plotly.js';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { baseChartLayout, baseChartConfig, categoryPalette } from '../../utils/chartTheme';

interface Props {
  categoryTotals: { category: string; total: number }[];
}

const TopCategoriesChart: React.FC<Props> = ({ categoryTotals }) => {
  const theme = useTheme();
  const top = categoryTotals.slice(0, 6);
  const x = top.map(c => c.category);
  const y = top.map(c => c.total);
  const colors = categoryPalette(theme.palette.mode);
  const data = [
    {
      x,
      y,
      type: 'bar' as const,
      text: y.map(v => v.toFixed(0)),
      textposition: 'outside' as const,
      marker: { color: x.map((_, i) => colors[i % colors.length]) },
    },
  ];

  const base = baseChartLayout(theme.palette.mode);
  const layout = {
    ...base,
    xaxis: { ...base.xaxis, title: { text: 'Category' } },
    yaxis: { ...base.yaxis, title: { text: 'Cost' } },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{ height: '100%' }}
    >
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Top Expense Categories</Typography>
          <Plot data={data} layout={layout} style={{ width: '100%', minWidth: 280, maxWidth: '100%', height: 350 }} config={baseChartConfig} />
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default TopCategoriesChart;
