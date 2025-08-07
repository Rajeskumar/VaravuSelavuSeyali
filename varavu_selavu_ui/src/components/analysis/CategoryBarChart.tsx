import React from 'react';
import Plot from 'react-plotly.js';

const CategoryBarChart: React.FC = () => {
  const data = [
    {
      x: ['Food', 'Transport', 'Shopping', 'Utilities', 'Entertainment'],
      y: [450, 250, 200, 150, 100],
      type: 'bar' as const,
      marker: { color: 'orange' },
      text: [450, 250, 200, 150, 100],
      textposition: 'outside' as const,
    },
  ];
  const layout = {
    title: '📊 Categorywise Spend',
    xaxis: { title: 'Category' },
    yaxis: { title: 'Amount ($)' },
  };
  return <Plot data={data} layout={layout} style={{ width: '100%', height: 350 }} />;
};

export default CategoryBarChart;
