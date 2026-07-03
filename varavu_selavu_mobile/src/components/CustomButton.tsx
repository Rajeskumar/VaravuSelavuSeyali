import React, { useMemo } from 'react';
import {
    Text,
    StyleSheet,
    ActivityIndicator,
    ViewStyle,
    TextStyle,
} from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import AnimatedPressable from './AnimatedPressable';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'tinted';

interface CustomButtonProps {
    title: string;
    onPress: () => void;
    variant?: ButtonVariant;
    loading?: boolean;
    disabled?: boolean;
    style?: ViewStyle;
    textStyle?: TextStyle;
    icon?: string;
    fullWidth?: boolean;
}

/**
 * CustomButton — iOS-style system button.
 * Primary: filled blue pill.
 * Tinted: blue-tinted surface (like standard tinted button).
 * Secondary: gray pill.
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
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const variantStyles = useMemo(() => createVariantStyles(theme), [theme]);
    const variantTextStyles = useMemo(() => createVariantTextStyles(theme), [theme]);
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
        <AnimatedPressable
            onPress={onPress}
            disabled={isDisabled}
            style={buttonStyles}
        >
            {loading ? (
                <ActivityIndicator
                    size="small"
                    color={variant === 'primary' || variant === 'danger' ? '#fff' : theme.colors.primary}
                />
            ) : (
                <>
                    {icon ? <Text style={[styles.icon, variantTextStyles[variant]]}>{icon}</Text> : null}
                    <Text style={labelStyles}>{title}</Text>
                </>
            )}
        </AnimatedPressable>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    base: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 50,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: theme.borderRadius.full,
        gap: 8,
    },
    fullWidth: {
        width: '100%',
    },
    disabled: {
        opacity: 0.4,
    },
    label: {
        fontFamily: theme.typography.fontFamily.semiBold,
        fontSize: 17,
        letterSpacing: -0.2,
    },
    icon: {
        fontSize: 18,
    },
});

const createVariantStyles = (theme: AppTheme): Record<ButtonVariant, ViewStyle> => ({
    primary: {
        backgroundColor: theme.colors.primary,
        ...theme.shadows.sm,
    },
    tinted: {
        backgroundColor: theme.colors.primarySurface,
    },
    secondary: {
        backgroundColor: theme.colors.surfaceSecondary,
    },
    outline: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: theme.colors.primary,
    },
    danger: {
        backgroundColor: theme.colors.error,
    },
    ghost: {
        backgroundColor: 'transparent',
    },
});

const createVariantTextStyles = (theme: AppTheme): Record<ButtonVariant, TextStyle> => ({
    primary: { color: '#FFFFFF' },
    tinted: { color: theme.colors.primary },
    secondary: { color: theme.colors.text },
    outline: { color: theme.colors.primary },
    danger: { color: '#FFFFFF' },
    ghost: { color: theme.colors.primary },
});
