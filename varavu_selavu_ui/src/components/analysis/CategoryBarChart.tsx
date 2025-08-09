import React from 'react';
import Plot from 'react-plotly.js';

interface Props {
  categoryTotals: { category: string; total: number }[];
}

const CategoryBarChart: React.FC<Props> = ({ categoryTotals }) => {
  const x = categoryTotals.map(c => c.category);
  const y = categoryTotals.map(c => c.total);
  const data = [
    {
      x,
      y,
      type: 'bar' as const,
      marker: { color: 'orange' },
      text: y,
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
