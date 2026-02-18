import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

interface TabIconProps {
    icon: string;   // emoji or text glyph
    label: string;
    focused: boolean;
    isCenter?: boolean; // for the floating "Add" button
}

/**
 * TabIcon — custom tab bar icon with emoji glyphs.
 * Supports a special "center" variant for the floating Add button.
 */
export default function TabIcon({ icon, label, focused, isCenter = false }: TabIconProps) {
    if (isCenter) {
        return (
            <View style={styles.centerContainer}>
                <View style={[styles.centerButton, focused && styles.centerButtonActive]}>
                    <Text style={styles.centerIcon}>{icon}</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={[styles.icon, focused && styles.iconFocused]}>{icon}</Text>
            <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
            {focused && <View style={styles.dot} />}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 6,
        minWidth: 48,
        minHeight: 44,
    },
    icon: {
        fontSize: 22,
        opacity: 0.5,
    },
    iconFocused: {
        opacity: 1,
    },
    label: {
        fontSize: 10,
        fontWeight: '600',
        color: theme.colors.textTertiary,
        marginTop: 2,
    },
    labelFocused: {
        color: theme.colors.primary,
        fontWeight: '700',
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.colors.primary,
        marginTop: 3,
    },
    centerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        top: -18,
    },
    centerButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: theme.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 8,
    },
    centerButtonActive: {
        backgroundColor: theme.colors.primaryDark,
    },
    centerIcon: {
        fontSize: 26,
        color: '#fff',
    },
});
