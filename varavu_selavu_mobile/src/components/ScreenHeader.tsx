import React, { useMemo } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import IconButton from './IconButton';

interface ScreenHeaderProps {
  title: string;
  /** Small muted line under the title (pushed screens: "14 purchases · 4 merchants"). */
  subtitle?: string;
  /** Show the bordered back button. Tab roots leave this off; pushed screens turn it on. */
  back?: boolean | (() => void);
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * V2 screen header. Tab roots: 28px Bricolage title + optional right action. Pushed screens: back
 * square + 18–26px title. Screens render this themselves (native stack/tab headers are hidden) so
 * every screen shares one title treatment and the canvas has no header bar.
 */
export default function ScreenHeader({ title, subtitle, back, right, style }: ScreenHeaderProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<any>();
  const onBack = typeof back === 'function' ? back : () => navigation.goBack();

  return (
    <View style={[styles.row, style]}>
      {back ? <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={onBack} style={styles.back} /> : null}
      <View style={styles.titles}>
        <Text style={[styles.title, back ? styles.titlePushed : styles.titleRoot]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingBottom: 14, gap: 14 },
  back: { marginRight: 0 },
  titles: { flex: 1, minWidth: 0 },
  title: { fontFamily: theme.typography.fontFamily.display, color: theme.colors.text, letterSpacing: -0.8 },
  titleRoot: { fontSize: 28 },
  titlePushed: { fontSize: 24 },
  subtitle: { fontFamily: theme.typography.fontFamily.regular, fontSize: 12, color: theme.colors.textTertiary, marginTop: 2 },
});
