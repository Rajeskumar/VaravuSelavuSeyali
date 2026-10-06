import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, inkOnPastel } from '../theme';
import ScreenWrapper from '../components/ScreenWrapper';
import ScreenHeader from '../components/ScreenHeader';
import FieldBox from '../components/FieldBox';
import SectionLabel from '../components/SectionLabel';
import { showToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { SignInSession, changePassword, endSession, getSecurityInfo, listSessions, signOutEverywhere } from '../api/account';
import * as SecureStore from 'expo-secure-store';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown');

/** Change password, see where you're signed in, and sign out of other devices or all of them. */
export default function SecurityScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { signOut } = useAuth();

  const [hasPassword, setHasPassword] = useState(true);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<SignInSession[] | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions(await listSessions());
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    getSecurityInfo().then((i) => setHasPassword(i.has_password)).catch(() => undefined);
    load();
  }, [load]);

  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = next.length >= 8 && next === confirm && (!hasPassword || current.length > 0) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const fresh = await changePassword({ current_password: hasPassword ? current : undefined, new_password: next });
      // The server ended every other session and re-issued this one; keep this device signed in.
      if (fresh.access_token && fresh.refresh_token) {
        await SecureStore.setItemAsync('access_token', fresh.access_token);
        await SecureStore.setItemAsync('refresh_token', fresh.refresh_token);
      }
      setCurrent(''); setNext(''); setConfirm('');
      setHasPassword(true);
      showToast({ message: 'Password changed. Your other devices were signed out.', type: 'success' });
      load();
    } catch (e: any) {
      showToast({ message: e?.message ?? 'Could not change your password', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const endOne = async (id: string) => {
    try {
      await endSession(id);
      load();
    } catch (e: any) {
      showToast({ message: e?.message ?? 'Could not sign that device out', type: 'error' });
    }
  };

  const everywhere = () =>
    Alert.alert('Sign out of all devices?', "You'll be signed out here too.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out everywhere', style: 'destructive', onPress: async () => { try { await signOutEverywhere(); } catch { /* sign out locally regardless */ } signOut(); } },
    ]);

  return (
    <ScreenWrapper scroll paddingBottom={60}>
      <ScreenHeader title="Password & security" back />

      <SectionLabel>{hasPassword ? 'Change password' : 'Set a password'}</SectionLabel>
      <View style={styles.form}>
        {!hasPassword && <Text style={styles.note}>You sign in with Google. A password also lets you sign in with your email.</Text>}
        {hasPassword && <FieldBox label="Current password" value={current} onChangeText={setCurrent} secureToggle textContentType="password" />}
        <FieldBox label="New password" value={next} onChangeText={setNext} secureToggle textContentType="newPassword" />
        <FieldBox label="Confirm new password" value={confirm} onChangeText={setConfirm} secureToggle textContentType="newPassword" error={mismatch ? "Passwords don't match." : undefined} />
        <Text style={styles.note}>At least 8 characters. Avoid common passwords.</Text>
        <TouchableOpacity activeOpacity={0.85} onPress={submit} disabled={!canSubmit} accessibilityRole="button">
          <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.cta, !canSubmit && { opacity: 0.5 }]}>
            <Text style={styles.ctaText}>{busy ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <SectionLabel style={{ marginTop: 28 }}>Where you're signed in</SectionLabel>
      <View style={{ marginTop: 8 }}>
        {sessions === null && <Text style={styles.note}>Loading…</Text>}
        {(sessions ?? []).map((s, i) => (
          <View key={s.family_id} style={styles.sessionRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sessionName}>Sign-in {i + 1}{s.current ? ' · this device' : ''}</Text>
              <Text style={styles.note}>Started {when(s.signed_in_at)} · last active {when(s.last_active_at)}</Text>
            </View>
            {!s.current && (
              <TouchableOpacity onPress={() => endOne(s.family_id)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.signOutLink}>Sign out</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.everywhere} onPress={everywhere} activeOpacity={0.8} accessibilityRole="button">
        <Text style={styles.everywhereText}>Sign out of all devices</Text>
      </TouchableOpacity>
    </ScreenWrapper>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  form: { gap: 12, marginTop: 8 },
  note: { fontFamily: theme.typography.fontFamily.regular, fontSize: 13, color: theme.colors.textTertiary },
  cta: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ctaText: { fontFamily: 'InstrumentSans-Bold', fontSize: 17, color: inkOnPastel },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  sessionName: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 15, color: theme.colors.text },
  signOutLink: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 14, color: theme.colors.error },
  everywhere: { marginTop: 16, borderWidth: 1, borderColor: theme.colors.error, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  everywhereText: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 15, color: theme.colors.error },
});
