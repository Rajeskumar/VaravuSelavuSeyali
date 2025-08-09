import React from 'react';
import Plot from 'react-plotly.js';

interface Props {
  monthlyTrend: { month: string; total: number }[];
}

const MonthlyTrendChart: React.FC<Props> = ({ monthlyTrend }) => {
  const x = monthlyTrend.map(m => m.month);
  const y = monthlyTrend.map(m => m.total);
  const data = [
    {
      x,
      y,
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      marker: { color: 'blue' },
    },
  ];

  const layout = {
    title: '📈 Monthly Expense Trends',
    xaxis: { title: 'Month' },
    yaxis: { title: 'Cost' },
  };

  return <Plot data={data} layout={layout} style={{ width: '100%', height: '100%' }} />;
};

export default MonthlyTrendChart;
