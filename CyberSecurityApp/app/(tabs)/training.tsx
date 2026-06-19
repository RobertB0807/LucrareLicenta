import { Pressable, StyleSheet, View } from 'react-native';

import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FeedbackPanel } from '@/features/training/components/FeedbackPanel';
import { ScenarioSetupCard } from '@/features/training/components/ScenarioSetupCard';
import { TrainingHero } from '@/features/training/components/TrainingHero';
import { getDifficultyLabel } from '@/features/training/options';
import { TrainingColors } from '@/features/training/ui-theme';
import { useTrainingSession } from '../../features/training/useTrainingSession';

export default function HomeScreen() {
  const {
    scenario,
    evaluation,
    sessionId,
    selectedOptionId,
    attackType,
    difficulty,
    isLoading,
    error,
    stats,
    perAttackStats,
    setSelectedOptionId,
    setAttackType,
    setDifficulty,
    startSimulation,
    evaluateAnswer,
    runCurrentSelection,
    runRecommendedScenario,
    resetSession,
  } = useTrainingSession();

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: TrainingColors.pageBase, dark: TrainingColors.pageBase }}
      headerImage={
        <View style={styles.headerVisual}>
          <View style={styles.headerGrid} />
          <View style={styles.headerGlowLeft} />
          <View style={styles.headerGlowRight} />
          <View style={styles.headerCore}>
            <View style={styles.headerLine} />
            <ThemedText style={styles.headerCoreTitle}>SIMULARE AMENINȚARE</ThemedText>
            <ThemedText style={styles.headerCoreSubtitle}>
              Observă, decide, apără.
            </ThemedText>
          </View>
        </View>
      }>
      <ThemedView style={styles.container}>
        <TrainingHero sessionId={sessionId} stats={stats} />

        <ScenarioSetupCard
          attackType={attackType}
          difficulty={difficulty}
          isLoading={isLoading}
          onSelectAttackType={setAttackType}
          onSelectDifficulty={setDifficulty}
          onGenerateScenario={() => startSimulation()}
        />

        {scenario ? (
          <View style={styles.scenarioCard}>
            <View style={styles.scenarioHeaderRow}>
              <ThemedText type="subtitle" style={styles.blockTitle}>
                Brief de amenințare
              </ThemedText>
              <View style={styles.metadataGroup}>
                <View style={styles.metaPill}>
                  <ThemedText style={styles.metaText}>{scenario.channel.toUpperCase()}</ThemedText>
                </View>
                <View style={styles.metaPill}>
                  <ThemedText style={styles.metaText}>{scenario.attack_type.toUpperCase()}</ThemedText>
                </View>
                <View style={styles.metaPill}>
                  <ThemedText style={styles.metaText}>{getDifficultyLabel(scenario.difficulty)}</ThemedText>
                </View>
              </View>
            </View>

            <View style={styles.attackerMessageBox}>
              <ThemedText style={styles.attackerMessageText}>{scenario.attacker_message}</ThemedText>
            </View>

            <ThemedText style={styles.blockLabel}>Ce faci?</ThemedText>
            <View style={styles.optionsList}>
              {scenario.options.map((option, index) => {
                const isSelected = selectedOptionId === option.id;
                const optionLetter = String.fromCharCode(65 + index);

                return (
                  <Pressable
                    key={option.id}
                    style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                    onPress={() => setSelectedOptionId(option.id)}>
                    <View style={[styles.optionLetterBadge, isSelected && styles.optionLetterBadgeSelected]}>
                      <ThemedText style={[styles.optionLetterText, isSelected && styles.optionLetterTextSelected]}>
                        {optionLetter}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.optionText}>{option.text}</ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[styles.primaryButton, (!selectedOptionId || !!evaluation) && styles.buttonDisabled]}
              onPress={evaluateAnswer}
              disabled={!selectedOptionId || isLoading || !!evaluation}>
              <ThemedText type="defaultSemiBold" style={styles.primaryButtonText}>
                Evalueaza raspunsul
              </ThemedText>
            </Pressable>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <View style={styles.loadingPulse} />
            <ThemedText style={styles.loadingText}>Se proceseaza scenariul...</ThemedText>
          </View>
        ) : null}

        {evaluation && scenario ? (
          <FeedbackPanel
            evaluation={evaluation}
            scenario={scenario}
            perAttackStats={perAttackStats}
            onRunCurrentSelection={runCurrentSelection}
            onRunRecommendedScenario={runRecommendedScenario}
          />
        ) : null}

        <Pressable style={styles.ghostButton} onPress={resetSession}>
          <ThemedText type="defaultSemiBold" style={styles.ghostButtonText}>
            Reseteaza sesiunea
          </ThemedText>
        </Pressable>

        {error ? (
          <View style={styles.errorCard}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
    paddingBottom: 28,
  },
  headerVisual: {
    flex: 1,
    margin: 14,
    borderRadius: 22,
    backgroundColor: TrainingColors.pageBase,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TrainingColors.border,
  },
  headerGrid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.7,
    backgroundColor: 'rgba(88, 166, 255, 0.05)',
  },
  headerGlowLeft: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(69, 224, 177, 0.22)',
    left: -40,
    top: -20,
  },
  headerGlowRight: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(88, 166, 255, 0.18)',
    right: -25,
    top: 28,
  },
  headerCore: {
    flex: 1,
    margin: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(104, 164, 255, 0.35)',
    backgroundColor: 'rgba(12, 21, 39, 0.74)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  headerLine: {
    width: '62%',
    height: 1,
    backgroundColor: 'rgba(69, 224, 177, 0.7)',
    marginBottom: 2,
  },
  headerCoreTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 18,
    letterSpacing: 2.4,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  headerCoreSubtitle: {
    color: TrainingColors.textSecondary,
    letterSpacing: 0.8,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  scenarioCard: {
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: TrainingColors.panel,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
  },
  scenarioHeaderRow: {
    gap: 8,
  },
  blockTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 18,
  },
  metadataGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(26, 94, 71, 0.12)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: TrainingColors.border,
  },
  metaText: {
    color: TrainingColors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  attackerMessageBox: {
    borderRadius: 12,
    backgroundColor: TrainingColors.panelAlt,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    padding: 12,
  },
  attackerMessageText: {
    color: TrainingColors.textPrimary,
    lineHeight: 22,
  },
  blockLabel: {
    color: TrainingColors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  optionsList: {
    gap: 8,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    borderRadius: 12,
    padding: 10,
    backgroundColor: TrainingColors.panelAlt,
  },
  optionCardSelected: {
    borderColor: TrainingColors.accentBlue,
    backgroundColor: 'rgba(88, 166, 255, 0.12)',
  },
  optionLetterBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TrainingColors.pageBase,
    marginTop: 1,
  },
  optionLetterBadgeSelected: {
    borderColor: TrainingColors.accentBlue,
    backgroundColor: 'rgba(88, 166, 255, 0.18)',
  },
  optionLetterText: {
    color: TrainingColors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  optionLetterTextSelected: {
    color: TrainingColors.textPrimary,
  },
  optionText: {
    flex: 1,
    color: TrainingColors.textPrimary,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
  },
  primaryButtonText: {
    color: '#EEF4FF',
    fontFamily: 'monospace',
    letterSpacing: 0.8,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  loadingPulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: TrainingColors.accentTeal,
  },
  loadingText: {
    color: TrainingColors.textSecondary,
    fontFamily: 'monospace',
  },
  ghostButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
  },
  ghostButtonText: {
    color: TrainingColors.textSecondary,
  },
  errorCard: {
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 125, 125, 0.38)',
    backgroundColor: 'rgba(255, 125, 125, 0.12)',
  },
  errorText: {
    color: '#FFC9C9',
  },
});
