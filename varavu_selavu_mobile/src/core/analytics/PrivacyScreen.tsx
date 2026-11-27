import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { AppTheme } from '../theme/theme';
import ScreenWrapper from '../ui/ScreenWrapper';
import ScreenHeader from '../ui/ScreenHeader';
import ToggleSwitch from '../ui/ToggleSwitch';
import { setConsentChoice } from './consent';
import { crashReporter, getAnalyticsEnvironment } from './index';
import CustomButton from '../ui/CustomButton';
import { showToast } from '../ui/Toast';
import PrivacyPolicyLink from './PrivacyPolicyLink';
import { useConsent } from './useConsent';
import { consentCopy } from './consentCopy';
import {
  DIAGNOSTICS_CONSENT_COPY,
  DIAGNOSTICS_CONSENT_TITLE,
  getDiagnosticsConsentState,
  loadDiagnosticsConsent,
  setDiagnosticsConsent,
  subscribeDiagnosticsConsent,
} from '../observability/consent';

/** Account → Privacy: change any choice at any time; a change applies immediately. */
export default function PrivacyScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const consent = useConsent();
  const [diagConsent, setDiagConsent] = useState(getDiagnosticsConsentState);
  useEffect(() => {
    const unsub = subscribeDiagnosticsConsent(setDiagConsent);
    if (!getDiagnosticsConsentState().loaded) {
      void loadDiagnosticsConsent();
    }
    return unsub;
  }, []);
  const copy = consentCopy();
  const debugCrashUnavailable = Platform.OS === 'ios' && __DEV__;
  const save = async (category: 'analytics' | 'crash', next: boolean) => {
    if (!(await setConsentChoice(category, next))) showToast({ message: "Couldn't save your choice. It applies until you close the app.", type: 'warning' });
  };
  const saveDiagnostics = async (next: boolean) => {
    if (!(await setDiagnosticsConsent(next))) {
      showToast({ message: "Couldn't save your performance diagnostics choice.", type: 'warning' });
    }
  };

  return (
    <ScreenWrapper scroll paddingBottom={60}>
      <ScreenHeader title="Privacy" back style={{ paddingBottom: 22 }} />
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{copy.analyticsTitle}</Text>
          <Text style={styles.rowBody}>{copy.analyticsBody}</Text>
        </View>
        <ToggleSwitch
          value={consent.analytics === 'granted'}
          onValueChange={(next) => { void save('analytics', next); }}
          disabled={!consent.loaded}
          accessibilityLabel={copy.analyticsTitle}
          accessibilityHint={copy.analyticsBody}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{copy.crashTitle}</Text>
          <Text style={styles.rowBody}>{copy.crashBody}</Text>
        </View>
        <ToggleSwitch
          value={consent.crash === 'granted'}
          onValueChange={(next) => { void save('crash', next); }}
          disabled={!consent.loaded}
          accessibilityLabel={copy.crashTitle}
          accessibilityHint={copy.crashBody}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{DIAGNOSTICS_CONSENT_TITLE}</Text>
          <Text style={styles.rowBody}>{DIAGNOSTICS_CONSENT_COPY}</Text>
        </View>
        <ToggleSwitch
          value={diagConsent.choice === 'granted'}
          onValueChange={(next) => { void saveDiagnostics(next); }}
          disabled={!diagConsent.loaded}
          accessibilityLabel={DIAGNOSTICS_CONSENT_TITLE}
          accessibilityHint={DIAGNOSTICS_CONSENT_COPY}
        />
      </View>
      <Text style={styles.footer}>{copy.identifiers}</Text>
      <Text style={styles.footer}>{copy.footer}</Text>
      <PrivacyPolicyLink />
      {getAnalyticsEnvironment() === 'qa' ? (
        // QA builds only: proves crash delivery and symbolication end to end. Needs crash reports switched on.
        <View style={styles.qa}>
          <Text style={styles.rowBody}>{debugCrashUnavailable
            ? 'Test crashes require a QA Release build on iOS. Crash reports remain controlled by your choice above.'
            : 'QA build · force a native crash to verify Crashlytics. Turn on Crash reports first.'}</Text>
          <CustomButton title="Send test crash" variant="outline" disabled={debugCrashUnavailable || consent.crash !== 'granted'} onPress={() => { crashReporter.testCrash(); }} fullWidth />
        </View>
      ) : null}
    </ScreenWrapper>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 16, color: theme.colors.text },
  rowBody: { fontFamily: theme.typography.fontFamily.regular, fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
  qa: { marginTop: 24, gap: 10 },
  footer: { fontFamily: theme.typography.fontFamily.regular, fontSize: 12, color: theme.colors.textSecondary, marginTop: 12 },
});
