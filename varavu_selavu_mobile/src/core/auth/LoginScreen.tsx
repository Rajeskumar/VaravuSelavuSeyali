import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, ScrollView, Platform, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from './AuthContext';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../theme/ThemeContext';
import { AppTheme } from '../theme/theme';
import SectionLabel from '../ui/SectionLabel';
import AmbientBackground from '../ui/AmbientBackground';
import { useScrollToEndOnKeyboard } from '../ui/useScrollToEndOnKeyboard';
import { getApiBaseUrl } from '../api/baseUrl';
import { getAppConfig } from '../config/appConfig';
import { getEnabledAuthMethods } from './methods';

/**
 * V2 "Sign in" (Flows 1.1): a brand statement instead of a stock illustration, and the gradient
 * reserved for the single primary action. The form itself is whatever sign-in methods the app
 * enabled (`AppConfig.auth.methods`, rendered from `./methods`); the brand copy comes from
 * `AppConfig.brand`.
 */
export default function LoginScreen() {
  const { sessionNotice } = useAuth();
  const navigation = useNavigation<any>();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { brand } = getAppConfig();
  const methods = getEnabledAuthMethods();
  const scrollRef = useRef<ScrollView>(null);
  // Keep the password field and Sign in above the keyboard (iOS: scroll; Android pan mode: also reserve its height).
  const { keyboardInset, onContentSizeChange } = useScrollToEndOnKeyboard(scrollRef);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <AmbientBackground />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 48, paddingBottom: Math.max(insets.bottom, 20) + 6 + keyboardInset }]}
        onContentSizeChange={onContentSizeChange}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {sessionNotice && <Text accessibilityRole="alert" style={{ color: theme.colors.text, marginBottom: 16 }}>{sessionNotice}</Text>}
        <SectionLabel color={theme.colors.primary} style={{ letterSpacing: 2 }}>{brand.name}</SectionLabel>
        <Text style={styles.headline}>
          {brand.loginHeadline.lines.map((line) => (
            <React.Fragment key={line}>{line}{'\n'}</React.Fragment>
          ))}
          <Text style={{ color: theme.colors.secondary }}>{brand.loginHeadline.accent}</Text>
        </Text>
        <Text style={styles.tagline}>{brand.loginTagline}</Text>

        <View style={styles.form}>
          {methods.map((method) => <method.Form key={method.id} />)}

          <View style={styles.footer}>
            <Text style={styles.footerText}>No account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.footerLink}>Create one</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.legalRow}>
            <Text style={styles.legalText}>By signing in you agree to our </Text>
            <TouchableOpacity onPress={() => Linking.openURL(`${getApiBaseUrl()}/terms-of-service`)}>
              <Text style={styles.legalLink}>Terms</Text>
            </TouchableOpacity>
            <Text style={styles.legalText}> and </Text>
            <TouchableOpacity onPress={() => Linking.openURL(`${getApiBaseUrl()}/privacy-policy`)}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, overflow: 'hidden' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 28 },
  headline: {
    fontFamily: theme.typography.fontFamily.display, fontSize: 46, lineHeight: 48, letterSpacing: -1.6,
    color: theme.colors.text, marginTop: 22,
  },
  tagline: {
    fontFamily: theme.typography.fontFamily.regular, fontSize: 16, lineHeight: 24,
    color: theme.colors.textSecondary, marginTop: 16, maxWidth: 290,
  },
  form: { marginTop: 'auto', paddingTop: 36, gap: 12 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 6 },
  footerText: { fontFamily: theme.typography.fontFamily.regular, fontSize: 14, color: theme.colors.textTertiary },
  footerLink: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 14, color: theme.colors.primary },
  legalRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  legalText: { fontFamily: theme.typography.fontFamily.regular, fontSize: 12, color: theme.colors.textTertiary },
  legalLink: { fontFamily: theme.typography.fontFamily.regular, fontSize: 12, color: theme.colors.primary, textDecorationLine: 'underline' },
});
