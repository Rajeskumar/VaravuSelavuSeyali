import React from 'react';
import Plot from 'react-plotly.js';

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
  return <Plot data={data} layout={layout} style={{ width: '100%', height: 350 }} />;
};

export default LastSixMonthsLineChart;
