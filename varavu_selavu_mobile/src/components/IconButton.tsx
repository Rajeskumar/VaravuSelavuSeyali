import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  /** Small cyan dot in the corner — unread indicator on the bell. */
  badge?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

/** 40px hairline-bordered rounded square — back, bell, search, "···". */
export default function IconButton({ icon, onPress, size = 40, badge, accessibilityLabel, style }: IconButtonProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.btn, { width: size, height: size }, style]}
    >
      <Ionicons name={icon} size={size * 0.45} color={theme.colors.text} />
      {badge ? <View style={styles.badge} /> : null}
    </TouchableOpacity>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  btn: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: 9, right: 10,
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: theme.colors.secondary,
    borderWidth: 1.5, borderColor: theme.colors.background,
  },
});
