import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Linking, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, inkOnPastel } from '../theme';
import FieldBox from '../components/FieldBox';
import IconButton from '../components/IconButton';
import { showToast } from '../components/Toast';
import API_BASE_URL from '../api/apiconfig';

/**
 * V2 "Create account" (Flows 1.2): three fields, consent inline, no second confirmation screen.
 * Phone is no longer collected at sign-up (the backend treats it as optional) — it can be added
 * later from the profile.
 */
export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clearField = (f: string) => setFieldErrors((prev) => (prev[f] ? { ...prev, [f]: '' } : prev));

  const { signUp } = useAuth();
  const navigation = useNavigation<any>();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleRegister = async () => {
    // Same rules the server enforces, checked first so the message sits under the field it's
    // about (and a typo doesn't spend one of the few sign-up attempts allowed per hour).
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errs.email = 'Enter a valid email address, like name@example.com.';
    if (password.length < 8) errs.password = 'Use at least 8 characters.';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    if (!agreed) {
      showToast({ message: 'Please accept the Terms and Privacy Policy', type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      await signUp({ name, email, password });
      showToast({ message: 'Registration successful! Please login.', type: 'success' });
      navigation.goBack();
    } catch (error: any) {
      if (error?.fieldErrors && Object.keys(error.fieldErrors).length) setFieldErrors(error.fieldErrors);
      else showToast({ message: error?.message || 'Registration failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 20) + 6 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <IconButton icon="arrow-back" accessibilityLabel="Back to sign in" onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Just three fields — everything else later.</Text>

        <View style={styles.form}>
          <FieldBox
            label="Name"
            placeholder="Your name"
            value={name}
            onChangeText={(v) => { setName(v); clearField('name'); }}
            error={fieldErrors.name}
            textContentType="name"
            autoComplete="name"
          />
          <FieldBox
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={(v) => { setEmail(v); clearField('email'); }}
            error={fieldErrors.email}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />
          <FieldBox
            label="Password"
            placeholder="At least 8 characters"
            value={password}
            onChangeText={(v) => { setPassword(v); clearField('password'); }}
            error={fieldErrors.password}
            secureToggle
            textContentType="newPassword"
          />

          <TouchableOpacity
            style={styles.consent}
            activeOpacity={0.7}
            onPress={() => setAgreed((a) => !a)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
          >
            {agreed ? (
              <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.check}>
                <Ionicons name="checkmark" size={14} color={inkOnPastel} />
              </LinearGradient>
            ) : (
              <View style={[styles.check, styles.checkOff]} />
            )}
            <Text style={styles.consentText}>
              I agree to the{' '}
              <Text style={styles.link} onPress={() => Linking.openURL(`${API_BASE_URL}/terms-of-service`)}>Terms</Text>
              {' '}and{' '}
              <Text style={styles.link} onPress={() => Linking.openURL(`${API_BASE_URL}/privacy-policy`)}>Privacy Policy</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.85} onPress={handleRegister} disabled={loading} accessibilityRole="button">
            <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.cta, loading && { opacity: 0.7 }]}>
              {loading ? <ActivityIndicator color={inkOnPastel} /> : <Text style={styles.ctaText}>Create account</Text>}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { flexGrow: 1, paddingHorizontal: 28 },
  title: {
    fontFamily: theme.typography.fontFamily.display, fontSize: 34, letterSpacing: -1, color: theme.colors.text,
    marginTop: 26,
  },
  subtitle: { fontFamily: theme.typography.fontFamily.regular, fontSize: 15, color: theme.colors.textSecondary, marginTop: 8 },
  form: { marginTop: 26, gap: 12 },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4, paddingHorizontal: 2 },
  check: { width: 20, height: 20, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  checkOff: { borderWidth: 1, borderColor: theme.colors.border },
  consentText: { flex: 1, fontFamily: theme.typography.fontFamily.regular, fontSize: 13, lineHeight: 19.5, color: theme.colors.textSecondary },
  link: { color: theme.colors.primary },
  cta: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: theme.typography.fontFamily.bold, fontSize: 17, color: inkOnPastel },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 6 },
  footerText: { fontFamily: theme.typography.fontFamily.regular, fontSize: 14, color: theme.colors.textTertiary },
  footerLink: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 14, color: theme.colors.primary },
});
