import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { listRecurringTemplates, RecurringTemplateDTO } from '../../api/recurring';
import { formatAppDate } from '../../utils/date';

const daysAhead = 14;

function nextOccurrence(t: RecurringTemplateDTO, from = new Date()): Date | null {
  const start = new Date(t.start_date_iso);
  // Find next occurrence based on day_of_month
  const d = new Date(from);
  let candidate = new Date(d.getFullYear(), d.getMonth(), t.day_of_month);
  if (candidate < from) {
    candidate = new Date(d.getFullYear(), d.getMonth() + 1, t.day_of_month);
  }
  if (candidate < start) return start;
  return candidate;
}

const UpcomingRecurringCard: React.FC = () => {
  const [items, setItems] = React.useState<{ date: string; description: string; category: string; amount: number }[]>([]);

  React.useEffect(() => {
    (async () => {
      try {
        const templates = await listRecurringTemplates();
        const now = new Date();
        const end = new Date(now);
        end.setDate(end.getDate() + daysAhead);
        const upcoming = templates
          .map(t => ({ t, dt: nextOccurrence(t, now) }))
          .filter(x => x.dt && x.dt >= now && x.dt <= end)
          .sort((a,b) => (a.dt!.getTime() - b.dt!.getTime()))
          .map(x => ({
            date: x!.dt!.toISOString().slice(0,10),
            description: x.t.description,
            category: x.t.category,
            amount: x.t.default_cost,
          }));
        setItems(upcoming);
      } catch {
        // ignore
      }
    })();
  }, []);

  return (
    <Card
      sx={{
        backdropFilter: 'blur(8px)',
        background: 'linear-gradient(135deg, rgba(255,250,245,0.9) 0%, rgba(255,240,230,0.9) 100%)',
        border: '1px solid rgba(255,255,255,0.4)',
        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.5)',
        borderRadius: 3,
        animation: 'fadeIn 0.5s ease',
      }}
    >
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Upcoming Recurring (next {daysAhead} days)
        </Typography>
        {items.length === 0 ? (
          <Typography color="text.secondary">Nothing due soon.</Typography>
        ) : (
          <List dense>
            {items.map((it, idx) => (
              <ListItem key={`${it.date}-${idx}`} disableGutters>
                <ListItemText
                  primary={`${it.description} • $${it.amount.toFixed(2)}`}
                  secondary={`${formatAppDate(it.date)} • ${it.category}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </CardContent>
    </Card>
  );
};

export default UpcomingRecurringCard;
