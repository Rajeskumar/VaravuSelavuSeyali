import React from 'react';
import Plot from 'react-plotly.js';

const LastSixMonthsLineChart: React.FC = () => {
  const data = [
    {
      x: ['2024-03', '2024-04', '2024-05', '2024-06', '2024-07', '2024-08'],
      y: [800, 900, 850, 950, 1000, 1100],
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      marker: { color: 'blue' },
      name: 'Food',
    },
    {
      x: ['2024-03', '2024-04', '2024-05', '2024-06', '2024-07', '2024-08'],
      y: [400, 420, 410, 430, 450, 480],
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      marker: { color: 'orange' },
      name: 'Transport',
    },
  ];
  const layout = {
    title: '📆 Last 6 Months Expense by Category',
    xaxis: { title: 'Month' },
    yaxis: { title: 'Expense ($)' },
  };
  return <Plot data={data} layout={layout} style={{ width: '100%', height: 350 }} />;
};

export default LastSixMonthsLineChart;
