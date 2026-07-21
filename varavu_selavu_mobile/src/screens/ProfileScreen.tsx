import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, ActivityIndicator, Switch, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { getProfile, updateProfile, deleteProfile } from '../api/profile';
import { useAuth } from '../context/AuthContext';
import * as Haptics from 'expo-haptics';
import API_BASE_URL from '../api/apiconfig';

export default function ProfileScreen({ navigation }: any) {
  const { signOut, userEmail } = useAuth();
  const { theme, isDark, toggleTheme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [email, setEmail] = useState(userEmail || '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [venmoHandle, setVenmoHandle] = useState('');
  const [paypalHandle, setPaypalHandle] = useState('');
  const [upiId, setUpiId] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const p = await getProfile();
      setEmail(p.email);
      setName(p.name || '');
      setPhone(p.phone || '');
      setAddress(p.address || '');
      setVenmoHandle(p.venmo_handle || '');
      setPaypalHandle(p.paypal_handle || '');
      setUpiId(p.upi_id || '');
    } catch (e) {
      console.error('Failed to load profile', e);
      Alert.alert('Error', 'Could not load profile data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const p = await updateProfile({
        name, phone, address,
        venmo_handle: venmoHandle, paypal_handle: paypalHandle, upi_id: upiId,
      });
      setName(p.name || '');
      setPhone(p.phone || '');
      setAddress(p.address || '');
      setVenmoHandle(p.venmo_handle || '');
      setPaypalHandle(p.paypal_handle || '');
      setUpiId(p.upi_id || '');
      Alert.alert('Success', 'Profile updated successfully.');
    } catch (e) {
      console.error('Failed to update profile', e);
      Alert.alert('Error', 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.prompt(
      'Delete Account',
      'This action is irreversible and will delete all your tracked expenses. Type "DELETE" to confirm.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async (text?: string) => {
            if (text !== 'DELETE') {
              Alert.alert('Error', 'Confirmation text did not match.');
              return;
            }
            try {
              await deleteProfile();
              signOut();
            } catch (e) {
              Alert.alert('Error', 'Failed to delete account.');
            }
          }
        }
      ],
      'plain-text'
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <LinearGradient colors={theme.gradients.surface} style={styles.container}>
      <SafeAreaView edges={['bottom']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <Text style={styles.label}>Email (Read Only)</Text>
            <TextInput
              style={[styles.input, styles.readOnlyInput]}
              value={email}
              editable={false}
            />

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="John Doe"
              placeholderTextColor={theme.colors.textTertiary}
            />

            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+1 234 567 8900"
              keyboardType="phone-pad"
              placeholderTextColor={theme.colors.textTertiary}
            />

            <Text style={styles.label}>Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={address}
              onChangeText={setAddress}
              placeholder="123 Main St, City, Country"
              multiline
              numberOfLines={3}
              placeholderTextColor={theme.colors.textTertiary}
            />

            <Text style={styles.label}>Venmo username</Text>
            <TextInput
              style={styles.input}
              value={venmoHandle}
              onChangeText={setVenmoHandle}
              placeholder="@yourname"
              autoCapitalize="none"
              placeholderTextColor={theme.colors.textTertiary}
            />

            <Text style={styles.label}>PayPal.me username</Text>
            <TextInput
              style={styles.input}
              value={paypalHandle}
              onChangeText={setPaypalHandle}
              placeholder="yourname"
              autoCapitalize="none"
              placeholderTextColor={theme.colors.textTertiary}
            />

            <Text style={styles.label}>UPI ID</Text>
            <TextInput
              style={styles.input}
              value={upiId}
              onChangeText={setUpiId}
              placeholder="yourname@bank"
              autoCapitalize="none"
              placeholderTextColor={theme.colors.textTertiary}
            />

            <TouchableOpacity
              style={[styles.saveButton, saving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Preferences</Text>
            <View style={styles.preferenceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.preferenceLabel}>Dark Mode</Text>
                <Text style={styles.preferenceDesc}>Switch between light and dark appearance</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <View style={styles.dangerZone}>
            <Text style={styles.dangerTitle}>Danger Zone</Text>
            <Text style={styles.dangerDesc}>
              Permanently delete your account and all associated expense data. This action cannot be undone.
            </Text>
            <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
              <Text style={styles.deleteButtonText}>Delete Account</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.legalFooter}>
            <View style={styles.legalLinksRow}>
              <TouchableOpacity onPress={() => Linking.openURL(`${API_BASE_URL}/terms-of-service`)}>
                <Text style={styles.legalLink}>Terms of Service</Text>
              </TouchableOpacity>
              <Text style={styles.legalText}> • </Text>
              <TouchableOpacity onPress={() => Linking.openURL(`${API_BASE_URL}/privacy-policy`)}>
                <Text style={styles.legalLink}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16, paddingBottom: 100 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    ...theme.shadows.sm,
  },
  sectionTitle: {
    fontFamily: 'InstrumentSans-Bold',
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 12,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  preferenceLabel: {
    fontFamily: 'InstrumentSans-SemiBold',
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 2,
  },
  preferenceDesc: {
    fontFamily: 'InstrumentSans-Regular',
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  label: {
    fontFamily: 'InstrumentSans-SemiBold',
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: 'InstrumentSans-Regular',
    color: theme.colors.text,
    marginBottom: 20,
  },
  readOnlyInput: {
    backgroundColor: theme.colors.surfaceSecondary,
    color: theme.colors.textTertiary,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: theme.colors.textInverse,
    fontFamily: 'InstrumentSans-Bold',
    fontSize: 16,
  },
  // Previously a hand-picked light-mode-only red palette (#FECACA/#DC2626/#991B1B) — floated a
  // light pink border on a dark red surface once the app went dark-only. Theme tokens instead.
  dangerZone: {
    backgroundColor: theme.colors.errorSurface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  dangerTitle: {
    fontFamily: 'InstrumentSans-Bold',
    fontSize: 18,
    color: theme.colors.error,
    marginBottom: 8,
  },
  dangerDesc: {
    fontFamily: 'InstrumentSans-Regular',
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  deleteButton: {
    backgroundColor: theme.colors.error,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: theme.colors.textInverse,
    fontFamily: 'InstrumentSans-Bold',
    fontSize: 16,
  },
  legalFooter: {
    marginTop: 32,
    alignItems: 'center',
  },
  legalText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontFamily: 'InstrumentSans-Regular',
  },
  legalLinksRow: {
    flexDirection: 'row',
  },
  legalLink: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontFamily: 'InstrumentSans-Regular',
    textDecorationLine: 'underline',
  },
});
