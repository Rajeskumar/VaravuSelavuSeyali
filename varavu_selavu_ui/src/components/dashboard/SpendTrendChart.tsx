import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Plot from 'react-plotly.js';

interface Props {
  data: { month: string; total: number }[];
}

// Simple responsive bar/area chart for last 12 months spend
const SpendTrendChart: React.FC<Props> = ({ data }) => {
  const months = data.map(d => d.month);
  const totals = data.map(d => d.total);
  return (
    <Card
      sx={{
        height: '100%',
        backdropFilter: 'blur(8px)',
        background: 'linear-gradient(135deg, rgba(245,248,255,0.9) 0%, rgba(232,244,255,0.9) 100%)',
        border: '1px solid rgba(255,255,255,0.4)',
        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.5)',
        borderRadius: 3,
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
              marker: { color: '#4F46E5' },
              line: { color: '#4F46E5' },
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
