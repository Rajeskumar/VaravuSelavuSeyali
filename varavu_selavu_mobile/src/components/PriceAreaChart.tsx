import React, { useMemo, useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Circle } from 'react-native-svg';
import { useAppTheme } from '../context/ThemeContext';

interface PriceAreaChartProps {
  values: number[];
  height?: number;
}

const PAD_TOP = 10;
const PAD_BOTTOM = 8;
const PAD_X = 6;

/** V2 price-history chart: a violet line over a fading area, a cyan dot on the latest point, no
 * axes or gridlines. Width follows its container. */
export default function PriceAreaChart({ values, height = 100 }: PriceAreaChartProps) {
  const { theme } = useAppTheme();
  const [width, setWidth] = useState(0);

  const geometry = useMemo(() => {
    if (width <= 0 || values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const innerW = width - PAD_X * 2;
    const innerH = height - PAD_TOP - PAD_BOTTOM;
    const pts = values.map((v, i) => ({
      x: PAD_X + (i / (values.length - 1)) * innerW,
      y: PAD_TOP + (1 - (v - min) / span) * innerH,
    }));
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} ${height} L${pts[0].x.toFixed(1)} ${height} Z`;
    return { line, area, last: pts[pts.length - 1] };
  }, [values, width, height]);

  return (
    <View style={{ height }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {geometry && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={theme.colors.gradientStart} stopOpacity={0.35} />
              <Stop offset="1" stopColor={theme.colors.gradientStart} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={geometry.area} fill="url(#priceFill)" />
          <Path d={geometry.line} fill="none" stroke={theme.colors.gradientStart} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={geometry.last.x} cy={geometry.last.y} r={4} fill={theme.colors.gradientEnd} />
        </Svg>
      )}
    </View>
  );
}

