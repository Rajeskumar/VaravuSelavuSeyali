import React from 'react';
import Plot from 'react-plotly.js';

interface Props {
  categoryTotals: { category: string; total: number }[];
}

const CategoryBarChart: React.FC<Props> = ({ categoryTotals }) => {
  const x = categoryTotals.map(c => c.category);
  const y = categoryTotals.map(c => c.total);
  const palette = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'];
  const colors = x.map((_, idx) => palette[idx % palette.length]);
  const data = [
    {
      x,
      y,
      type: 'bar' as const,
      marker: { color: colors },
      text: y,
      textposition: 'outside' as const,
    },
  ];
  const layout = {
    title: '📊 Categorywise Spend',
    xaxis: { title: 'Category' },
    yaxis: { title: 'Amount ($)' },
    autosize: true,
    margin: { t: 40, l: 40, r: 10, b: 40 },
  };
  return (
    <Plot
      data={data}
      layout={layout}
      style={{ width: '100%', height: 400 }}
      useResizeHandler
      config={{ displayModeBar: false }}
    />
  );
};

export default CategoryBarChart;
