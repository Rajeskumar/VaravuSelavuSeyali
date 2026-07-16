import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, ScrollView, Platform, Linking } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import Card from '../components/Card';
import CustomButton from '../components/CustomButton';
import CustomInput from '../components/CustomInput';
import { showToast } from '../components/Toast';
import API_BASE_URL from '../api/apiconfig';
import BrandMark from '../components/BrandMark';

/**
 * Rebuilt to match the web app's post-Slate LoginPage: a flat canvas + single centered card,
 * not the old gradient brand-header-plus-floating-card composition (a pre-Slate pattern that
 * predated the TS-DES-201 palette pivot and was never revisited — the header still rendered as
 * a flat block since `gradientStart`/`gradientEnd` both resolve to the same `primary` value now,
 * but the split-panel *shape* itself was untouched). No dedicated mobile Login prototype exists
 * in `docs/design/prototypes/v2/`, so this mirrors the web page's own composition instead.
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigation = useNavigation<any>();
  const { theme } = useAppTheme();
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <BrandMark size={18} color="#FFFFFF" />
          </View>
          <Text style={styles.brandName}>TrackSpense</Text>
        </View>

        <Card style={styles.formCard}>
          <Text style={styles.formTitle}>Login</Text>
          <Text style={styles.formSubtitle}>Sign in to continue</Text>

          <CustomInput
            label="Email"
            icon="✉️"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />

          <CustomInput
            label="Password"
            icon="🔒"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
          />

          <CustomButton
            title="Login"
            onPress={handleLogin}
            loading={loading}
            style={{ marginTop: 8 }}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.footerLink}>Create Account</Text>
            </TouchableOpacity>
          </View>
        </Card>

        <View style={styles.legalFooter}>
          <Text style={styles.legalText}>By logging in, you agree to our</Text>
          <View style={styles.legalLinksRow}>
            <TouchableOpacity onPress={() => Linking.openURL(`${API_BASE_URL}/terms-of-service`)}>
              <Text style={styles.legalLink}>Terms of Service</Text>
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
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 28,
  },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    fontFamily: 'Inter-Bold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  brandName: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  formCard: {
    padding: 24,
  },
  formTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 22,
    color: theme.colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  formSubtitle: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    gap: 6,
  },
  footerText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  footerLink: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  legalFooter: {
    marginTop: 20,
    alignItems: 'center',
  },
  legalText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  legalLinksRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  legalLink: {
    fontSize: 12,
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
});
