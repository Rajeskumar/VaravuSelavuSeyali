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
    icon?: string;
}

/**
 * CustomInput — iOS Settings/App Store-style input field.
 * Uses the iOS inset grouped list aesthetic:
 * - White background, subtle border radius
 * - Blue cursor + border on focus
 * - No heavy outer shadow
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
                    placeholderTextColor={theme.colors.textQuaternary}
                    selectionColor={theme.colors.primary}
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
        marginBottom: 0,
    },
    label: {
        ...theme.typography.label,
        marginBottom: 6,
        marginLeft: 16,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.lg,
        borderWidth: 1,
        borderColor: theme.colors.borderLight,
        paddingHorizontal: 16,
        minHeight: 52,
    },
    inputFocused: {
        borderColor: theme.colors.primary,
        borderWidth: 1.5,
    },
    inputError: {
        borderColor: theme.colors.error,
        borderWidth: 1.5,
    },
    icon: {
        fontSize: 18,
        marginRight: 10,
        opacity: 0.7,
    },
    input: {
        flex: 1,
        fontFamily: theme.typography.fontFamily.regular,
        fontSize: 17,
        color: theme.colors.text,
        paddingVertical: 14,
    },
    error: {
        fontFamily: theme.typography.fontFamily.regular,
        fontSize: 13,
        color: theme.colors.error,
        marginTop: 6,
        marginLeft: 16,
    },
});
