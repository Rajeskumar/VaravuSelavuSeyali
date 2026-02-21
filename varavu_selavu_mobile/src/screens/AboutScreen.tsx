import React from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { theme } from '../theme';
import ScreenWrapper from '../components/ScreenWrapper';
import Card from '../components/Card';

export default function AboutScreen() {
    return (
        <ScreenWrapper scroll>
            {/* App Identity */}
            <View style={styles.hero}>
                <View style={styles.iconCircle}>
                    <Text style={styles.iconEmoji}>💰</Text>
                </View>
                <Text style={styles.appName}>Varavu Selavu</Text>
                <Text style={styles.tagline}>Smart Expense Tracking</Text>
                <View style={styles.versionBadge}>
                    <Text style={styles.versionText}>v1.0.0</Text>
                </View>
            </View>

            {/* About */}
            <Card>
                <Text style={styles.sectionTitle}>About</Text>
                <Text style={styles.body}>
                    Varavu Selavu is a comprehensive expense tracking application designed to help you manage your
                    personal finances with ease. Track daily expenses, analyze spending patterns with beautiful
                    charts, set up recurring expenses, and get AI-powered insights — all in one app.
                </Text>
            </Card>

            {/* Features */}
            <Card>
                <Text style={styles.sectionTitle}>Key Features</Text>
                {[
                    { icon: '📊', title: 'Visual Analytics', desc: 'Beautiful charts and category breakdowns' },
                    { icon: '🔁', title: 'Recurring Expenses', desc: 'Auto-track subscriptions and bills' },
                    { icon: '🤖', title: 'AI Analyst', desc: 'Ask questions about your spending' },
                    { icon: '📷', title: 'Receipt Scanner', desc: 'Snap a photo to add expenses instantly' },
                    { icon: '🔐', title: 'Secure', desc: 'Token-based auth with encrypted storage' },
                ].map((f) => (
                    <View key={f.title} style={styles.featureRow}>
                        <Text style={styles.featureIcon}>{f.icon}</Text>
                        <View style={styles.featureInfo}>
                            <Text style={styles.featureTitle}>{f.title}</Text>
                            <Text style={styles.featureDesc}>{f.desc}</Text>
                        </View>
                    </View>
                ))}
            </Card>

            {/* Developer Info */}
            <Card>
                <Text style={styles.sectionTitle}>Developer</Text>
                <Text style={styles.body}>
                    Built with ❤️ using React Native, Expo, and FastAPI.
                </Text>
                <Text style={[styles.body, { marginTop: 4, color: theme.colors.textTertiary }]}>
                    © {new Date().getFullYear()} Varavu Selavu. All rights reserved.
                </Text>
            </Card>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    hero: {
        alignItems: 'center',
        paddingVertical: 32,
        marginBottom: 8,
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 24,
        backgroundColor: theme.colors.primarySurface,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        ...theme.shadows.md,
    },
    iconEmoji: { fontSize: 36 },
    appName: {
        fontSize: 28,
        fontWeight: '800',
        color: theme.colors.text,
        letterSpacing: -0.5,
    },
    tagline: {
        fontSize: 15,
        color: theme.colors.textSecondary,
        marginTop: 4,
    },
    versionBadge: {
        marginTop: 12,
        backgroundColor: theme.colors.primarySurface,
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
    },
    versionText: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.primary,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: theme.colors.text,
        marginBottom: 12,
    },
    body: {
        fontSize: 15,
        lineHeight: 22,
        color: theme.colors.textSecondary,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
    },
    featureIcon: { fontSize: 24, marginRight: 14 },
    featureInfo: { flex: 1 },
    featureTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
    featureDesc: { fontSize: 13, color: theme.colors.textTertiary, marginTop: 1 },
});
