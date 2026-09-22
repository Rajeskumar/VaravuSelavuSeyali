import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

export type TabBarIconName = 'Dashboard' | 'Expenses' | 'GroupsTab' | 'Analysis' | 'AI Analyst';

interface Props {
  name: TabBarIconName | string;
  color: string;
  size?: number;
}

/**
 * The V2 tab-bar glyphs, drawn exactly as the design specifies (22-unit viewbox, 1.8 stroke,
 * outline only — the active tab is signalled by colour, not by a filled variant).
 */
export default function TabBarIcon({ name, color, size = 21 }: Props) {
  const common = { width: size, height: size, viewBox: '0 0 22 22', fill: 'none' as const };
  const stroke = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (name) {
    case 'Dashboard':
      return (
        <Svg {...common}>
          <Path d="M3.4 8.6 11 3l7.6 5.6V18a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1Z" {...stroke} />
        </Svg>
      );
    case 'Expenses':
      return (
        <Svg {...common}>
          <Rect x={3.2} y={3.6} width={15.6} height={14.8} rx={3.4} {...stroke} />
          <Path d="M7 8.6h8M7 12.6h5" {...stroke} />
        </Svg>
      );
    case 'GroupsTab':
      return (
        <Svg {...common}>
          <Circle cx={8.4} cy={8} r={3.1} {...stroke} />
          <Path d="M2.8 18.4c0-3 2.5-4.8 5.6-4.8s5.6 1.8 5.6 4.8" {...stroke} />
          <Path d="M14.6 5.3a3 3 0 0 1 0 5.6M16.2 13.9c2 .5 3 1.9 3 4.5" {...stroke} />
        </Svg>
      );
    case 'Analysis':
      return (
        <Svg {...common}>
          <Path d="M4.6 18V9.6M11 18V4.4M17.4 18v-5.8" {...stroke} />
        </Svg>
      );
    default: // 'AI Analyst'
      return (
        <Svg {...common}>
          <Path d="M11 3.2 12.9 8 17.7 10l-4.8 2L11 16.8 9.1 12 4.3 10 9.1 8Z" {...stroke} />
        </Svg>
      );
  }
}
