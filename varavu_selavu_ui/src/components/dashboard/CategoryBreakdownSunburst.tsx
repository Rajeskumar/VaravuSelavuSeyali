import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Plot from 'react-plotly.js';
import { motion } from 'framer-motion';
import CategoryDetailsDrawer, { ExpenseItem } from '../common/CategoryDetailsDrawer';
import { glassCardSx } from '../../theme';

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
  const theme = useTheme();
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
    <Card
      sx={{
        ...glassCardSx(theme),
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
    </motion.div>
  );
};

export default CategoryBreakdownSunburst;
