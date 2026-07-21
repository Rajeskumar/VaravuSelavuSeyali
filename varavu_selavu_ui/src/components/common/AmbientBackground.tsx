import React from 'react';
import Box from '@mui/material/Box';
import { keyframes, useTheme } from '@mui/material/styles';

const orbFloat = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(30px, -20px) scale(1.08); }
`;

const orbFloat2 = keyframes`
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-40px, 25px) scale(0.94); }
`;

const gridDrift = keyframes`
  from { background-position: 0 0; }
  to { background-position: 0 56px; }
`;

/**
 * CerebroOS ambient background (design system §5): two blurred floating "orbs" (violet
 * top-center, cyan top-right) plus a faint 56px grid masked to fade out toward the bottom of
 * the viewport. Mount exactly once per page — behind routed content in the authenticated app
 * shell, or once inside a marketing page's hero — never per-section (see "never more than one
 * gradient CTA band per page" in the same spec).
 *
 * The source design system only specified this for the dark canvas. Light mode keeps the same
 * composition at a fraction of the opacity — a soft brand-color wash rather than a "glow" (which
 * only reads on near-black) — and flips the grid lines from white-on-dark to black-on-light.
 */
function AmbientBackground() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const orbOpacityScale = isDark ? 1 : 0.4;
  const gridLineColor = isDark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)';

  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: -280,
          left: '50%',
          marginLeft: '-450px',
          width: 900,
          height: 700,
          borderRadius: '50%',
          background: `radial-gradient(circle, oklch(0.5 0.22 285 / ${0.35 * orbOpacityScale}), transparent 65%)`,
          filter: 'blur(40px)',
          animation: `${orbFloat} 14s ease-in-out infinite`,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          top: -120,
          right: -180,
          width: 640,
          height: 640,
          borderRadius: '50%',
          background: `radial-gradient(circle, oklch(0.65 0.14 195 / ${0.22 * orbOpacityScale}), transparent 65%)`,
          filter: 'blur(40px)',
          animation: `${orbFloat2} 18s ease-in-out infinite`,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(${gridLineColor} 1px, transparent 1px), linear-gradient(90deg, ${gridLineColor} 1px, transparent 1px)`,
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black 30%, transparent 75%)',
          animation: `${gridDrift} 8s linear infinite`,
        }}
      />
    </Box>
  );
}

export default AmbientBackground;
