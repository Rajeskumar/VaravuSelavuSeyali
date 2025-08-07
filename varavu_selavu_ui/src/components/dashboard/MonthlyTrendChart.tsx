import React from 'react';
import Plot from 'react-plotly.js';

const MonthlyTrendChart: React.FC = () => {
  const data = [
    {
      x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      y: [150, 230, 180, 210, 280, 300],
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
