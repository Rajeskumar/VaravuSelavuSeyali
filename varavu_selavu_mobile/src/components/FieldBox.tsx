import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TextInputProps, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, withAlpha } from '../theme';
import SectionLabel from './SectionLabel';

interface FieldBoxProps extends TextInputProps {
  label: string;
  /** Password fields get a "Show / Hide" toggle on the right. */
  secureToggle?: boolean;
  /** Inline validation message shown under the box (and turns the border red). */
  error?: string;
}

/** V2 form field: 16px-radius hairline box, mono uppercase label over a 16px semibold value. */
export default function FieldBox({ label, secureToggle, secureTextEntry, style, onFocus, onBlur, error, ...rest }: FieldBoxProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const isSecure = secureToggle ? hidden : secureTextEntry;

  return (
    <View>
    <View style={[styles.box, focused && styles.boxFocused, !!error && styles.boxError]}>
      <View style={{ flex: 1 }}>
        <SectionLabel style={{ letterSpacing: 1.5 }}>{label}</SectionLabel>
        <TextInput
          {...rest}
          secureTextEntry={isSecure}
          style={[styles.input, style]}
          placeholderTextColor={theme.colors.textQuaternary}
          selectionColor={theme.colors.primary}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        />
      </View>
      {secureToggle ? (
        <TouchableOpacity onPress={() => setHidden((h) => !h)} hitSlop={8} accessibilityRole="button" accessibilityLabel={hidden ? 'Show password' : 'Hide password'}>
          <Text style={styles.toggle}>{hidden ? 'Show' : 'Hide'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
    {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  box: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: theme.colors.surface,
  },
  boxFocused: { borderColor: withAlpha(theme.colors.primary, 0.7) },
  boxError: { borderColor: theme.colors.error },
  error: { fontFamily: theme.typography.fontFamily.medium, fontSize: 12.5, color: theme.colors.error, marginTop: 6, marginLeft: 4 },
  input: {
    fontFamily: theme.typography.fontFamily.semiBold, fontSize: 16, color: theme.colors.text,
    marginTop: 4, padding: 0,
  },
  toggle: { fontFamily: theme.typography.fontFamily.semiBold, fontSize: 13, color: theme.colors.primary },
});
