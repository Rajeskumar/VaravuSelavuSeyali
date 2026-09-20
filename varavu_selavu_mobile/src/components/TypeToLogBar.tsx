/**
 * TypeToLogBar.tsx — TrackSpense v3 Dashboard fast-entry bar. Thin wrapper around
 * `useQuickLogBar` — a pill text field that either saves directly (personal or group, clean
 * parse), routes to the AI Analyst tab (looks like a question), or falls back to the full Add
 * Expense sheet (unparseable, not a question).
 */
import React from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { AppTheme, withAlpha } from '../theme';
import { useQuickLogBar } from '../hooks/useQuickLogBar';

export default function TypeToLogBar() {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const { text, setText, parsed, isQuestion, submitting, submit } = useQuickLogBar();

  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={[withAlpha(theme.colors.gradientStart, 0.14), withAlpha(theme.colors.gradientEnd, 0.08)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.inputRow}
      >
        <View style={styles.dot} />
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder='Log or ask… "coffee 6.75 at Blue Bottle"'
          placeholderTextColor={theme.colors.textTertiary}
          returnKeyType="send"
          onSubmitEditing={submit}
          editable={!submitting}
        />
        {submitting && <ActivityIndicator size="small" color={theme.colors.primary} />}
      </LinearGradient>

      {parsed && (
        <View style={styles.previewRow}>
          <Text style={styles.previewText} numberOfLines={1}>
            Will log: ${parsed.amount.toFixed(2)} · {parsed.category}
            {parsed.merchant ? ` · ${parsed.merchant}` : ''}
            {parsed.groupName ? ` · ${parsed.groupName}` : parsed.splitRequested ? ' · no matching group' : ''}
          </Text>
        </View>
      )}

      {isQuestion && (
        <Text style={styles.hint}>Press send to ask the AI</Text>
      )}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    wrap: { marginBottom: 20 },
    // V2 ask bar: violet→cyan tint with a violet hairline — the one gradient-tinted surface on Home.
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 50,
      borderRadius: 16,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: withAlpha(theme.colors.gradientStart, 0.28),
      overflow: 'hidden',
    },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.gradientEnd, marginRight: 10 },
    input: {
      flex: 1,
      fontFamily: 'InstrumentSans-Medium',
      fontSize: 14,
      color: theme.colors.text,
    },
    previewRow: {
      marginTop: 8,
      paddingHorizontal: 4,
    },
    previewText: {
      fontFamily: 'InstrumentSans-SemiBold',
      fontSize: 12.5,
      color: theme.colors.primary,
    },
    hint: {
      marginTop: 6,
      marginLeft: 4,
      fontFamily: 'InstrumentSans-Regular',
      fontSize: 12,
      color: theme.colors.textTertiary,
    },
  });
