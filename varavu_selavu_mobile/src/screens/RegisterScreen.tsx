import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Linking } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, inkOnPastel } from '../theme';
import CustomButton from '../components/CustomButton';
import CustomInput from '../components/CustomInput';
import { showToast } from '../components/Toast';
import API_BASE_URL from '../api/apiconfig';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { signUp } = useAuth();
  const navigation = useNavigation<any>();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const handleRegister = async () => {
    if (!name || !email || !password || !phone) {
      showToast({ message: 'Please fill in all fields', type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      await signUp({ name, email, phone, password });
      showToast({ message: 'Registration successful! Please login.', type: 'success' });
      navigation.goBack();
    } catch (error: any) {
      showToast({ message: error.message || 'Registration failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Brand Header */}
      <LinearGradient
        colors={[theme.colors.gradientStart, theme.colors.gradientEnd]}
        style={styles.brandHeader}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.brandIcon}>🚀</Text>
        <Text style={styles.brandName}>Get Started</Text>
        <Text style={styles.brandTagline}>Create your free account</Text>
      </LinearGradient>

      {/* Registration Form Card */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formCard}>
          <CustomInput
            label="Full Name"
            icon="👤"
            placeholder="John Doe"
            value={name}
            onChangeText={setName}
            textContentType="name"
            autoComplete="name"
          />

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
            label="Phone"
            icon="📱"
            placeholder="+1 (555) 123-4567"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
          />

          <CustomInput
            label="Password"
            icon="🔒"
            placeholder="Create a strong password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
          />

          <CustomButton
            title="Create Account"
            onPress={handleRegister}
            loading={loading}
            style={{ marginTop: 8 }}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.legalFooter}>
            <Text style={styles.legalText}>By creating an account, you agree to our</Text>
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
  brandHeader: {
    paddingTop: Platform.OS === 'android' ? 60 : 80,
    paddingBottom: 40,
    paddingHorizontal: 30,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  brandIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  // brandHeader is a real violet→cyan gradient fill, mode-independent (always pastel) — ink
  // text always, not the mode-aware `textInverse` (which flips to white in light mode).
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: inkOnPastel,
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 15,
    color: 'rgba(5,6,10,0.75)',
    marginTop: 4,
    fontWeight: '500',
  },
  scrollArea: {
    flex: 1,
    marginTop: -16,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  formCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 28,
    ...theme.shadows.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
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
    marginTop: 24,
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
