import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { AppTheme } from '../theme/theme';
import Sheet from '../ui/Sheet';
import CustomButton from '../ui/CustomButton';
import ToggleSwitch from '../ui/ToggleSwitch';
import { setConsentChoice, hasAnswered } from './consent';
import { useConsent } from './useConsent';
import { isAnalyticsAvailable } from './index';
import { consentCopy } from './consentCopy';
import PrivacyPolicyLink from './PrivacyPolicyLink';
import { useOverlayBusy } from '../ui/overlayGate';
import { showToast } from '../ui/Toast';

/**
 * Asked once, on first launch (signed in or not), until the person answers. Both switches start off and both buttons are
 * equally reachable; closing the sheet counts as declining, so nobody is nagged on every launch.
 * The text scrolls (large type, small screens, landscape) while the two buttons stay on screen.
 */
export default function ConsentPrompt() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const consent = useConsent();
  const [analyticsOn, setAnalyticsOn] = useState(false);
  const [crashOn, setCrashOn] = useState(false);
  const copy = consentCopy();
  const otherOverlayOpen = useOverlayBusy();

  // Builds that cannot collect (development, tests, native E2E) never ask.
  // It also waits for any other full-screen prompt (e.g. due recurring expenses after a later sign-in).
  const visible = isAnalyticsAvailable() && consent.loaded && !hasAnswered(consent) && !otherOverlayOpen;
  const answer = (analytics: boolean, crash: boolean) => {
    void Promise.all([setConsentChoice('analytics', analytics), setConsentChoice('crash', crash)]).then((saved) => {
      if (saved.includes(false)) showToast({ message: "Couldn't save your choice. It applies until you close the app.", type: 'warning' });
    });
  };

  return (
    <Sheet visible={visible} onClose={() => answer(false, false)}>
      <View accessibilityViewIsModal style={styles.body}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title} accessibilityRole="header">Help improve the app?</Text>
          <Text style={styles.intro}>Both are optional and off unless you turn them on.</Text>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{copy.analyticsTitle}</Text>
              <Text style={styles.rowBody}>{copy.analyticsBody}</Text>
            </View>
            <ToggleSwitch value={analyticsOn} onValueChange={setAnalyticsOn} accessibilityLabel={copy.analyticsTitle} accessibilityHint={copy.analyticsBody} />
          </View>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{copy.crashTitle}</Text>
              <Text style={styles.rowBody}>{copy.crashBody}</Text>
            </View>
            <ToggleSwitch value={crashOn} onValueChange={setCrashOn} accessibilityLabel={copy.crashTitle} accessibilityHint={copy.crashBody} />
          </View>
          <Text style={styles.footer}>{copy.identifiers}</Text>
          <Text style={styles.footer}>{copy.footer}</Text>
          <PrivacyPolicyLink />
        </ScrollView>
        <View style={styles.buttons}>
          <CustomButton title="Save my choices" variant="secondary" onPress={() => answer(analyticsOn, crashOn)} fullWidth />
          <CustomButton title="No thanks" variant="secondary" onPress={() => answer(false, false)} fullWidth />
        </View>
      </View>
    </Sheet>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  body: { flexShrink: 1 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: 8 },
  title: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 20, color: theme.colors.text, marginBottom: 6 },
  intro: { fontFamily: theme.typography.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 12 },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 15, color: theme.colors.text },
  rowBody: { fontFamily: theme.typography.fontFamily.regular, fontSize: 13, color: theme.colors.textSecondary, marginTop: 3 },
  footer: { fontFamily: theme.typography.fontFamily.regular, fontSize: 12, color: theme.colors.textSecondary, marginTop: 8 },
  buttons: { gap: 10, paddingTop: 8 },
});
