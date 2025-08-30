import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';
import Plot from 'react-plotly.js';

interface CategoryTotal {
  category: string;
  total: number;
}

interface Props {
  data: CategoryTotal[];
}

const CategoryBreakdownSunburst: React.FC<Props> = ({ data }) => {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  const labels = ['Total', ...data.map(d => d.category)];
  const parents = ['', ...data.map(() => 'Total')];
  const values = [total, ...data.map(d => d.total)];
  return (
    <Card
      sx={{
        height: '100%',
        backdropFilter: 'blur(6px)',
        background: 'rgba(255,255,255,0.4)',
        border: '1px solid rgba(255,255,255,0.2)',
        animation: 'fadeIn 0.5s ease'
      }}
    >
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Category Breakdown
        </Typography>
        <Plot
          data={[{ type: 'sunburst', labels, parents, values, branchvalues: 'total' }]}
          layout={{ margin: { l: 0, r: 0, t: 0, b: 0 }, height: 400 }}
          style={{ width: '100%' }}
        />
      </CardContent>
    </Card>
  );
};

export default CategoryBreakdownSunburst;
