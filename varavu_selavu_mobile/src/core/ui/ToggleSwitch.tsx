import React, { useMemo } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { AppTheme, withAlpha } from '../theme/theme';

interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/** V2 switch — 44×26 pill, violet-tinted track with a white knob when on, hairline track with a
 * muted knob when off. Same look on every platform (the native Switch differs per OS). */
export default function ToggleSwitch({ value, onValueChange, disabled, accessibilityLabel, accessibilityHint }: ToggleSwitchProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      hitSlop={8}
      style={[styles.track, value ? styles.trackOn : styles.trackOff, value ? styles.alignEnd : styles.alignStart, disabled && styles.disabled]}
    >
      <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
    </Pressable>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  // The border (1.5) + padding (1.5) keep the old 3px inset. Both states carry a border because the pale fill
  // alone fails the 3:1 non-text contrast (WCAG 1.4.11): textSecondary when off, primary when on, so an opt-in
  // switch is unmistakable either way.
  track: { width: 44, height: 26, borderRadius: 999, padding: 1.5, borderWidth: 1.5, flexDirection: 'row' },
  trackOn: { backgroundColor: withAlpha(theme.colors.gradientStart, 0.5), borderColor: theme.colors.primary },
  trackOff: { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.textSecondary },
  disabled: { opacity: 0.5 },
  alignEnd: { justifyContent: 'flex-end' },
  alignStart: { justifyContent: 'flex-start' },
  knob: { width: 20, height: 20, borderRadius: 10 },
  knobOn: { backgroundColor: theme.colors.white },
  knobOff: { backgroundColor: theme.colors.textTertiary },
});
