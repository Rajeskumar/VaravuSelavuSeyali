import React from 'react';
import Plot from 'react-plotly.js';

interface Props {
  monthlyTrend: { month: string; total: number }[];
}

const MonthlyTrendLineChart: React.FC<Props> = ({ monthlyTrend }) => {
  const x = monthlyTrend.map(m => m.month);
  const y = monthlyTrend.map(m => m.total);
  const data = [
    {
      x,
      y,
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      marker: { color: 'green' },
      name: 'Total Expense',
    },
  ];
  const layout = {
    title: '📅 Monthly Expense Trend',
    xaxis: { title: 'Month' },
    yaxis: { title: 'Total Expense ($)' },
  };
  return <Plot data={data} layout={layout} style={{ width: '100%', height: 350 }} />;
};

export default MonthlyTrendLineChart;
