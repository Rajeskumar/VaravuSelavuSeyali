import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { AiUsage, AiFeatureUsage, formatResetTime } from '../api/aiUsage';

/** One-line "N of M questions left today" under an AI input, or why AI is unavailable —
 * mirrors web's components/common/AiQuotaNote.tsx. Renders nothing for unlimited users or
 * while usage is loading. */
export default function AiQuotaNote({ usage, feature }: { usage?: AiUsage; feature?: AiFeatureUsage }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (!usage) return null;
  let text: string | null = null;
  let isError = false;
  if (!usage.ai_enabled) {
    text = 'AI features are turned off right now.';
  } else if (usage.blocked) {
    text = "AI features aren't available on this account.";
  } else if (usage.requires_verified_email && !usage.email_verified) {
    text = 'Verify your email to use AI features — check your inbox for the link.';
  } else if (usage.paused) {
    text = 'AI is taking a break right now. Please try again later.';
  } else if (feature && feature.limit !== null && feature.remaining !== null) {
    if (feature.remaining <= 0) {
      text = `Daily limit reached. More questions at ${formatResetTime(usage.resets_at)}.`;
      isError = true;
    } else {
      text = `${feature.remaining} of ${feature.limit} questions left today`;
    }
  }
  if (!text) return null;
  return <Text style={[styles.note, isError && styles.error]}>{text}</Text>;
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  note: {
    fontFamily: 'InstrumentSans-Regular',
    fontSize: 11.5,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
  error: { color: theme.colors.error },
});
