import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAppTheme } from '../context/ThemeContext';
import { AppTheme } from '../theme';
import { getCardCoach } from '../api/cards';

interface Props {
  onPress: () => void;
}

/**
 * TS-CARD-111 mobile parity for web's CardCoachSummaryCard.tsx (TS-CARD-108, spec §9.2). Only
 * renders when there's a real gap to report (a default card is set AND a better held card
 * exists for some category) — no empty-state nudge here, AnalysisScreen's Cards tab already
 * owns onboarding.
 */
export default function CardCoachSummaryCard({ onPress }: Props) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const now = useMemo(() => new Date(), []);

  const { data: coach } = useQuery({
    queryKey: ['card-coach', now.getFullYear(), now.getMonth() + 1],
    queryFn: () => getCardCoach({ year: now.getFullYear(), month: now.getMonth() + 1 }),
  });

  if (!coach || coach.total_estimated_gap <= 0) return null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title}>
          You left an estimated ${coach.total_estimated_gap.toFixed(2)} in rewards on the table this month
        </Text>
        <Text style={styles.subtitle}>Ask about it →</Text>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.borderLight,
      borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13,
      marginHorizontal: 18, marginTop: 16, gap: 8,
    },
    title: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 14, color: theme.colors.text },
    subtitle: { fontFamily: 'InstrumentSans-SemiBold', fontSize: 11.5, color: theme.colors.primary, marginTop: 3 },
  });
