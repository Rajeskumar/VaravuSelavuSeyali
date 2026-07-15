/**
 * TypeToLogBar.tsx — TrackSpense v3 Dashboard fast-entry bar. Thin wrapper around
 * `useQuickLogBar` — a pill text field that either saves directly (personal or group, clean
 * parse), routes to the AI Analyst tab (looks like a question), or falls back to the full Add
 * Expense sheet (unparseable, not a question).
 */
import React from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { useQuickLogBar } from '../hooks/useQuickLogBar';

export default function TypeToLogBar() {
  const { theme } = useAppTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const { text, setText, parsed, isQuestion, submitting, submit } = useQuickLogBar();

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <Text style={styles.sparkle}>✨</Text>
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
      </View>

      {parsed && (
        <View style={styles.previewRow}>
          <Text style={styles.previewText} numberOfLines={1}>
            Will log: ${parsed.amount.toFixed(2)} · {parsed.category}
            {parsed.merchant ? ` · ${parsed.merchant}` : ''}
            {parsed.groupName ? ` · ${parsed.groupName}` : ''}
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
    wrap: { marginHorizontal: 20, marginBottom: 20 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderLight,
      ...theme.shadows.xs,
    },
    sparkle: { fontSize: 15, marginRight: 8 },
    input: {
      flex: 1,
      fontFamily: 'Inter-Regular',
      fontSize: 15,
      color: theme.colors.text,
    },
    previewRow: {
      marginTop: 8,
      paddingHorizontal: 4,
    },
    previewText: {
      fontFamily: 'Inter-SemiBold',
      fontSize: 12.5,
      color: theme.colors.primary,
    },
    hint: {
      marginTop: 6,
      marginLeft: 4,
      fontFamily: 'Inter-Regular',
      fontSize: 12,
      color: theme.colors.textTertiary,
    },
  });
