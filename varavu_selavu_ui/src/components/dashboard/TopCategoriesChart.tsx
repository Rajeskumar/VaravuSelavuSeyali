import React from 'react';
import Plot from 'react-plotly.js';

const TopCategoriesChart: React.FC = () => {
  const data = [
    {
      x: ['Food', 'Transport', 'Shopping', 'Utilities', 'Entertainment'],
      y: [450, 250, 200, 150, 100],
      type: 'bar' as const,
      text: ['450', '250', '200', '150', '100'].map(String),
      textposition: 'outside' as const,
      marker: { color: 'orange' },
    },
  ];

  const layout = {
    title: '🔝 Top 5 Expense Categories',
    xaxis: { title: 'Category' },
    yaxis: { title: 'Cost' },
  };

  return <Plot data={data} layout={layout} style={{ width: '100%', height: '100%' }} />;
};

export default TopCategoriesChart;
