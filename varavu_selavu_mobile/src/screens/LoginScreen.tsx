import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, ScrollView, Platform, Linking, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, inkOnPastel } from '../theme';
import FieldBox from '../components/FieldBox';
import SectionLabel from '../components/SectionLabel';
import AmbientBackground from '../components/AmbientBackground';
import { showToast } from '../components/Toast';
import API_BASE_URL from '../api/apiconfig';

/**
 * V2 "Sign in" (Flows 1.1): a brand statement instead of a stock illustration, two fields, and the
 * gradient reserved for the single primary action. The design also sketches Google/Apple buttons;
 * the backend has no OAuth yet, so they're deliberately not rendered.
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigation = useNavigation<any>();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleLogin = async () => {
    if (!email || !password) {
      showToast({ message: 'Please fill in all fields', type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      await signIn({ username: email, password });
      showToast({ message: 'Welcome back!', type: 'success' });
    } catch (error) {
      showToast({ message: 'Login failed. Check your credentials.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <AmbientBackground />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 48, paddingBottom: Math.max(insets.bottom, 20) + 6 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel color={theme.colors.primary} style={{ letterSpacing: 2 }}>TrackSpense</SectionLabel>
        <Text style={styles.headline}>
          Every transaction,{'\n'}every expense,{'\n'}
          <Text style={{ color: theme.colors.secondary }}>accounted for.</Text>
        </Text>
        <Text style={styles.tagline}>Track what you spend, split what you share, and ask why it changed.</Text>

        <View style={styles.form}>
          <FieldBox
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />
          <FieldBox
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureToggle
            textContentType="password"
            onSubmitEditing={handleLogin}
            returnKeyType="go"
          />

          <TouchableOpacity activeOpacity={0.85} onPress={handleLogin} disabled={loading} accessibilityRole="button">
            <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.cta, loading && { opacity: 0.7 }]}>
              {loading ? <ActivityIndicator color={inkOnPastel} /> : <Text style={styles.ctaText}>Sign in</Text>}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>No account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.footerLink}>Create one</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.legalRow}>
            <Text style={styles.legalText}>By signing in you agree to our </Text>
            <TouchableOpacity onPress={() => Linking.openURL(`${API_BASE_URL}/terms-of-service`)}>
              <Text style={styles.legalLink}>Terms</Text>
            </TouchableOpacity>
            <Text style={styles.legalText}> and </Text>
            <TouchableOpacity onPress={() => Linking.openURL(`${API_BASE_URL}/privacy-policy`)}>
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
  cta: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...theme.shadows.fab },
  ctaText: { fontFamily: theme.typography.fontFamily.bold, fontSize: 17, color: inkOnPastel },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 6 },
  footerText: { fontFamily: theme.typography.fontFamily.regular, fontSize: 14, color: theme.colors.textTertiary },
  footerLink: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 14, color: theme.colors.primary },
  legalRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  legalText: { fontFamily: theme.typography.fontFamily.regular, fontSize: 12, color: theme.colors.textTertiary },
  legalLink: { fontFamily: theme.typography.fontFamily.regular, fontSize: 12, color: theme.colors.primary, textDecorationLine: 'underline' },
});
