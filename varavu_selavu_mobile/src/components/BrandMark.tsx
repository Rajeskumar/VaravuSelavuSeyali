import React, { useId } from 'react';
import Svg, { Path, Defs, ClipPath, Rect, G } from 'react-native-svg';

interface BrandMarkProps {
  size?: number;
  /** Monochrome override — when set, both halves use this single color (e.g. white on a solid
   * brand-color badge). Leave unset for the real two-tone "5f" mark. */
  color?: string;
  personalColor?: string;
  groupColor?: string;
}

/**
 * The "5f" app-icon mark (torn-receipt S in personalColor + split-bar T stem in groupColor, top
 * bar split at its exact midpoint — the "Equal-split bar" variant), mark-only so callers can
 * drop it into any container. Path data mirrors the source design (TrackSpense Brand.dc.html,
 * id="5f", 0..100 viewBox).
 */
export default function BrandMark({ size = 24, color, personalColor = '#3F3F9E', groupColor = '#15803D' }: BrandMarkProps) {
  const leftColor = color ?? personalColor;
  const rightColor = color ?? groupColor;
  const uid = useId();
  const clipL = `brandmark-bar-l-${uid}`;
  const clipR = `brandmark-bar-r-${uid}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        fill={leftColor}
        d="M 26 20 Q 26 14 32 14 H 56.5 C 30.5 20 30.5 36 46.5 42 C 62.5 48 62.5 62 36.5 70 L 33 73.5 L 29.5 70 L 26 73.5 Z"
      />
      <Path
        fill={rightColor}
        d="M 63.5 14 H 68 Q 74 14 74 20 V 70 L 70.2 73.5 L 66.4 70 L 62.6 73.5 L 58.8 70 L 55 73.5 L 51.2 70 L 47.4 73.5 L 43.5 70 C 69.5 62 69.5 48 53.5 42 C 37.5 36 37.5 20 63.5 14 Z"
      />
      <Defs>
        <ClipPath id={clipL}><Rect x={0} y={0} width={50} height={100} /></ClipPath>
        <ClipPath id={clipR}><Rect x={50} y={0} width={50} height={100} /></ClipPath>
      </Defs>
      <G clipPath={`url(#${clipL})`}>
        <Path stroke={leftColor} strokeWidth={6} strokeLinecap="round" fill="none" d="M 29 7.5 H 71" />
      </G>
      <G clipPath={`url(#${clipR})`}>
        <Path stroke={rightColor} strokeWidth={6} strokeLinecap="round" fill="none" d="M 29 7.5 H 71" />
      </G>
    </Svg>
  );
}
