import React from 'react';
import Plot from 'react-plotly.js';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { baseChartLayout, baseChartConfig } from '../../utils/chartTheme';

interface Props {
  monthlyTrend: { month: string; total: number }[];
}

const MonthlyTrendChart: React.FC<Props> = ({ monthlyTrend }) => {
  const theme = useTheme();
  const x = monthlyTrend.map(m => m.month);
  const y = monthlyTrend.map(m => m.total);
  const data = [
    {
      x,
      y,
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      marker: { color: theme.palette.primary.main },
      line: { color: theme.palette.primary.main },
    },
  ];

  const base = baseChartLayout(theme.palette.mode);
  const layout = {
    ...base,
    xaxis: { ...base.xaxis, title: { text: 'Month' } },
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
          <Typography variant="h6" gutterBottom>Monthly Expense Trends</Typography>
          <Plot data={data} layout={layout} style={{ width: '100%', minWidth: 280, maxWidth: '100%', height: 350 }} config={baseChartConfig} />
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default MonthlyTrendChart;
