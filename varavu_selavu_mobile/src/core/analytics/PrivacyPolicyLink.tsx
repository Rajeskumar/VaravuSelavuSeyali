import React, { useMemo } from 'react';
import { Text, StyleSheet, Linking } from 'react-native';
import { getApiBaseUrl } from '../api/baseUrl';
import { useAppTheme } from '../theme/ThemeContext';
import { AppTheme } from '../theme/theme';

/** Opens the same hosted policy that About links to. */
export default function PrivacyPolicyLink() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Text
      style={styles.link}
      accessibilityRole="link"
      onPress={() => { void Linking.openURL(`${getApiBaseUrl()}/privacy-policy`).catch(() => undefined); }}
    >
      Read the Privacy Policy
    </Text>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  link: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 13, color: theme.colors.primary, paddingVertical: 8 },
});
