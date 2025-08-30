import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';

interface MetricCardProps {
  label: string;
  value: string | number;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value }) => {
  return (
    <Card
      sx={{
        minWidth: 140,
        flex: 1,
        m: { xs: 0.5, md: 1 },
        width: '100%',
        maxWidth: 340,
        backdropFilter: 'blur(6px)',
        background: 'rgba(255,255,255,0.4)',
        border: '1px solid rgba(255,255,255,0.2)',
        animation: 'fadeIn 0.5s ease',
      }}
    >
      <CardContent>
        <Typography color="text.secondary" gutterBottom>
          {label}
        </Typography>
        <Typography variant="h5" component="div" fontWeight="bold">
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
};

export default MetricCard;
