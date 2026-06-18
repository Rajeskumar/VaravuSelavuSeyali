import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '../theme';

interface CardProps {
    children: React.ReactNode;
    style?: ViewStyle;
    noPadding?: boolean;
    /** Use inset style — gray background, no shadow (for grouped list sections) */
    inset?: boolean;
}

/**
 * Card — iOS-style elevated white container.
 * Mimics premium card layouts: generous radius, diffused shadow, zero border.
 */
export default function Card({ children, style, noPadding = false, inset = false }: CardProps) {
    return (
        <View style={[styles.card, noPadding && styles.noPadding, inset && styles.inset, style]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.xl,
        padding: 20,
        marginBottom: 12,
        ...theme.shadows.sm,
    },
    noPadding: {
        padding: 0,
    },
    inset: {
        backgroundColor: theme.colors.surfaceSecondary,
        ...theme.shadows.xs,
    },
});
