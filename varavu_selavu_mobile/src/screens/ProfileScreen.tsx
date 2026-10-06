import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Linking, Share } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, withAlpha, inkOnPastel } from '../theme';
import ScreenWrapper from '../components/ScreenWrapper';
import ScreenHeader from '../components/ScreenHeader';
import FieldBox from '../components/FieldBox';
import { useBudgetsEnabled } from '../hooks/useBudgetsEnabled';
import { useCardCoachEnabled } from '../hooks/useCardCoachEnabled';
import { listBudgets } from '../api/budgets';
import { getProfile, updateProfile, deleteProfile } from '../api/profile';
import { forgotPassword } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import * as Haptics from 'expo-haptics';
import { apiFetch } from '../api/apiFetch';
import { listMyCards } from '../api/cards';

export default function ProfileScreen({ navigation }: any) {
  const { signOut, userEmail } = useAuth();
  const { theme, isDark, isSystemDefault, setMode: setThemeMode, useSystemTheme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [email, setEmail] = useState(userEmail || '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [venmoHandle, setVenmoHandle] = useState('');
  const [paypalHandle, setPaypalHandle] = useState('');
  const [upiId, setUpiId] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // V2 "Account" is a menu; the old profile form lives one level down as "Edit profile".
  const [mode, setMode] = useState<'menu' | 'edit'>('menu');

  const { enabled: budgetsEnabled } = useBudgetsEnabled();
  const { enabled: cardCoachEnabled } = useCardCoachEnabled();
  const { data: budgets } = useQuery({ queryKey: ['budgets', null], queryFn: () => listBudgets(), enabled: budgetsEnabled });
  const { data: myCards } = useQuery({ queryKey: ['cards-mine'], queryFn: listMyCards, enabled: cardCoachEnabled });

  // "On" only when the OS actually lets us alert — a token alone doesn't mean permission.
  const [notifsOn, setNotifsOn] = useState<boolean | null>(null);
  useEffect(() => {
    Notifications.getPermissionsAsync().then((p) => setNotifsOn(p.granted)).catch(() => setNotifsOn(null));
  }, []);

  const [exporting, setExporting] = useState(false);
  const exportData = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await apiFetch('/api/v1/expenses/export.csv', { method: 'GET' });
      if (!res.ok) throw new Error('export failed');
      const csv = await res.text();
      await Share.share({ title: 'trackspense_expenses.csv', message: csv });
    } catch (e) {
      Alert.alert('Export failed', 'Could not export your expenses. Try again in a moment.');
    } finally {
      setExporting(false);
    }
  };

  const chooseAppearance = () =>
    Alert.alert('Appearance', undefined, [
      { text: 'Dark', onPress: () => setThemeMode('dark') },
      { text: 'Light', onPress: () => setThemeMode('light') },
      { text: 'System', onPress: useSystemTheme },
      { text: 'Cancel', style: 'cancel' },
    ]);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const p = await getProfile();
      setEmail(p.email || userEmail || '');
      setName(p.name || '');
      setPhone(p.phone || '');
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
        name, phone,
        venmo_handle: venmoHandle, paypal_handle: paypalHandle, upi_id: upiId,
      });
      setName(p.name || '');
      setPhone(p.phone || '');
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

  const initial = (name || email || '?').charAt(0).toUpperCase();

  if (mode === 'edit') {
    return (
      <ScreenWrapper scroll paddingBottom={60}>
        <ScreenHeader title="Edit profile" back={() => setMode('menu')} />
        <View style={styles.form}>
          <FieldBox label="Email (read only)" value={email} editable={false} style={{ color: theme.colors.textTertiary }} />
          <FieldBox label="Name" value={name} onChangeText={setName} placeholder="John Doe" />
          <FieldBox label="Phone" value={phone} onChangeText={setPhone} placeholder="+1 234 567 8900" keyboardType="phone-pad" />
          <FieldBox label="Venmo username" value={venmoHandle} onChangeText={setVenmoHandle} placeholder="@yourname" autoCapitalize="none" />
          <FieldBox label="PayPal.me username" value={paypalHandle} onChangeText={setPaypalHandle} placeholder="yourname" autoCapitalize="none" />
          <FieldBox label="UPI ID" value={upiId} onChangeText={setUpiId} placeholder="yourname@bank" autoCapitalize="none" />

          <TouchableOpacity activeOpacity={0.85} onPress={handleSave} disabled={saving} accessibilityRole="button">
            <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.cta, saving && { opacity: 0.7 }]}>
              <Text style={styles.ctaText}>{saving ? 'Saving…' : 'Save changes'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Danger zone</Text>
          <Text style={styles.dangerDesc}>
            Permanently delete your account and all associated expense data. This action cannot be undone.
          </Text>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount} activeOpacity={0.8}>
            <Text style={styles.deleteButtonText}>Delete account</Text>
          </TouchableOpacity>
        </View>
      </ScreenWrapper>
    );
  }

  // Reuses the reset-by-email flow (no new endpoint; proves control of the inbox).
  const sendPasswordReset = async () => {
    try {
      await forgotPassword({ email });
      Alert.alert('Check your email', `We sent a link to ${email} to set a new password.`);
    } catch {
      Alert.alert("Couldn't send the email", 'Try again in a minute.');
    }
  };

  // Same eight rows, same order as the design. Cards and Budgets drop out only when their backend
  // feature flag is off (no screen to open); everything else is always present.
  const rows: { name: string; hint?: string; onPress: () => void }[] = [
    ...(cardCoachEnabled ? [{
      name: 'Cards & accounts',
      hint: myCards && myCards.length > 0 ? String(myCards.length) : undefined,
      onPress: () => navigation.navigate('Cards'),
    }] : []),
    { name: 'Categories & tags', onPress: () => navigation.navigate('Tags') },
    ...(budgetsEnabled ? [{
      name: 'Budgets',
      hint: budgets && budgets.length > 0 ? `${budgets.length} active` : undefined,
      onPress: () => navigation.navigate('MainTabs', { screen: 'Analysis', params: { initialTab: 'budgets' } }),
    }] : []),
    { name: 'Notifications', hint: notifsOn === null ? undefined : notifsOn ? 'On' : 'Off', onPress: () => Linking.openSettings() },
    { name: 'Appearance', hint: isSystemDefault ? 'System' : isDark ? 'Dark' : 'Light', onPress: chooseAppearance },
    { name: 'Export data', hint: exporting ? 'Exporting…' : undefined, onPress: exportData },
    { name: 'Change password', onPress: sendPasswordReset },
    { name: 'Feedback', onPress: () => navigation.navigate('Feedback') },
    { name: 'About', onPress: () => navigation.navigate('About') },
  ];

  return (
    <ScreenWrapper scroll paddingBottom={60}>
      <ScreenHeader title="Account" back style={{ paddingBottom: 22 }} />

      <View style={styles.identity}>
        <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.identityName} numberOfLines={1}>{name || email.split('@')[0]}</Text>
          <Text style={styles.identityEmail} numberOfLines={1}>{email}</Text>
        </View>
        <TouchableOpacity style={styles.editBtn} activeOpacity={0.7} onPress={() => setMode('edit')} accessibilityRole="button">
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <View>
        {rows.map((r) => (
          <TouchableOpacity key={r.name} style={styles.menuRow} activeOpacity={0.6} onPress={r.onPress} accessibilityRole="button">
            <Text style={styles.menuName}>{r.name}</Text>
            {r.hint ? <Text style={styles.menuHint}>{r.hint}</Text> : null}
            <Ionicons name="chevron-forward" size={15} color={theme.colors.textQuaternary} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.signOut} activeOpacity={0.8} onPress={signOut} accessibilityRole="button">
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>TrackSpense {Constants.expoConfig?.version ?? ''}</Text>
    </ScreenWrapper>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  form: { gap: 12, marginBottom: 28 },
  cta: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  ctaText: { fontFamily: 'InstrumentSans-Bold', fontSize: 17, color: inkOnPastel },
  identity: {
    flexDirection: 'row', alignItems: 'center', gap: 15, paddingBottom: 22,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
  },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'InstrumentSans-Bold', fontSize: 24, color: inkOnPastel },
  identityName: { fontFamily: 'InstrumentSans-Bold', fontSize: 18, color: theme.colors.text },
  identityEmail: { fontFamily: 'InstrumentSans-Regular', fontSize: 13, color: theme.colors.textTertiary, marginTop: 3 },
  editBtn: { height: 32, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center' },
  editBtnText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 13, color: theme.colors.textSecondary },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight,
  },
  menuName: { flex: 1, fontFamily: 'InstrumentSans-Medium', fontSize: 15, color: theme.colors.text },
  menuHint: { fontFamily: 'InstrumentSans-Regular', fontSize: 13, color: theme.colors.textTertiary },
  signOut: {
    marginTop: 20, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: withAlpha(theme.colors.error, 0.3), backgroundColor: withAlpha(theme.colors.error, 0.08),
  },
  signOutText: { fontFamily: 'InstrumentSans-Bold', fontSize: 15, color: theme.colors.error },
  version: { textAlign: 'center', fontFamily: 'IBMPlexMono-Regular', fontSize: 11, color: theme.colors.textQuaternary, marginTop: 14 },
  // Danger zone uses theme tokens (the old hand-picked light-mode reds floated a pink border on
  // a dark surface).
  dangerZone: {
    backgroundColor: theme.colors.errorSurface, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: theme.colors.error,
  },
  dangerTitle: { fontFamily: 'InstrumentSans-Bold', fontSize: 18, color: theme.colors.error, marginBottom: 8 },
  dangerDesc: { fontFamily: 'InstrumentSans-Regular', fontSize: 14, color: theme.colors.textSecondary, marginBottom: 20, lineHeight: 20 },
  deleteButton: { backgroundColor: theme.colors.error, borderRadius: 12, padding: 16, alignItems: 'center' },
  deleteButtonText: { color: theme.colors.textInverse, fontFamily: 'InstrumentSans-Bold', fontSize: 16 },
});
