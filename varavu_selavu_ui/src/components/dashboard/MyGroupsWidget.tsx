import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActionArea from '@mui/material/CardActionArea';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { listGroups } from '../../api/groups';
import { glassCardSx } from '../../theme';

/** Compact dashboard card listing the user's groups + balance chip (spec §11.2).
 * Only rendered by DashboardPage once useGroupsEnabled() confirms the flag is on. */
const MyGroupsWidget: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['groups'], queryFn: listGroups });
  const groups = data || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card sx={{ ...glassCardSx(theme), animation: 'fadeIn 0.5s ease' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            My Groups
          </Typography>
          {isLoading && (
            <Typography variant="body2" color="text.secondary">
              Loading…
            </Typography>
          )}
          {!isLoading && groups.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              You're not in any groups yet.
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {groups.map((g) => {
              const balanceLabel =
                g.my_balance > 0
                  ? `+$${g.my_balance.toFixed(2)}`
                  : g.my_balance < 0
                  ? `-$${Math.abs(g.my_balance).toFixed(2)}`
                  : 'Settled';
              const balanceColor = g.my_balance > 0 ? 'success' : g.my_balance < 0 ? 'error' : 'default';
              return (
                <Card key={g.group_id} variant="outlined" sx={{ boxShadow: 'none' }}>
                  <CardActionArea onClick={() => navigate(`/groups/${g.group_id}`)}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {g.name}
                      </Typography>
                      <Chip size="small" color={balanceColor as any} label={balanceLabel} />
                    </Box>
                  </CardActionArea>
                </Card>
              );
            })}
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default MyGroupsWidget;
