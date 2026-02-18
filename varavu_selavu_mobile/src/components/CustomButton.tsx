import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ActivityIndicator,
    ViewStyle,
    TextStyle,
} from 'react-native';
import { theme } from '../theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

interface CustomButtonProps {
    title: string;
    onPress: () => void;
    variant?: ButtonVariant;
    loading?: boolean;
    disabled?: boolean;
    style?: ViewStyle;
    textStyle?: TextStyle;
    icon?: string; // emoji or text glyph
    fullWidth?: boolean;
}

/**
 * CustomButton — pill-shaped button with multiple variants.
 * Touch target is always ≥ 48px. Includes press feedback.
 */
export default function CustomButton({
    title,
    onPress,
    variant = 'primary',
    loading = false,
    disabled = false,
    style,
    textStyle,
    icon,
    fullWidth = true,
}: CustomButtonProps) {
    const isDisabled = disabled || loading;

    const buttonStyles: ViewStyle[] = [
        styles.base,
        fullWidth && styles.fullWidth,
        variantStyles[variant],
        isDisabled && styles.disabled,
        style,
    ].filter(Boolean) as ViewStyle[];

    const labelStyles: TextStyle[] = [
        styles.label,
        variantTextStyles[variant],
        textStyle,
    ].filter(Boolean) as TextStyle[];

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={isDisabled}
            activeOpacity={0.8}
            style={buttonStyles}
        >
            {loading ? (
                <ActivityIndicator
                    size="small"
                    color={variant === 'outline' || variant === 'ghost' ? theme.colors.primary : '#fff'}
                />
            ) : (
                <>
                    {icon ? <Text style={[styles.icon, variantTextStyles[variant]]}>{icon}</Text> : null}
                    <Text style={labelStyles}>{title}</Text>
                </>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    base: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 48,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 28,
        gap: 8,
    },
    fullWidth: {
        width: '100%',
    },
    disabled: {
        opacity: 0.5,
    },
    label: {
        fontSize: 16,
        fontWeight: '700',
    },
    icon: {
        fontSize: 18,
    },
});

const variantStyles: Record<ButtonVariant, ViewStyle> = {
    primary: {
        backgroundColor: theme.colors.primary,
        ...theme.shadows.md,
    },
    secondary: {
        backgroundColor: theme.colors.primarySurface,
    },
    outline: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: theme.colors.primary,
    },
    danger: {
        backgroundColor: theme.colors.error,
        ...theme.shadows.md,
    },
    ghost: {
        backgroundColor: 'transparent',
    },
};

const variantTextStyles: Record<ButtonVariant, TextStyle> = {
    primary: { color: '#FFFFFF' },
    secondary: { color: theme.colors.primary },
    outline: { color: theme.colors.primary },
    danger: { color: '#FFFFFF' },
    ghost: { color: theme.colors.primary },
};
