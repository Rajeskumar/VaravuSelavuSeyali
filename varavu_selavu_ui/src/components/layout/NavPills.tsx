import React from 'react';
import Box from '@mui/material/Box';
import { useTheme, alpha } from '@mui/material/styles';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { navItems } from './navItems';
import { motion as motionTokens } from '../../theme';

const NavPills: React.FC = () => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        px: 0.5,
      }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = location.pathname.startsWith(item.path);
        return (
          <Box
            key={item.path}
            component="button"
            onClick={() => navigate(item.path)}
            sx={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              px: 1.75,
              py: 0.9,
              borderRadius: 980,
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              color: active ? theme.palette.primary.main : theme.palette.text.secondary,
              transition: `color ${motionTokens.fast}s ${motionTokens.easingCss}`,
              '&:hover': { color: theme.palette.text.primary },
            }}
          >
            {active && (
              <motion.div
                layoutId="nav-pill-active"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 980,
                  background: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.1),
                }}
              />
            )}
            <Icon sx={{ fontSize: 18, position: 'relative', zIndex: 1 }} />
            <Box component="span" sx={{ position: 'relative', zIndex: 1 }}>{item.label}</Box>
          </Box>
        );
      })}
    </Box>
  );
};

export default NavPills;
