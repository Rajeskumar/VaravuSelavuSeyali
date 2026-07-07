import React from 'react';
import Plot from 'react-plotly.js';
import { motion } from 'framer-motion';
import { useTheme } from '@mui/material/styles';
import CategoryDetailsDrawer, { ExpenseItem } from '../common/CategoryDetailsDrawer';
import { baseChartLayout, baseChartConfig, categoryPalette } from '../../utils/chartTheme';

interface Props {
  categoryTotals: { category: string; total: number }[];
  details?: Record<string, ExpenseItem[]>;
}

const CategoryBarChart: React.FC<Props> = ({ categoryTotals, details }) => {
  const theme = useTheme();
  const x = categoryTotals.map(c => c.category);
  const y = categoryTotals.map(c => c.total);
  const palette = categoryPalette(theme.palette.mode);
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
  const base = baseChartLayout(theme.palette.mode);
  const layout = {
    ...base,
    xaxis: { ...base.xaxis, title: { text: 'Category' } },
    yaxis: { ...base.yaxis, title: { text: 'Amount ($)' } },
    autosize: true,
    margin: { t: 20, l: 48, r: 10, b: 40 },
  };
  const [open, setOpen] = React.useState(false);
  const [currentLabel, setCurrentLabel] = React.useState('');
  const items = currentLabel && details ? (details[currentLabel] || []) : [];
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <Plot
          data={data}
          layout={layout as any}
          style={{ width: '100%', height: 400 }}
          useResizeHandler
          config={baseChartConfig}
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
      </motion.div>
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
