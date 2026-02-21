import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

interface TabIconProps {
    icon: string;   // emoji or text glyph
    label: string;
    focused: boolean;
    isCenter?: boolean; // for the floating "Add" button
}

/**
 * TabIcon — custom tab bar icon with emoji glyphs.
 * Supports a special "center" variant for the floating Add FAB.
 */
export default function TabIcon({ icon, label, focused, isCenter = false }: TabIconProps) {
    if (isCenter) {
        return (
            <View style={styles.centerContainer}>
                <LinearGradient
                    colors={
                        focused
                            ? [theme.colors.primaryDark, theme.colors.primary]
                            : [theme.colors.primary, theme.colors.primaryLight]
                    }
                    style={styles.centerButton}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <Text style={styles.centerIcon}>{icon}</Text>
                </LinearGradient>
                <Text style={styles.centerLabel}>{label}</Text>
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
        minWidth: 56,
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
        top: -22,
    },
    centerButton: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
    },
    centerIcon: {
        fontSize: 28,
        color: '#fff',
    },
    centerLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: theme.colors.primary,
        marginTop: 4,
    },
});
