import React from 'react';
import { View, ScrollView, StyleSheet, Platform, StatusBar, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

interface ScreenWrapperProps {
    children: React.ReactNode;
    scroll?: boolean;
    style?: ViewStyle;
    contentStyle?: ViewStyle;
    paddingBottom?: number;
}

/**
 * ScreenWrapper — consistent safe area container for all screens.
 * Provides proper top inset handling, background color, and optional scrolling.
 */
export default function ScreenWrapper({
    children,
    scroll = false,
    style,
    contentStyle,
    paddingBottom = 100,
}: ScreenWrapperProps) {
    const containerStyle = [styles.container, style];

    if (scroll) {
        return (
            <LinearGradient colors={['#F6F7FB', '#EEF2FF']} style={containerStyle}>
                <ScrollView
                    contentContainerStyle={[styles.content, { paddingBottom }, contentStyle]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {children}
                </ScrollView>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={['#F6F7FB', '#EEF2FF']} style={[containerStyle, styles.content, contentStyle]}>
            {children}
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 40) + 8 : 56,
    },
    content: {
        paddingHorizontal: 20,
    },
});
