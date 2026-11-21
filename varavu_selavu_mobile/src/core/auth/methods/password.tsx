import React, { useMemo, useState } from 'react';
import { Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../AuthContext';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppTheme, inkOnPastel } from '../../theme/theme';
import FieldBox from '../../ui/FieldBox';
import { showToast } from '../../ui/Toast';
import { AuthMethod } from './types';

/** Email + password: two fields, a "Forgot password?" link and the gradient primary action. */
function PasswordForm() {
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
    <>
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
      <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotLink}>
        <Text style={styles.forgotLinkText}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity activeOpacity={0.85} onPress={handleLogin} disabled={loading} accessibilityRole="button">
        <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.cta, loading && { opacity: 0.7 }]}>
          {loading ? <ActivityIndicator color={inkOnPastel} /> : <Text style={styles.ctaText}>Sign in</Text>}
        </LinearGradient>
      </TouchableOpacity>
    </>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  forgotLink: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgotLinkText: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 13.5, color: theme.colors.primary },
  cta: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...theme.shadows.fab },
  ctaText: { fontFamily: theme.typography.fontFamily.bold, fontSize: 17, color: inkOnPastel },
});

export const passwordMethod: AuthMethod = { id: 'password', Form: PasswordForm };
