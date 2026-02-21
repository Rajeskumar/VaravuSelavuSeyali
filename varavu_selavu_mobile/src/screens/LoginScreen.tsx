import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import CustomButton from '../components/CustomButton';
import CustomInput from '../components/CustomInput';
import { showToast } from '../components/Toast';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigation = useNavigation<any>();

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
      {/* Brand Header */}
      <LinearGradient
        colors={[theme.colors.gradientStart, theme.colors.gradientEnd]}
        style={styles.brandHeader}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.brandIcon}>💰</Text>
        <Text style={styles.brandName}>TrackSpense</Text>
        <Text style={styles.brandTagline}>Smart expense tracking</Text>
      </LinearGradient>

      {/* Login Form Card */}
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Welcome Back</Text>
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
          title="Sign In"
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
    fontWeight: '500',
  },
  formCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    marginTop: -16,
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 28,
    ...theme.shadows.lg,
  },
  formTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginBottom: 28,
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
});
