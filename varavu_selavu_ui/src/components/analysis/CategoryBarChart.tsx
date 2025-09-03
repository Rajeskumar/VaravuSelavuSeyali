import React from 'react';
import Plot from 'react-plotly.js';
import CategoryDetailsDrawer, { ExpenseItem } from '../common/CategoryDetailsDrawer';

interface Props {
  categoryTotals: { category: string; total: number }[];
  details?: Record<string, ExpenseItem[]>;
}

const CategoryBarChart: React.FC<Props> = ({ categoryTotals, details }) => {
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
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)'
  };
  const [open, setOpen] = React.useState(false);
  const [currentLabel, setCurrentLabel] = React.useState('');
  const items = currentLabel && details ? (details[currentLabel] || []) : [];
  return (
    <>
      <Plot
        data={data}
        layout={layout as any}
        style={{ width: '100%', height: 400 }}
        useResizeHandler
        config={{ displayModeBar: false }}
        onClick={(evt: any) => {
          const p = evt?.points?.[0];
          const label = p?.x as string;
          if (!label) return;
          if (details && (details[label]?.length ?? 0) >= 0) {
            setCurrentLabel(label);
            setOpen(true);
          }
        }}
      />
      <CategoryDetailsDrawer
        open={open}
        title={`Category: ${currentLabel}`}
        items={items}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

export default CategoryBarChart;
