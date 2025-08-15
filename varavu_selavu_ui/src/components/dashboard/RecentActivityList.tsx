import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import Avatar from '@mui/material/Avatar';
import ListItemText from '@mui/material/ListItemText';

interface Activity {
  date: string;
  description: string;
  category: string;
  cost: number;
}

interface Props {
  items: Activity[];
}

const RecentActivityList: React.FC<Props> = ({ items }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Typography variant="h6" gutterBottom>
        Recent Activity
      </Typography>
      <List dense>
        {items.map(item => (
          <ListItem key={`${item.date}-${item.description}`}
            secondaryAction={
              <Typography variant="body2">${item.cost.toFixed(2)}</Typography>
            }
          >
            <ListItemAvatar>
              <Avatar>{item.category.charAt(0)}</Avatar>
            </ListItemAvatar>
            <ListItemText primary={item.description} secondary={new Date(item.date).toLocaleDateString()} />
          </ListItem>
        ))}
        {items.length === 0 && (
          <Typography color="text.secondary">No recent transactions</Typography>
        )}
      </List>
    </CardContent>
  </Card>
);

export default RecentActivityList;
