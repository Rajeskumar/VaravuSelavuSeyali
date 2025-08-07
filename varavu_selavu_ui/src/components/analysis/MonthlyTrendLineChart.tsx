import React from 'react';
import Plot from 'react-plotly.js';

const MonthlyTrendLineChart: React.FC = () => {
  const data = [
    {
      x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
      y: [1000, 1200, 900, 1100, 950, 1050, 1150, 1200],
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
