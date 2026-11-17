import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

interface TintGlowProps {
  color: string;
  /** Peak opacity at the centre; the design uses .16. */
  opacity?: number;
}

/** A soft radial wash bleeding in from the top-right corner — the group screen's balance tint
 * (red when you owe, green when you're owed). Purely decorative; sits behind content. */
export default function TintGlow({ color, opacity = 0.16 }: TintGlowProps) {
  return (
    <Svg pointerEvents="none" style={styles.glow} width={400} height={300} viewBox="0 0 400 300">
      <Defs>
        <RadialGradient id="tint" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
          <Stop offset="70%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={400} height={300} fill="url(#tint)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: -120, right: -100 },
});
