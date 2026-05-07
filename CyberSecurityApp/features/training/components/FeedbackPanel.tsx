import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { getAccuracyFillColor, TrainingColors } from '@/features/training/ui-theme';
import type { AttackType, AttackStats, Evaluation, Scenario } from '@/features/training/types';

type FeedbackPanelProps = {
  evaluation: Evaluation;
  scenario: Scenario;
  perAttackStats: Array<{
    id: AttackType;
    label: string;
    value?: AttackStats | undefined;
  }>;
  onRunCurrentSelection: () => void;
  onRunRecommendedScenario: () => void;
};

export function FeedbackPanel({
  evaluation,
  scenario,
  perAttackStats,
  onRunCurrentSelection,
  onRunRecommendedScenario,
}: FeedbackPanelProps) {
  const resultLabel = evaluation.is_correct ? 'RĂSPUNS LA AMENINȚARE: REUȘIT' : 'RĂSPUNS LA AMENINȚARE: EȘUAT';

  return (
    <View style={styles.feedbackCard}>
      <View
        style={[
          styles.resultBanner,
          evaluation.is_correct ? styles.resultBannerSuccess : styles.resultBannerFail,
        ]}>
        <ThemedText style={styles.resultBannerText}>
          {resultLabel} | DELTA SCOR {evaluation.score_delta > 0 ? `+${evaluation.score_delta}` : evaluation.score_delta}
        </ThemedText>
      </View>

      <ThemedText style={styles.feedbackText}>{evaluation.explanation}</ThemedText>

      <View style={styles.recommendationCard}>
        <ThemedText type="defaultSemiBold" style={styles.blockTitle}>
          Directivă adaptivă
        </ThemedText>
        <ThemedText style={styles.recommendationMeta}>
          MISIUNEA URMĂTOARE: {evaluation.recommendation.attack_type.toUpperCase()} | {evaluation.recommendation.difficulty.toUpperCase()}
        </ThemedText>
        <ThemedText style={styles.recommendationReason}>{evaluation.recommendation.reason}</ThemedText>
      </View>

      <View style={styles.attackStatsCard}>
        <ThemedText type="defaultSemiBold" style={styles.blockTitle}>
          Performanță pe suprafața de atac
        </ThemedText>
        {perAttackStats.map((item) => {
          const accuracy = item.value?.accuracy ?? 0;
          const attempts = item.value?.attempts ?? 0;

          return (
            <View key={item.id} style={styles.attackRow}>
              <View style={styles.attackRowHeader}>
                <ThemedText style={styles.attackRowTitle}>{item.label}</ThemedText>
                <ThemedText style={styles.attackRowValue}>
                  {accuracy}% / {attempts} rulări
                </ThemedText>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${accuracy}%`,
                      backgroundColor: getAccuracyFillColor(accuracy),
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.redFlagsCard}>
        <ThemedText type="defaultSemiBold" style={styles.blockTitle}>
          Red flags detectate
        </ThemedText>
        {scenario.red_flags.map((flag) => (
          <View key={flag} style={styles.redFlagItem}>
            <View style={styles.redFlagDot} />
            <ThemedText style={styles.redFlagText}>{flag}</ThemedText>
          </View>
        ))}
      </View>

      <Pressable style={styles.secondaryButton} onPress={onRunCurrentSelection}>
        <ThemedText type="defaultSemiBold" style={styles.secondaryButtonText}>
          Repetă profilul curent
        </ThemedText>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={onRunRecommendedScenario}>
        <ThemedText type="defaultSemiBold" style={styles.secondaryButtonText}>
          Rulează profilul recomandat
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  blockTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 18,
    fontFamily: Fonts.rounded,
  },
  feedbackCard: {
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: TrainingColors.panel,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
  },
  resultBanner: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  resultBannerSuccess: {
    backgroundColor: TrainingColors.successBg,
    borderColor: 'rgba(69, 224, 177, 0.45)',
  },
  resultBannerFail: {
    backgroundColor: TrainingColors.failBg,
    borderColor: 'rgba(255, 125, 125, 0.45)',
  },
  resultBannerText: {
    color: TrainingColors.textPrimary,
    fontWeight: '700',
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  feedbackText: {
    color: TrainingColors.textSecondary,
  },
  recommendationCard: {
    gap: 6,
    borderRadius: 12,
    padding: 10,
    backgroundColor: TrainingColors.panelAlt,
    borderWidth: 1,
    borderColor: TrainingColors.border,
  },
  recommendationMeta: {
    color: '#A8CBFF',
    fontWeight: '700',
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  recommendationReason: {
    color: TrainingColors.textSecondary,
  },
  attackStatsCard: {
    gap: 8,
    borderRadius: 12,
    padding: 10,
    backgroundColor: TrainingColors.panelAlt,
    borderWidth: 1,
    borderColor: TrainingColors.border,
  },
  attackRow: {
    gap: 6,
  },
  attackRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  attackRowTitle: {
    color: TrainingColors.textPrimary,
    fontWeight: '600',
  },
  attackRowValue: {
    color: TrainingColors.textMuted,
    fontSize: 12,
    fontFamily: Fonts.mono,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#22314F',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  redFlagsCard: {
    gap: 6,
    borderRadius: 12,
    padding: 10,
    backgroundColor: TrainingColors.panelAlt,
    borderWidth: 1,
    borderColor: 'rgba(255, 125, 125, 0.35)',
  },
  redFlagItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  redFlagDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: TrainingColors.accentDanger,
    marginTop: 8,
  },
  redFlagText: {
    flex: 1,
    color: '#FFD0D0',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: TrainingColors.buttonSecondary,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
  },
  secondaryButtonText: {
    color: '#CFE2FF',
    fontFamily: Fonts.mono,
    letterSpacing: 0.7,
  },
});
