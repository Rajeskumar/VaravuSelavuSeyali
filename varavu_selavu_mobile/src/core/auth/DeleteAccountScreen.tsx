import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '../theme/ThemeContext';
import { AppTheme } from '../theme/theme';
import ScreenWrapper from '../ui/ScreenWrapper';
import ScreenHeader from '../ui/ScreenHeader';
import FieldBox from '../ui/FieldBox';
import { showToast } from '../ui/Toast';
import { getAppConfig } from '../config/appConfig';
import { useAuth } from './AuthContext';
import { deleteAccount, getSecurityInfo } from './accountApi';

/** Says what is erased and what stays before asking for proof of ownership (password, or the
 * account's own email for Google sign-in accounts that have no password). */
export default function DeleteAccountScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { signOut, userEmail } = useAuth();
  const [hasPassword, setHasPassword] = useState(true);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getSecurityInfo().then((i) => setHasPassword(i.has_password)).catch(() => undefined);
  }, []);

  const confirm = async () => {
    if (!typed || deleting) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setDeleting(true);
    try {
      await deleteAccount(hasPassword ? { password: typed } : { confirm_email: typed });
      signOut();
    } catch (e: any) {
      showToast({ message: e?.message ?? 'Could not delete your account', type: 'error' });
      setDeleting(false);
    }
  };

  return (
    <ScreenWrapper scroll paddingBottom={60}>
      <ScreenHeader title="Delete account" back />
      <Text style={styles.warn}>This can't be undone.</Text>
      <Text style={styles.body}>
        <Text style={styles.bold}>Deleted: </Text>
        {getAppConfig().auth.deleteAccountSummary.deleted}
      </Text>
      <Text style={styles.body}>
        <Text style={styles.bold}>Stays for the people you shared with: </Text>
        {getAppConfig().auth.deleteAccountSummary.retained}
      </Text>
      <View style={{ marginTop: 16 }}>
        <FieldBox
          label={hasPassword ? 'Your password' : `Type ${userEmail ?? 'your email'} to confirm`}
          value={typed}
          onChangeText={setTyped}
          secureToggle={hasPassword}
          autoCapitalize="none"
          textContentType={hasPassword ? 'password' : 'emailAddress'}
        />
      </View>
      <TouchableOpacity style={[styles.deleteButton, (!typed || deleting) && { opacity: 0.5 }]} onPress={confirm} disabled={!typed || deleting} activeOpacity={0.8} accessibilityRole="button">
        <Text style={styles.deleteButtonText}>{deleting ? 'Deleting…' : 'Delete permanently'}</Text>
      </TouchableOpacity>
    </ScreenWrapper>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  warn: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 18, color: theme.colors.error, marginBottom: 10 },
  body: { fontFamily: theme.typography.fontFamily.regular, fontSize: 15, lineHeight: 22, color: theme.colors.textSecondary, marginBottom: 12 },
  bold: { fontFamily: theme.typography.fontFamily.semiBold, color: theme.colors.text },
  deleteButton: { backgroundColor: theme.colors.error, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20 },
  deleteButtonText: { color: theme.colors.textInverse, fontFamily: 'InstrumentSans-Bold', fontSize: 16 },
});
