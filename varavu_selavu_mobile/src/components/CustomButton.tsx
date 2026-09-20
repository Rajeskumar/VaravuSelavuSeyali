import React, { useMemo } from 'react';
import {
    Text,
    StyleSheet,
    ActivityIndicator,
    ViewStyle,
    TextStyle,
    StyleProp,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme, inkOnPastel } from '../theme';
import AnimatedPressable from './AnimatedPressable';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'tinted';

interface CustomButtonProps {
    title: string;
    onPress: () => void;
    variant?: ButtonVariant;
    loading?: boolean;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
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

    const content = loading ? (
        <ActivityIndicator
            size="small"
            color={variant === 'primary' ? inkOnPastel : variant === 'danger' ? theme.colors.textInverse : theme.colors.primary}
        />
    ) : (
        <>
            {icon ? <Text style={[styles.icon, variantTextStyles[variant]]}>{icon}</Text> : null}
            <Text style={labelStyles}>{title}</Text>
        </>
    );

    // Primary: the gradient must be the element that carries the padding. AnimatedPressable wraps
    // its children in an inner view, so an absolute-fill gradient only ever covered that inner
    // (already padded-in) box — a small patch inside a dark pill. Padding moves onto the gradient.
    if (variant === 'primary') {
        return (
            <AnimatedPressable
                onPress={onPress}
                disabled={isDisabled}
                style={[buttonStyles, styles.primaryShell]}
            >
                <LinearGradient
                    colors={theme.gradients.primary}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryFill}
                >
                    {content}
                </LinearGradient>
            </AnimatedPressable>
        );
    }

    return (
        <AnimatedPressable
            onPress={onPress}
            disabled={isDisabled}
            style={buttonStyles}
        >
            {content}
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
    primaryShell: {
        paddingVertical: 0,
        paddingHorizontal: 0,
    },
    primaryFill: {
        width: '100%',
        minHeight: 50,
        paddingVertical: 14,
        paddingHorizontal: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
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
        overflow: 'hidden',
        ...theme.shadows.fab,
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

// `primary`'s fill is the mode-independent pastel gradient — always wants ink, not the
// mode-aware `textInverse` (which would go white-on-pastel in light mode, ~2.6:1, failing AA).
// `danger`'s fill (`colors.error`) is mode-aware itself, so `textInverse` correctly flips with it.
const createVariantTextStyles = (theme: AppTheme): Record<ButtonVariant, TextStyle> => ({
    primary: { color: inkOnPastel },
    tinted: { color: theme.colors.primary },
    secondary: { color: theme.colors.text },
    outline: { color: theme.colors.primary },
    danger: { color: theme.colors.textInverse },
    ghost: { color: theme.colors.primary },
});
