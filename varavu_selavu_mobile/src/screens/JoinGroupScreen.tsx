/**
 * JoinGroupScreen.tsx — V2 "Invite" (Flows 1.3): handles deep-link invite acceptance.
 *
 * Route: Stack screen registered at "JoinGroup" with params: { token: string }
 * Deep link: trackspense://join/{token}
 *
 * The invite is no longer accepted the moment the screen opens — the user sees what joining does
 * and confirms with "Join group" (or backs out with "Not now"). The backend has no invite-preview
 * endpoint yet, so the group name/inviter/member count can't be shown before joining; the copy
 * here is deliberately generic until one exists.
 *
 * If the user is not logged in when they tap the link, they land on LoginScreen
 * first; after login, the NavigationContainer linking config routes them here.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { acceptInvite, ApiError } from '../api/groups';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, inkOnPastel } from '../theme';
import SectionLabel from '../components/SectionLabel';
import AmbientBackground from '../components/AmbientBackground';

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function JoinGroupScreen() {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const token: string = route.params?.token ?? '';

  const [status, setStatus] = useState<Status>(token ? 'idle' : 'error');
  const [errorMsg, setErrorMsg] = useState(token ? '' : 'Invalid invite link — no token found.');
  const [groupId, setGroupId] = useState('');

  const join = () => {
    setStatus('loading');
    acceptInvite(token)
      .then((result) => {
        setGroupId(result.group_id);
        setStatus('success');
      })
      .catch((e: unknown) => {
        const msg =
          e instanceof ApiError
            ? e.status === 409
              ? 'You are already a member of this group.'
              : e.message
            : 'Failed to accept invite. The link may have expired.';
        setErrorMsg(msg);
        setStatus('error');
      });
  };

  const leave = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Groups'));

  return (
    <View style={[styles.container, { paddingTop: insets.top + 32, paddingBottom: Math.max(insets.bottom, 20) + 6 }]}>
      <AmbientBackground />

      {status === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Joining group…</Text>
        </View>
      )}

      {status === 'idle' && (
        <>
          <SectionLabel color={theme.colors.secondary}>Invitation · trackspense://join</SectionLabel>
          <Text style={styles.title}>You've been invited to <Text style={{ color: theme.colors.primary }}>a group</Text></Text>
          <View style={styles.card}>
            <Text style={styles.cardText}>
              Joining lets you add expenses and see the running balance. Nothing you already logged is shared.
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity activeOpacity={0.85} onPress={join} accessibilityRole="button">
              <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Join group</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={leave} style={styles.secondaryBtn} accessibilityRole="button">
              <Text style={styles.secondaryBtnText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {status === 'success' && (
        <>
          <SectionLabel color={theme.colors.success}>Joined</SectionLabel>
          <Text style={styles.title}>You're in.</Text>
          <Text style={styles.subtitle}>You have successfully joined the group.</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => (groupId ? navigation.replace('GroupDetail', { groupId }) : navigation.navigate('Groups'))}
            >
              <LinearGradient colors={theme.gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>View group</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </>
      )}

      {status === 'error' && (
        <>
          <SectionLabel color={theme.colors.error}>Invitation</SectionLabel>
          <Text style={styles.title}>Couldn't join</Text>
          <Text style={styles.subtitle}>{errorMsg}</Text>
          <View style={styles.actions}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('Groups')} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Go to Groups</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background, paddingHorizontal: 28, overflow: 'hidden' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { fontFamily: 'InstrumentSans-Regular', fontSize: 16, color: theme.colors.textSecondary, marginTop: 12 },
    title: {
      fontFamily: 'BricolageGrotesque-SemiBold', fontSize: 36, lineHeight: 40, letterSpacing: -1.1,
      color: theme.colors.text, marginTop: 18,
    },
    subtitle: { fontFamily: 'InstrumentSans-Regular', fontSize: 15, lineHeight: 22, color: theme.colors.textSecondary, marginTop: 12 },
    card: {
      marginTop: 28, padding: 20, borderRadius: 20,
      borderWidth: 1, borderColor: theme.colors.borderLight, backgroundColor: theme.colors.surface,
    },
    cardText: { fontFamily: 'InstrumentSans-Regular', fontSize: 15, lineHeight: 22, color: theme.colors.textSecondary },
    actions: { marginTop: 'auto', gap: 10 },
    primaryBtn: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    primaryBtnText: { fontFamily: 'InstrumentSans-Bold', fontSize: 17, color: inkOnPastel },
    secondaryBtn: {
      height: 52, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    secondaryBtnText: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 16, color: theme.colors.textSecondary },
  });
