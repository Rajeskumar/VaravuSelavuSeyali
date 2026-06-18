import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface TabIconProps {
    icon: string;
    label: string;
    focused: boolean;
}

/**
 * TabIcon — standard tab bar style.
 * Icon-only when unfocused. Filled icon + color when focused.
 * Small label only shown when focused.
 */
export default function TabIcon({ icon, label, focused }: TabIconProps) {
    return (
        <View style={styles.container}>
            <Text style={[styles.icon, focused && styles.iconFocused]}>
                {icon}
            </Text>
            <Text style={[styles.label, focused && styles.labelFocused]}>
                {label}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 4,
        minWidth: 48,
    },
    icon: {
        fontSize: 24,
        opacity: 0.4,
    },
    iconFocused: {
        opacity: 1,
    },
    label: {
        fontSize: 10,
        fontFamily: 'Inter-Medium',
        color: theme.colors.textTertiary,
        marginTop: 3,
        opacity: 0,  // hidden when not focused
    },
    labelFocused: {
        opacity: 1,
        color: theme.colors.primary,
        fontFamily: 'Inter-SemiBold',
    },
});
