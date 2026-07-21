import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect, Pattern, Line, Mask } from 'react-native-svg';
import { useAppTheme } from '../context/ThemeContext';

/**
 * CerebroOS ambient background (design system §5): two soft radial "orbs" (violet top-center,
 * cyan top-right) plus a faint 56px grid masked to fade toward the bottom of the screen. RN has
 * no cheap cross-platform blur-filter equivalent to the web version's `filter: blur(40px)`, so
 * softness comes from generous multi-stop radial gradients instead of a true blur.
 *
 * The source design system only specified this for the dark canvas. Light mode keeps the same
 * composition at a fraction of the opacity (a soft brand-color wash, not a "glow") and flips the
 * grid lines from white-on-dark to black-on-light — same approach as the web app's
 * AmbientBackground.tsx.
 *
 * Absolutely positioned, `pointerEvents="none"` — mount once inside ScreenWrapper.tsx so every
 * screen inherits it for free, never per-section.
 */
export default function AmbientBackground() {
  const { width, height } = useWindowDimensions();
  const { isDark } = useAppTheme();
  const gridSize = 56;
  const orbOpacityScale = isDark ? 1 : 0.4;
  const gridLineColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <Defs>
        <RadialGradient id="orbViolet" cx="50%" cy="0%" r="55%">
          <Stop offset="0%" stopColor="#7C5CFF" stopOpacity={0.35 * orbOpacityScale} />
          <Stop offset="60%" stopColor="#7C5CFF" stopOpacity={0.12 * orbOpacityScale} />
          <Stop offset="100%" stopColor="#7C5CFF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="orbCyan" cx="90%" cy="5%" r="45%">
          <Stop offset="0%" stopColor="#00D2D3" stopOpacity={0.22 * orbOpacityScale} />
          <Stop offset="60%" stopColor="#00D2D3" stopOpacity={0.08 * orbOpacityScale} />
          <Stop offset="100%" stopColor="#00D2D3" stopOpacity={0} />
        </RadialGradient>
        <Mask id="gridFade">
          <RadialGradient id="gridFadeGrad" cx="50%" cy="0%" r="70%">
            <Stop offset="0%" stopColor="#fff" stopOpacity={1} />
            <Stop offset="45%" stopColor="#fff" stopOpacity={0.6} />
            <Stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </RadialGradient>
          <Rect x={0} y={0} width={width} height={height} fill="url(#gridFadeGrad)" />
        </Mask>
        <Pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
          <Line x1={0} y1={0} x2={gridSize} y2={0} stroke={gridLineColor} strokeWidth={1} />
          <Line x1={0} y1={0} x2={0} y2={gridSize} stroke={gridLineColor} strokeWidth={1} />
        </Pattern>
      </Defs>

      <Rect x={0} y={0} width={width} height={height} fill="url(#grid)" mask="url(#gridFade)" />
      <Rect x={0} y={0} width={width} height={height} fill="url(#orbViolet)" />
      <Rect x={0} y={0} width={width} height={height} fill="url(#orbCyan)" />
    </Svg>
  );
}
