import React, { useState } from 'react';
import {
    View,
    TextInput,
    Text,
    StyleSheet,
    TextInputProps,
    ViewStyle,
} from 'react-native';
import { theme } from '../theme';

interface CustomInputProps extends TextInputProps {
    label?: string;
    error?: string;
    containerStyle?: ViewStyle;
    icon?: string; // emoji / text glyph
}

/**
 * CustomInput — styled text input with label, focus border, and optional error/icon.
 * Background: #F8FAFC, focus border = primary color, min height 48px.
 */
export default function CustomInput({
    label,
    error,
    containerStyle,
    icon,
    style,
    ...rest
}: CustomInputProps) {
    const [focused, setFocused] = useState(false);

    return (
        <View style={[styles.container, containerStyle]}>
            {label ? <Text style={styles.label}>{label}</Text> : null}
            <View
                style={[
                    styles.inputWrapper,
                    focused && styles.inputFocused,
                    error ? styles.inputError : null,
                ]}
            >
                {icon ? <Text style={styles.icon}>{icon}</Text> : null}
                <TextInput
                    style={[styles.input, style]}
                    placeholderTextColor={theme.colors.textTertiary}
                    onFocus={(e) => {
                        setFocused(true);
                        rest.onFocus?.(e);
                    }}
                    onBlur={(e) => {
                        setFocused(false);
                        rest.onBlur?.(e);
                    }}
                    {...rest}
                />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 18,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        marginBottom: 8,
        marginLeft: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: theme.colors.border,
        paddingHorizontal: 16,
        minHeight: 52,
    },
    inputFocused: {
        borderColor: theme.colors.primary,
        backgroundColor: '#FFFFFF',
    },
    inputError: {
        borderColor: theme.colors.error,
    },
    icon: {
        fontSize: 18,
        marginRight: 10,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: theme.colors.text,
        paddingVertical: 12,
    },
    error: {
        fontSize: 12,
        color: theme.colors.error,
        marginTop: 4,
        marginLeft: 4,
    },
});
