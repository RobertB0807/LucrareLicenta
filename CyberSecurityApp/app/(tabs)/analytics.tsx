import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TrainingColors, getAccuracyFillColor } from '@/features/training/ui-theme';
import { ATTACK_TYPE_OPTIONS, getDifficultyLabel } from '@/features/training/options';
import { useTrainingSession } from '@/features/training/useTrainingSession';

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricHint}>{hint}</Text>
    </View>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

export default function AnalyticsScreen() {
  const { activityLog, evaluation, perAttackStats, runRecommendedScenario, resetSession, scenario, stats } =
    useTrainingSession();

  const accuracyColor = getAccuracyFillColor(stats.accuracy);
  const activeAttack = ATTACK_TYPE_OPTIONS.find((option) => option.id === scenario?.attack_type);
  const currentDifficulty = scenario ? getDifficultyLabel(scenario.difficulty) : 'No active mission';
  const recommendation = evaluation?.recommendation;

  return (
    <View style={styles.screen}>
      <View style={styles.backgroundGlow} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Live analytics</Text>
          <Text style={styles.heroTitle}>Training telemetry in real time</Text>
          <Text style={styles.heroCopy}>
            The dashboard stays in sync with the training flow, so every generated scenario,
            answer, and score update is reflected here immediately.
          </Text>

          <View style={styles.heroPillsRow}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillLabel}>Session score</Text>
              <Text style={styles.heroPillValue}>{stats.totalScore}</Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillLabel}>Active mission</Text>
              <Text style={styles.heroPillValue}>{activeAttack?.shortLabel ?? 'Idle'}</Text>
            </View>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillLabel}>Difficulty</Text>
              <Text style={styles.heroPillValue}>{currentDifficulty}</Text>
            </View>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <MetricCard label="Accuracy" value={`${Math.round(stats.accuracy)}%`} hint="Live response quality" />
          <MetricCard label="Attempts" value={String(stats.totalAttempts)} hint="Scenarios completed" />
          <MetricCard label="Correct streak" value={String(stats.correctStreak)} hint="Consecutive successes" />
          <MetricCard label="Alert streak" value={String(stats.incorrectStreak)} hint="Consecutive misses" />
        </View>

        <SectionCard
          title="Attack surface performance"
          subtitle="How the learner behaves across each simulated attack type">
          <View style={styles.attackList}>
            {perAttackStats.map((attack) => {
              const accuracy = attack.value?.accuracy ?? 0;
              const attempts = attack.value?.attempts ?? 0;
              const correct = attack.value?.correct ?? 0;
              const width = Math.max(8, accuracy);

              return (
                <View key={attack.id} style={styles.attackRow}>
                  <View style={styles.attackHeaderRow}>
                    <Text style={styles.attackLabel}>{attack.label}</Text>
                    <Text style={[styles.attackAccuracy, { color: getAccuracyFillColor(accuracy) }]}>
                      {Math.round(accuracy)}%
                    </Text>
                  </View>
                  <View style={styles.attackBarTrack}>
                    <View
                      style={[
                        styles.attackBarFill,
                        {
                          width: `${width}%`,
                          backgroundColor: getAccuracyFillColor(accuracy),
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.attackMeta}>
                    {correct}/{attempts} correct responses
                  </Text>
                </View>
              );
            })}
          </View>
        </SectionCard>

        <SectionCard
          title="Current mission snapshot"
          subtitle="The latest active scenario and the recommendation generated by the backend">
          {scenario ? (
            <View style={styles.snapshotBlock}>
              <View style={styles.snapshotRow}>
                <Text style={styles.snapshotLabel}>Channel</Text>
                <Text style={styles.snapshotValue}>{scenario.channel}</Text>
              </View>
              <View style={styles.snapshotRow}>
                <Text style={styles.snapshotLabel}>Attack type</Text>
                <Text style={styles.snapshotValue}>{activeAttack?.label ?? scenario.attack_type}</Text>
              </View>
              <View style={styles.snapshotRow}>
                <Text style={styles.snapshotLabel}>Difficulty</Text>
                <Text style={styles.snapshotValue}>{getDifficultyLabel(scenario.difficulty)}</Text>
              </View>
              <View style={styles.snapshotRow}>
                <Text style={styles.snapshotLabel}>Red flags</Text>
                <Text style={styles.snapshotValue}>{scenario.red_flags.length}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No active scenario yet</Text>
              <Text style={styles.emptyStateCopy}>
                Launch a mission from the Home tab to see this analytics panel populate with live
                telemetry.
              </Text>
            </View>
          )}

          <View style={styles.recommendationCard}>
            <Text style={styles.recommendationTitle}>Adaptive recommendation</Text>
            <Text style={styles.recommendationCopy}>
              {recommendation
                ? `${recommendation.attack_type} on ${getDifficultyLabel(recommendation.difficulty)}. ${recommendation.reason}`
                : 'Complete a scenario to receive an adaptive next-step recommendation.'}
            </Text>
          </View>
        </SectionCard>

        <SectionCard
          title="Live activity feed"
          subtitle="A compact timeline of the most recent in-app events">
          {activityLog.length > 0 ? (
            <View style={styles.activityList}>
              {activityLog.map((entry) => (
                <View key={entry.id} style={styles.activityItem}>
                  <View
                    style={[
                      styles.activityTone,
                      entry.tone === 'good' && styles.activityToneGood,
                      entry.tone === 'warning' && styles.activityToneWarning,
                    ]}
                  />
                  <View style={styles.activityBody}>
                    <Text style={styles.activityTitle}>{entry.title}</Text>
                    <Text style={styles.activityDetail}>{entry.detail}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyFeedCopy}>
              The feed will fill as soon as you start generating scenarios or evaluating answers.
            </Text>
          )}
        </SectionCard>

        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButton} onPress={resetSession}>
            <Text style={styles.secondaryButtonText}>Reset session</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={runRecommendedScenario}>
            <Text style={styles.primaryButtonText}>Launch recommendation</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: TrainingColors.pageBase,
  },
  backgroundGlow: {
    position: 'absolute',
    top: -80,
    right: -70,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(88, 166, 255, 0.16)',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  heroCard: {
    borderRadius: 28,
    backgroundColor: TrainingColors.panel,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroEyebrow: {
    color: TrainingColors.accentTeal,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 12,
    fontWeight: '800',
  },
  heroTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  heroCopy: {
    color: TrainingColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  heroPillsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  heroPill: {
    flexGrow: 1,
    minWidth: 100,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: TrainingColors.panelAlt,
    borderWidth: 1,
    borderColor: TrainingColors.border,
  },
  heroPillLabel: {
    color: TrainingColors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  heroPillValue: {
    color: TrainingColors.textPrimary,
    marginTop: 6,
    fontSize: 18,
    fontWeight: '800',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    width: '48%',
    borderRadius: 22,
    backgroundColor: TrainingColors.panelAlt,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    padding: 16,
    gap: 6,
  },
  metricLabel: {
    color: TrainingColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 11,
    fontWeight: '700',
  },
  metricValue: {
    color: TrainingColors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
  },
  metricHint: {
    color: TrainingColors.textSecondary,
    fontSize: 12,
  },
  sectionCard: {
    borderRadius: 28,
    backgroundColor: TrainingColors.panel,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    padding: 18,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: TrainingColors.textSecondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  attackList: {
    gap: 14,
  },
  attackRow: {
    gap: 8,
  },
  attackHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attackLabel: {
    color: TrainingColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  attackAccuracy: {
    fontSize: 13,
    fontWeight: '800',
  },
  attackBarTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: TrainingColors.panelSoft,
    overflow: 'hidden',
  },
  attackBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  attackMeta: {
    color: TrainingColors.textMuted,
    fontSize: 12,
  },
  snapshotBlock: {
    gap: 10,
  },
  snapshotRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 20,
  },
  snapshotLabel: {
    color: TrainingColors.textMuted,
    fontSize: 13,
  },
  snapshotValue: {
    color: TrainingColors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  emptyState: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: TrainingColors.panelAlt,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    gap: 8,
  },
  emptyStateTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyStateCopy: {
    color: TrainingColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  recommendationCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'rgba(69, 224, 177, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.22)',
    gap: 8,
  },
  recommendationTitle: {
    color: TrainingColors.accentTeal,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  recommendationCopy: {
    color: TrainingColors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  activityList: {
    gap: 12,
  },
  activityItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  activityTone: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 4,
    backgroundColor: TrainingColors.textMuted,
  },
  activityToneGood: {
    backgroundColor: TrainingColors.accentTeal,
  },
  activityToneWarning: {
    backgroundColor: TrainingColors.accentAmber,
  },
  activityBody: {
    flex: 1,
    gap: 3,
  },
  activityTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  activityDetail: {
    color: TrainingColors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  emptyFeedCopy: {
    color: TrainingColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 12,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: TrainingColors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  primaryButton: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#F4FAFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
