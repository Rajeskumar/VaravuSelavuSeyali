import React from 'react';
import Plot from 'react-plotly.js';

interface Props {
  categoryTotals: { category: string; total: number }[];
}

const TopCategoriesChart: React.FC<Props> = ({ categoryTotals }) => {
  const top = categoryTotals.slice(0, 6);
  const x = top.map(c => c.category);
  const y = top.map(c => c.total);
  const data = [
    {
      x,
      y,
      type: 'bar' as const,
      text: y.map(v => v.toFixed(0)),
      textposition: 'outside' as const,
      marker: { color: 'orange' },
    },
  ];

  const layout = {
    title: '🔝 Top 5 Expense Categories',
    xaxis: { title: 'Category' },
    yaxis: { title: 'Cost' },
  };

  return <Plot data={data} layout={layout} style={{ width: '100%', minWidth: 280, maxWidth: '100vw', height: 350 }} />;
};

export default TopCategoriesChart;
