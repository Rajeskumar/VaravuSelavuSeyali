import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import AddIcon from '@mui/icons-material/Add';
import { motion } from 'framer-motion';
import GroupCard from '../components/groups/GroupCard';
import FriendBalancesWidget from '../components/groups/FriendBalancesWidget';
import { listGroups, createGroup, ApiError } from '../api/groups';
import { slate, withAlpha } from '../theme';

const GROUP_TYPES = [
  { value: 'trip', label: 'Trip' },
  { value: 'home', label: 'Home' },
  { value: 'couple', label: 'Couple' },
  { value: 'other', label: 'Other' },
];

const GroupsPage: React.FC = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const jade = isDark ? slate.accentDark : slate.accent;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tabIndex, setTabIndex] = React.useState(0);
  
  const includeArchived = tabIndex === 1;
  const { data, isLoading, error } = useQuery({ 
    queryKey: ['groups', includeArchived], 
    queryFn: () => listGroups(includeArchived) 
  });

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [groupType, setGroupType] = React.useState('other');
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const allGroups = data || [];
  const groups = allGroups.filter((g) => {
    if (tabIndex === 0) return g.status === 'active';
    if (tabIndex === 1) return g.status === 'archived';
    return false;
  });
  const notEnabled = error instanceof ApiError && error.status === 404;

  const handleCreate = async () => {
    setFormError(null);
    setSaving(true);
    try {
      const created = await createGroup({ name, group_type: groupType });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setOpen(false);
      setName('');
      setGroupType('other');
      navigate(`/groups/${created.group_id}`);
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Failed to create group');
    } finally {
      setSaving(false);
    }
  };

  if (notEnabled) {
    return (
      <Box sx={{ mt: 4 }}>
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 1 }}>
          <GroupsRoundedIcon sx={{ fontSize: 64, color: 'primary.light', mb: 2 }} />
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Groups isn't available yet
          </Typography>
          <Typography variant="body1" color="text.secondary">
            This feature is being rolled out — check back soon.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 4 }}>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 1.2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                backgroundColor: jade,
              }}
            >
              👥
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Groups
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Split bills and track shared expenses
              </Typography>
            </Box>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
            Create Group
          </Button>
        </Box>

        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {!isLoading && !notEnabled && tabIndex === 0 && <FriendBalancesWidget />}

        {!isLoading && !notEnabled && (
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs
              value={tabIndex}
              onChange={(_, val) => setTabIndex(val)}
              sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, fontSize: '0.8125rem' } }}
            >
              <Tab label="Active" />
              <Tab label="Archived" />
            </Tabs>
          </Box>
        )}

        {!isLoading && groups.length === 0 && (
          <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 1 }}>
            <Box
              sx={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                mx: 'auto',
                mb: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
                background: withAlpha(jade, isDark ? 0.16 : 0.08),
              }}
            >
              👥
            </Box>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              {tabIndex === 0 ? 'No active groups yet' : 'No archived groups'}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 380, mx: 'auto' }}>
              {tabIndex === 0 
                ? 'Create a group to split rent, trips, or shared bills with roommates and friends.' 
                : 'Groups you archive will appear here.'}
            </Typography>
            {tabIndex === 0 && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
                Create your first group
              </Button>
            )}
          </Paper>
        )}

        {!isLoading && groups.length > 0 && (
          <Grid container spacing={2.5}>
            {groups.map((g) => (
              <Grid key={g.group_id} size={{ xs: 12, sm: 6, md: 4 }}>
                <GroupCard group={g} onClick={() => navigate(`/groups/${g.group_id}`)} />
              </Grid>
            ))}
          </Grid>
        )}
      </motion.div>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Create Group
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField label="Name" fullWidth value={name} onChange={(e) => setName(e.target.value)} required />
            <TextField select label="Type" fullWidth value={groupType} onChange={(e) => setGroupType(e.target.value)}>
              {GROUP_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            {formError && (
              <Typography color="error" variant="body2">
                {formError}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="contained" disabled={!name.trim() || saving} onClick={handleCreate}>
              {saving ? 'Creating...' : 'Create'}
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
};

export default GroupsPage;
