import React, { useMemo } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, withAlpha } from '../theme';

interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** V2 switch — 44×26 pill, violet-tinted track with a white knob when on, hairline track with a
 * muted knob when off. Same look on every platform (the native Switch differs per OS). */
export default function ToggleSwitch({ value, onValueChange, disabled, accessibilityLabel }: ToggleSwitchProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={[styles.track, value ? styles.trackOn : styles.trackOff, value ? styles.alignEnd : styles.alignStart]}
    >
      <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
    </Pressable>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  track: { width: 44, height: 26, borderRadius: 999, padding: 3, flexDirection: 'row' },
  trackOn: { backgroundColor: withAlpha(theme.colors.gradientStart, 0.5) },
  trackOff: { backgroundColor: theme.colors.surfaceSecondary },
  alignEnd: { justifyContent: 'flex-end' },
  alignStart: { justifyContent: 'flex-start' },
  knob: { width: 20, height: 20, borderRadius: 10 },
  knobOn: { backgroundColor: '#FFFFFF' },
  knobOff: { backgroundColor: theme.colors.textTertiary },
});
