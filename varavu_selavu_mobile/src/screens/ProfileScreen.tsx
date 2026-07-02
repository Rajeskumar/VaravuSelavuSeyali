import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { getProfile, updateProfile, deleteProfile } from '../api/profile';
import { useAuth } from '../context/AuthContext';
import * as Haptics from 'expo-haptics';

export default function ProfileScreen({ navigation }: any) {
  const { signOut, userEmail } = useAuth();
  const { theme, isDark, toggleTheme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [email, setEmail] = useState(userEmail || '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  
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
      const p = await updateProfile({ name, phone, address });
      setName(p.name || '');
      setPhone(p.phone || '');
      setAddress(p.address || '');
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
    fontFamily: 'Inter-Bold',
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
    fontFamily: 'Inter-SemiBold',
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 2,
  },
  preferenceDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  label: {
    fontFamily: 'Inter-SemiBold',
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
    fontFamily: 'Inter-Regular',
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
    color: '#fff',
    fontFamily: 'Inter-Bold',
    fontSize: 16,
  },
  dangerZone: {
    backgroundColor: theme.colors.errorSurface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  dangerTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 18,
    color: '#DC2626',
    marginBottom: 8,
  },
  dangerDesc: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: '#991B1B',
    marginBottom: 20,
    lineHeight: 20,
  },
  deleteButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontFamily: 'Inter-Bold',
    fontSize: 16,
  },
});
