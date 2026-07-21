/**
 * JoinGroupScreen.tsx — Handles deep-link invite acceptance.
 *
 * Route: Stack screen registered at "JoinGroup" with params: { token: string }
 * Deep link: trackspense://join/{token}
 *
 * If the user is not logged in when they tap the link, they land on LoginScreen
 * first; after login, the NavigationContainer linking config routes them here.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { acceptInvite, ApiError } from '../api/groups';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';

export default function JoinGroupScreen() {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const token: string = route.params?.token ?? '';

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [groupId, setGroupId] = useState('');

  useEffect(() => {
    if (!token) {
      setErrorMsg('Invalid invite link — no token found.');
      setStatus('error');
      return;
    }
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
  }, [token]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      {status === 'loading' && (
        <>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Joining group…</Text>
        </>
      )}

      {status === 'success' && (
        <>
          <Text style={styles.icon}>🎉</Text>
          <Text style={styles.title}>You're in!</Text>
          <Text style={styles.subtitle}>
            You have successfully joined the group.
          </Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => {
              if (groupId) {
                navigation.replace('GroupDetail', { groupId });
              } else {
                navigation.navigate('Groups');
              }
            }}
          >
            <Text style={styles.btnText}>View Group</Text>
          </TouchableOpacity>
        </>
      )}

      {status === 'error' && (
        <>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Couldn't join</Text>
          <Text style={styles.subtitle}>{errorMsg}</Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => navigation.navigate('Groups')}
          >
            <Text style={styles.btnText}>Go to Groups</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      gap: 12,
    },
    loadingText: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 16,
      color: theme.colors.textSecondary,
      marginTop: 12,
    },
    icon: { fontSize: 64, textAlign: 'center' },
    title: {
      fontFamily: 'InstrumentSans-Bold',
      fontSize: 24,
      color: theme.colors.text,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 15,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    btn: {
      backgroundColor: theme.colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 32,
      marginTop: 8,
    },
    btnText: { color: theme.colors.textInverse, fontFamily: 'InstrumentSans-Bold', fontSize: 16 },
  });
