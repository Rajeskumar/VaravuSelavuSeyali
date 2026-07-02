import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import Plot from 'react-plotly.js';
import { glassCardSx } from '../../theme';

interface Props {
  data: { month: string; total: number }[];
}

// Simple responsive bar/area chart for last 12 months spend
const SpendTrendChart: React.FC<Props> = ({ data }) => {
  const months = data.map(d => d.month);
  const totals = data.map(d => d.total);
  const theme = useTheme();
  return (
    <Card
      sx={{
        ...glassCardSx(theme),
        height: '100%',
        animation: 'fadeIn 0.5s ease',
      }}
    >
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Spend Trend (last 12 months)
        </Typography>
        <Plot
          data={[
            {
              x: months,
              y: totals,
              type: 'scatter',
              mode: 'lines+markers',
              fill: 'tozeroy',
              marker: { color: theme.palette.primary.main },
              line: { color: theme.palette.primary.main },
            },
          ]}
          layout={{
            autosize: true,
            height: 260,
            margin: { l: 32, r: 8, t: 10, b: 32 },
            xaxis: { type: 'category', tickangle: -30 },
            yaxis: { zeroline: false, gridcolor: 'rgba(0,0,0,0.05)' },
            showlegend: false,
          }}
          useResizeHandler
          style={{ width: '100%', height: '100%' }}
          config={{ displayModeBar: false, responsive: true }}
        />
      </CardContent>
    </Card>
  );
};

export default SpendTrendChart;
