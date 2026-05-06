import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { TrainingColors } from '@/features/training/ui-theme';

type TrainingHeroProps = {
  sessionId: string | null;
  stats: {
    totalScore: number;
    totalAttempts: number;
    accuracy: number;
    correctStreak: number;
    incorrectStreak: number;
  };
};

function getPosture(accuracy: number): { label: string; color: string } {
  if (accuracy >= 75) {
    return { label: 'POSTURE: STABLE', color: TrainingColors.accentTeal };
  }
  if (accuracy >= 45) {
    return { label: 'POSTURE: WATCH', color: TrainingColors.accentAmber };
  }
  return { label: 'POSTURE: CRITICAL', color: TrainingColors.accentDanger };
}

export function TrainingHero({ sessionId, stats }: TrainingHeroProps) {
  const posture = getPosture(stats.accuracy);

  return (
    <>
      <View style={styles.heroCard}>
        <View style={styles.scanlineTop} />

        <View style={styles.heroHeaderRow}>
          <View>
            <ThemedText style={styles.kicker}>SECURITY TRAINING CONSOLE</ThemedText>
            <ThemedText type="title" style={styles.heroTitle}>
              Cyber Shield Ops
            </ThemedText>
          </View>
          <View style={styles.badgeWrap}>
            <ThemedText style={styles.badgeText}>ADAPTIVE AI</ThemedText>
          </View>
        </View>

        <ThemedText style={styles.heroSubtitle}>
          Simuleaza atacuri de social engineering si creste rezilienta operationala prin iteratii adaptive.
        </ThemedText>

        <View style={styles.heroMetaRow}>
          <ThemedText style={[styles.postureText, { color: posture.color }]}>{posture.label}</ThemedText>
          <ThemedText style={styles.heroSessionText}>
            SESSION {sessionId ? sessionId.slice(0, 8).toUpperCase() : 'NEW'}
          </ThemedText>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricTile}>
          <ThemedText style={styles.metricLabel}>TOTAL SCORE</ThemedText>
          <ThemedText style={styles.metricValue}>{stats.totalScore}</ThemedText>
        </View>
        <View style={styles.metricTile}>
          <ThemedText style={styles.metricLabel}>ACCURACY</ThemedText>
          <ThemedText style={styles.metricValue}>{stats.accuracy}%</ThemedText>
        </View>
        <View style={styles.metricTile}>
          <ThemedText style={styles.metricLabel}>SCENARIOS</ThemedText>
          <ThemedText style={styles.metricValue}>{stats.totalAttempts}</ThemedText>
        </View>
        <View style={styles.metricTile}>
          <ThemedText style={styles.metricLabel}>STREAK</ThemedText>
          <ThemedText style={styles.metricValue}>+{stats.correctStreak} / -{stats.incorrectStreak}</ThemedText>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    gap: 10,
    borderRadius: 16,
    padding: 16,
    backgroundColor: TrainingColors.panel,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    overflow: 'hidden',
  },
  scanlineTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 2,
    backgroundColor: TrainingColors.accentBlue,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  kicker: {
    color: TrainingColors.textMuted,
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: Fonts.mono,
  },
  heroTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 30,
    lineHeight: 32,
    fontFamily: Fonts.rounded,
  },
  badgeWrap: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.45)',
    backgroundColor: 'rgba(69, 224, 177, 0.12)',
    marginTop: 2,
  },
  badgeText: {
    color: TrainingColors.accentTeal,
    fontSize: 11,
    fontFamily: Fonts.mono,
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  heroSubtitle: {
    color: TrainingColors.textSecondary,
  },
  heroMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  postureText: {
    fontSize: 12,
    fontFamily: Fonts.mono,
    letterSpacing: 1,
    fontWeight: '700',
  },
  heroSessionText: {
    color: TrainingColors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.mono,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricTile: {
    width: '48%',
    minHeight: 86,
    borderRadius: 14,
    padding: 12,
    backgroundColor: TrainingColors.panelAlt,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    justifyContent: 'center',
    gap: 6,
  },
  metricLabel: {
    color: TrainingColors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: Fonts.mono,
  },
  metricValue: {
    color: TrainingColors.textPrimary,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '800',
    fontFamily: Fonts.rounded,
  },
});
