import React, { useMemo, useState } from 'react';
import { Box, Grid, Paper, Typography, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import AIAnalystChat from '../components/ai-analyst/AIAnalystChat';

const AIAnalystPage: React.FC = () => {
  const now = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState<'currentYear' | 'last3Years' | 'last3Months' | 'last6Months' | 'specific'>('currentYear');
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);

  const formatDate = (d: Date) => d.toISOString().slice(0,10);

  const { startDate, endDate } = useMemo(() => {
    let start = new Date(now);
    let end = new Date(now);
    switch(period){
      case 'currentYear':
        start = new Date(now.getFullYear(),0,1);
        break;
      case 'last3Years':
        start = new Date(now.getFullYear()-2,0,1);
        break;
      case 'last3Months':
        start = new Date(now.getFullYear(), now.getMonth()-2,1);
        break;
      case 'last6Months':
        start = new Date(now.getFullYear(), now.getMonth()-5,1);
        break;
      case 'specific':
        start = new Date(year, month-1,1);
        end = new Date(year, month,0);
        break;
    }
    return { startDate: formatDate(start), endDate: formatDate(end) };
  }, [period, year, month, now]);

  const user = typeof window !== 'undefined' ? localStorage.getItem('vs_user') : null;
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <Box sx={{ mt:4 }}>
      <Grid container columns={12} spacing={2}>
        <Grid size={{ xs:12, md:3 }}>
          <Paper elevation={3} sx={{ p:2, position:{ md:'sticky' }, top:{ md:80 }, mb:{ xs:2, md:0 } }}>
            <Typography variant="h6" sx={{ mb:2 }}>AI Analyst Range</Typography>
            <FormControl fullWidth size="small" sx={{ mb:2 }}>
              <InputLabel id="period-label">Period</InputLabel>
              <Select labelId="period-label" value={period} label="Period" onChange={e => setPeriod(e.target.value as any)}>
                <MenuItem value="currentYear">Current Year</MenuItem>
                <MenuItem value="last3Years">Last 3 Years</MenuItem>
                <MenuItem value="last3Months">Last 3 Months</MenuItem>
                <MenuItem value="last6Months">Last 6 Months</MenuItem>
                <MenuItem value="specific">Specific Month</MenuItem>
              </Select>
            </FormControl>
            {period === 'specific' && (
              <>
                <FormControl fullWidth size="small" sx={{ mb:2 }}>
                  <InputLabel id="year-label">Year</InputLabel>
                  <Select labelId="year-label" value={year} label="Year" onChange={e => setYear(Number(e.target.value))}>
                    {[0,1,2,3,4].map(i => {
                      const y = now.getFullYear()-i;
                      return <MenuItem key={y} value={y}>{y}</MenuItem>;
                    })}
                  </Select>
                </FormControl>
                <FormControl fullWidth size="small">
                  <InputLabel id="month-label">Month</InputLabel>
                  <Select labelId="month-label" value={month} label="Month" onChange={e => setMonth(Number(e.target.value))}>
                    {monthNames.map((m,idx) => (
                      <MenuItem key={m} value={idx+1}>{m}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </>
            )}
          </Paper>
        </Grid>
        <Grid size={{ xs:12, md:9 }}>
          <Paper elevation={2} sx={{ p:2 }}>
            <AIAnalystChat userId={user} startDate={startDate} endDate={endDate} />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AIAnalystPage;
