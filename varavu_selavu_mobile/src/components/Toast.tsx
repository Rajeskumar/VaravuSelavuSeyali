import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Animated, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastConfig {
    message: string;
    type?: ToastType;
    duration?: number;
}

interface ToastRef {
    show: (config: ToastConfig) => void;
}

// Singleton pattern — use Toast.show() from anywhere
let toastRef: ToastRef | null = null;

export function showToast(config: ToastConfig) {
    toastRef?.show(config);
}

const createToastMeta = (theme: AppTheme): Record<ToastType, { bg: string; icon: string }> => ({
    success: { bg: theme.colors.successSurface, icon: '✓' },
    error: { bg: theme.colors.errorSurface, icon: '✕' },
    warning: { bg: theme.colors.warningSurface, icon: '⚠' },
    info: { bg: theme.colors.primarySurface, icon: 'ℹ' },
});

const createToastTextColor = (theme: AppTheme): Record<ToastType, string> => ({
    success: theme.colors.success,
    error: theme.colors.error,
    warning: theme.colors.warning,
    info: theme.colors.primary,
});

/**
 * Toast — animated slide-in notification.
 * Place <ToastProvider /> once in your App root (inside NavigationContainer).
 * Then call showToast({ message: '...', type: 'success' }) from anywhere.
 */
export default function ToastProvider() {
    const { theme } = useAppTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const toastMeta = useMemo(() => createToastMeta(theme), [theme]);
    const toastTextColor = useMemo(() => createToastTextColor(theme), [theme]);
    const [visible, setVisible] = useState(false);
    const [config, setConfig] = useState<ToastConfig>({ message: '', type: 'success' });
    const translateY = useRef(new Animated.Value(-100)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const hide = useCallback(() => {
        Animated.parallel([
            Animated.timing(translateY, { toValue: -100, duration: 250, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start(() => setVisible(false));
    }, [translateY, opacity]);

    const show = useCallback(
        (cfg: ToastConfig) => {
            if (timerRef.current) clearTimeout(timerRef.current);
            setConfig(cfg);
            setVisible(true);

            Animated.parallel([
                Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 60, friction: 8 }),
                Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();

            timerRef.current = setTimeout(hide, cfg.duration || 3000);
        },
        [translateY, opacity, hide],
    );

    useEffect(() => {
        toastRef = { show };
        return () => {
            toastRef = null;
        };
    }, [show]);

    if (!visible) return null;

    const type = config.type || 'success';
    const meta = toastMeta[type];

    return (
        <Animated.View
            style={[
                styles.container,
                { backgroundColor: meta.bg, transform: [{ translateY }], opacity },
            ]}
        >
            <TouchableOpacity style={styles.inner} onPress={hide} activeOpacity={0.9}>
                <Text style={[styles.icon, { color: toastTextColor[type] }]}>{meta.icon}</Text>
                <Text style={[styles.message, { color: toastTextColor[type] }]} numberOfLines={2}>
                    {config.message}
                </Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    container: {
        position: 'absolute',
        top: 60,
        left: 20,
        right: 20,
        borderRadius: 14,
        zIndex: 9999,
        ...theme.shadows.lg,
    },
    inner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 16,
        gap: 12,
    },
    icon: {
        fontSize: 18,
        fontWeight: '800',
    },
    message: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        lineHeight: 20,
    },
});
