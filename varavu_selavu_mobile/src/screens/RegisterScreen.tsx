import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';
import CustomButton from '../components/CustomButton';
import CustomInput from '../components/CustomInput';
import { showToast } from '../components/Toast';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { signUp } = useAuth();
  const navigation = useNavigation<any>();

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
        </View>
      </ScrollView>
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
});
