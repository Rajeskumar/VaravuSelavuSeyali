import React from 'react';
import Plot from 'react-plotly.js';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import { useTheme } from '@mui/material/styles';

interface Props {
  categoryTotals: { category: string; total: number }[];
}

const TopCategoriesChart: React.FC<Props> = ({ categoryTotals }) => {
  const theme = useTheme();
  const top = categoryTotals.slice(0, 6);
  const x = top.map(c => c.category);
  const y = top.map(c => c.total);
  const colors = [theme.palette.primary.main, theme.palette.secondary.main, '#F59E0B', '#EF4444', '#10B981', '#6366F1'];
  const data = [
    {
      x,
      y,
      type: 'bar' as const,
      text: y.map(v => v.toFixed(0)),
      textposition: 'outside' as const,
      marker: { color: x.map((_, i) => colors[i % colors.length]) },
    },
  ];

  const layout = {
    title: '🔝 Top 5 Expense Categories',
    xaxis: { title: 'Category' },
    yaxis: { title: 'Cost' },
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Plot data={data} layout={layout} style={{ width: '100%', minWidth: 280, maxWidth: '100%', height: 350 }} />
      </CardContent>
    </Card>
  );
};

export default TopCategoriesChart;
