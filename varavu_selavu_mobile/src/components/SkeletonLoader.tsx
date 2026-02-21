import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '../theme';

interface SkeletonProps {
    width?: number | string;
    height?: number;
    borderRadius?: number;
    style?: ViewStyle;
}

/**
 * Skeleton — pulsating placeholder for loading states.
 * Replaces ActivityIndicator for a more premium loading experience.
 */
function Skeleton({
    width = '100%',
    height = 20,
    borderRadius = 8,
    style,
}: SkeletonProps) {
    const opacity = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
            ]),
        );
        animation.start();
        return () => animation.stop();
    }, [opacity]);

    return (
        <Animated.View
            style={[
                styles.skeleton,
                { width: width as any, height, borderRadius, opacity },
                style,
            ]}
        />
    );
}

/** Pre-built skeleton for a dashboard hero card */
export function HeroSkeleton() {
    return (
        <View style={styles.heroContainer}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="70%" height={36} borderRadius={6} style={{ marginTop: 10 }} />
            <View style={styles.heroFooter}>
                <Skeleton width="40%" height={20} />
                <Skeleton width="40%" height={20} />
            </View>
        </View>
    );
}

/** Pre-built skeleton for a list of expense cards */
export function ListSkeleton({ count = 3 }: { count?: number }) {
    return (
        <View>
            {Array.from({ length: count }).map((_, i) => (
                <View key={i} style={styles.listItem}>
                    <Skeleton width={44} height={44} borderRadius={12} />
                    <View style={{ flex: 1, marginLeft: 14 }}>
                        <Skeleton width="60%" height={16} />
                        <Skeleton width="35%" height={12} style={{ marginTop: 6 }} />
                    </View>
                    <Skeleton width={60} height={18} />
                </View>
            ))}
        </View>
    );
}

export default Skeleton;

const styles = StyleSheet.create({
    skeleton: {
        backgroundColor: '#E2E8F0',
    },
    heroContainer: {
        backgroundColor: theme.colors.surface,
        borderRadius: 20,
        padding: 25,
        marginBottom: 25,
        ...theme.shadows.md,
    },
    heroFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 20,
        paddingTop: 15,
        borderTopWidth: 1,
        borderTopColor: theme.colors.borderLight,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        padding: 16,
        borderRadius: 14,
        marginBottom: 10,
        ...theme.shadows.sm,
    },
});
