import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, inkOnPastel, withAlpha } from '../theme';
import FieldBox from '../components/FieldBox';
import IconButton from '../components/IconButton';
import { forgotPassword } from '../api/auth';

/**
 * "Forgot password" — the request half of the reset flow (mirrors web's ForgotPasswordPage.tsx).
 * The completion half (setting a new password) isn't a native screen here: the emailed link
 * opens the web app's own ResetPasswordPage in the device's browser, which already handles it —
 * no native deep-link/Universal Links setup needed for that to work today.
 */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigation = useNavigation<any>();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Enter your email address');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await forgotPassword({ email: email.trim() });
      // Deliberately identical whether or not the address is registered — matches web's
      // ForgotPasswordPage.tsx: an "email not found" response here would let this screen be
      // used to enumerate which addresses have accounts.
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <IconButton icon="arrow-back" accessibilityLabel="Back to sign in" onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>Enter the email on your account and we'll send you a link to reset it.</Text>

        {sent ? (
          <View style={styles.form}>
            <View style={styles.successCard}>
              <Ionicons name="mail-outline" size={22} color={theme.colors.success} />
              <Text style={styles.successText}>
                If that email is registered, we've sent a link to reset your password. Open it on this device to
                finish resetting.
              </Text>
            </View>
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.backToSignIn}>
              <Text style={styles.footerLink}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <FieldBox
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={(v) => { setEmail(v); setError(null); }}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              onSubmitEditing={handleSubmit}
              returnKeyType="send"
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity activeOpacity={0.85} onPress={handleSubmit} disabled={loading} accessibilityRole="button">
              <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.cta, loading && { opacity: 0.7 }]}>
                {loading ? <ActivityIndicator color={inkOnPastel} /> : <Text style={styles.ctaText}>Send reset link</Text>}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Remembered it?</Text>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Text style={styles.footerLink}>Sign in</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 8, paddingBottom: 26 },
  title: {
    fontFamily: theme.typography.fontFamily.display, fontSize: 34, letterSpacing: -1, color: theme.colors.text,
    marginTop: 26,
  },
  subtitle: { fontFamily: theme.typography.fontFamily.regular, fontSize: 15, lineHeight: 21, color: theme.colors.textSecondary, marginTop: 8 },
  form: { marginTop: 26, gap: 12 },
  errorText: { fontFamily: theme.typography.fontFamily.regular, fontSize: 13, color: theme.colors.error, marginTop: -2 },
  cta: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: theme.typography.fontFamily.bold, fontSize: 17, color: inkOnPastel },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 6 },
  footerText: { fontFamily: theme.typography.fontFamily.regular, fontSize: 14, color: theme.colors.textTertiary },
  footerLink: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 14, color: theme.colors.primary },
  successCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16, borderRadius: 16,
    backgroundColor: withAlpha(theme.colors.success, 0.1), borderWidth: 1, borderColor: withAlpha(theme.colors.success, 0.25),
  },
  successText: { flex: 1, fontFamily: theme.typography.fontFamily.regular, fontSize: 14, lineHeight: 20, color: theme.colors.text },
  backToSignIn: { alignSelf: 'center', marginTop: 8, paddingVertical: 8 },
});
