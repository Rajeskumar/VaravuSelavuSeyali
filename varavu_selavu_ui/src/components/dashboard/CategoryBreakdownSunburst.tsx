import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';
import Plot from 'react-plotly.js';
import CategoryDetailsDrawer, { ExpenseItem } from '../common/CategoryDetailsDrawer';

interface CategoryTotal {
  category: string;
  total: number;
}

interface Props {
  data: CategoryTotal[];
  title?: string;
  details?: Record<string, ExpenseItem[]>; // mapping label -> items
}

const CategoryBreakdownSunburst: React.FC<Props> = ({ data, title = 'Category Breakdown', details }) => {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  const labels = ['Total', ...data.map(d => d.category)];
  const parents = ['', ...data.map(() => 'Total')];
  const values = [total, ...data.map(d => d.total)];
  const [open, setOpen] = React.useState(false);
  const [currentLabel, setCurrentLabel] = React.useState<string>('');
  const items = currentLabel && details ? (details[currentLabel] || []) : [];
  return (
    <Card
      sx={{
        backdropFilter: 'blur(8px)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.65) 0%, rgba(240,248,255,0.65) 100%)',
        border: '1px solid rgba(255,255,255,0.35)',
        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
        borderRadius: 3,
        animation: 'fadeIn 0.5s ease'
      }}
    >
      <CardContent>
        <Typography variant="h6" gutterBottom>{title}</Typography>
        <Plot
          data={[
            {
              type: 'sunburst',
              labels,
              parents,
              values,
              branchvalues: 'total',
              maxdepth: 2,
              hovertemplate: '<b>%{label}</b><br>$%{value:,.2f} (%{percentParent:.1%})<br><i>Click to view items</i><extra></extra>',
              insidetextorientation: 'radial',
              textinfo: 'label+percent parent',
              marker: { line: { width: 2, color: 'rgba(255,255,255,0.9)' } },
              leaf: { opacity: 0.95 }
            } as any
          ]}
          layout={{
            margin: { l: 0, r: 0, t: 0, b: 0 },
            height: 520,
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            sunburstcolorway: ['#6C5CE7', '#00CEC9', '#FF7675', '#FDCB6E', '#55EFC4', '#74B9FF', '#A29BFE', '#FAB1A0'],
            extendsunburstcolors: true,
            uniformtext: { minsize: 12, mode: 'hide' }
          }}
          onClick={(evt: any) => {
            const p = evt?.points?.[0];
            const label = p?.label as string;
            if (!label || label === 'Total') return;
            if (details && (details[label]?.length ?? 0) >= 0) {
              setCurrentLabel(label);
              setOpen(true);
            }
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
        />
        <CategoryDetailsDrawer
          open={open}
          title={`${title}: ${currentLabel}`}
          items={items}
          onClose={() => setOpen(false)}
        />
      </CardContent>
    </Card>
  );
};

export default CategoryBreakdownSunburst;
