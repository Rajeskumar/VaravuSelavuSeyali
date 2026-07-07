import React from 'react';
import Plot from 'react-plotly.js';
import { motion } from 'framer-motion';
import { useTheme } from '@mui/material/styles';
import { baseChartLayout, baseChartConfig, categoryPalette } from '../../utils/chartTheme';

interface Props {
  monthlyTrend: { month: string; total: number }[];
}

const MonthlyTrendLineChart: React.FC<Props> = ({ monthlyTrend }) => {
  const theme = useTheme();
  const x = monthlyTrend.map(m => m.month);
  const y = monthlyTrend.map(m => m.total);
  const primary = categoryPalette(theme.palette.mode)[0];
  const data = [
    {
      x,
      y,
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      marker: { color: primary },
      line: { color: primary },
      name: 'Total Expense',
    },
  ];
  const base = baseChartLayout(theme.palette.mode);
  const layout = {
    ...base,
    xaxis: { ...base.xaxis, title: { text: 'Month' } },
    yaxis: { ...base.yaxis, title: { text: 'Total Expense ($)' } },
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Plot data={data} layout={layout} style={{ width: '100%', minWidth: 280, maxWidth: '100vw', height: 350 }} config={baseChartConfig} />
    </motion.div>
  );
};

export default MonthlyTrendLineChart;
