import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '../theme';

interface CardProps {
    children: React.ReactNode;
    style?: ViewStyle;
    noPadding?: boolean;
}

/**
 * Card — elevated white container with subtle shadow.
 * 16px border radius, 20px padding by default.
 */
export default function Card({ children, style, noPadding = false }: CardProps) {
    return (
        <View style={[styles.card, noPadding && styles.noPadding, style]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.lg,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    noPadding: {
        padding: 0,
    },
});
