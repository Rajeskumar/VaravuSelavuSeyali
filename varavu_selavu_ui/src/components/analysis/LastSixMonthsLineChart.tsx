import React from 'react';
import Plot from 'react-plotly.js';
import { motion } from 'framer-motion';

interface Props {
  monthlyTrend: { month: string; total: number }[];
}

const LastSixMonthsLineChart: React.FC<Props> = ({ monthlyTrend }) => {
  const last6 = monthlyTrend.slice(-6);
  const x = last6.map(m => m.month);
  const y = last6.map(m => m.total);
  const data = [
    {
      x,
      y,
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      marker: { color: 'blue' },
      name: 'Total Expense',
    },
  ];
  const layout = {
    title: '📆 Last 6 Months Expense',
    xaxis: { title: 'Month' },
    yaxis: { title: 'Expense ($)' },
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Plot data={data} layout={layout} style={{ width: '100%', minWidth: 280, maxWidth: '100vw', height: 350 }} />
    </motion.div>
  );
};

export default LastSixMonthsLineChart;
