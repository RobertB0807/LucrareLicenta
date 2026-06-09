import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  LearningPathModule,
  LearningPathStep,
} from '@/features/training/types';
import { TrainingColors } from '@/features/training/ui-theme';
import { useTrainingSession } from '@/features/training/useTrainingSession';

const LEVEL_LABELS: Record<LearningPathModule['level'], string> = {
  beginner: 'ÎNCEPĂTOR',
  intermediate: 'INTERMEDIAR',
  advanced: 'AVANSAT',
};

const MODULE_ICONS: Record<LearningPathModule['level'], keyof typeof Ionicons.glyphMap> = {
  beginner: 'school-outline',
  intermediate: 'shield-checkmark-outline',
  advanced: 'ribbon-outline',
};

export default function LearningPathScreen() {
  const {
    learningPath,
    isLoadingLearningPath,
    learningPathError,
    refreshLearningPath,
    completePathLesson,
    sessionId,
  } = useTrainingSession();

  useFocusEffect(
    useCallback(() => {
      void refreshLearningPath();
    }, [refreshLearningPath])
  );

  const runStep = (step: LearningPathStep) => {
    if (step.status === 'locked' || step.status === 'completed') {
      return;
    }
    if (step.step_type === 'lesson' && step.lesson_id) {
      Alert.alert(
        'Finalizează lecția',
        'Confirmă după ce ai parcurs conținutul lecției din biblioteca de învățare.',
        [
          { text: 'Deschide biblioteca', onPress: () => router.push('/(tabs)/learn') },
          { text: 'Anulează', style: 'cancel' },
          {
            text: 'Marchează finalizată',
            onPress: () => void completePathLesson(step.lesson_id!),
          },
        ]
      );
      return;
    }
    if (step.attack_type && step.difficulty) {
      router.push({
        pathname: '/chat/[scenarioId]',
        params: {
          scenarioId: `path-${step.id}`,
          attackType: step.attack_type,
          difficulty: step.difficulty,
          sessionId: sessionId ?? undefined,
        },
      });
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Înapoi"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="arrow-back" size={20} color={TrainingColors.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Traseu de învățare</Text>
          <Text style={styles.subtitle}>Progres ghidat de la fundamente la scenarii avansate</Text>
        </View>
        <Pressable
          accessibilityLabel="Reîncarcă progresul"
          onPress={() => void refreshLearningPath()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="refresh" size={19} color={TrainingColors.accentTeal} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isLoadingLearningPath && !learningPath ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={TrainingColors.accentTeal} />
            <Text style={styles.stateText}>Se construiește traseul tău...</Text>
          </View>
        ) : null}

        {learningPathError && !learningPath ? (
          <View style={styles.stateCard}>
            <Ionicons name="cloud-offline-outline" size={26} color={TrainingColors.accentDanger} />
            <Text style={styles.stateText}>{learningPathError}</Text>
            <Pressable style={styles.retryButton} onPress={() => void refreshLearningPath()}>
              <Text style={styles.retryText}>Încearcă din nou</Text>
            </Pressable>
          </View>
        ) : null}

        {learningPath ? (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View>
                  <Text style={styles.eyebrow}>NIVEL CURENT</Text>
                  <Text style={styles.levelValue}>Nivel {learningPath.level}</Text>
                </View>
                <View style={styles.xpBadge}>
                  <Ionicons name="flash" size={14} color={TrainingColors.accentAmber} />
                  <Text style={styles.xpBadgeText}>{learningPath.xp} XP</Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, learningPath.level_progress)}%` },
                  ]}
                />
              </View>
              <View style={styles.heroMeta}>
                <Text style={styles.heroMetaText}>
                  {learningPath.level_progress}/{learningPath.level_target} XP până la nivelul următor
                </Text>
                <Text style={styles.heroMetaText}>{learningPath.overall_progress}% traseu</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <SummaryMetric
                icon="flame-outline"
                value={`${learningPath.current_streak}/${learningPath.longest_streak}`}
                label="Zile: serie / record"
              />
              <SummaryMetric
                icon="checkmark-done-outline"
                value={`${learningPath.completed_modules}/${learningPath.total_modules}`}
                label="Module"
              />
              <SummaryMetric
                icon="trophy-outline"
                value={String(learningPath.badges.filter((badge) => badge.unlocked).length)}
                label="Insigne"
              />
            </View>

            <View style={styles.goalsRow}>
              <GoalCard
                icon="today-outline"
                title={learningPath.daily_goal.title}
                detail={learningPath.daily_goal.detail}
                current={learningPath.daily_goal.current}
                target={learningPath.daily_goal.target}
                completed={learningPath.daily_goal.completed}
              />
              <GoalCard
                icon="calendar-outline"
                title={learningPath.weekly_goal.title}
                detail={learningPath.weekly_goal.detail}
                current={learningPath.weekly_goal.current}
                target={learningPath.weekly_goal.target}
                completed={learningPath.weekly_goal.completed}
              />
            </View>

            {learningPath.next_action ? (
              <View style={styles.nextCard}>
                <View style={styles.nextIcon}>
                  <Ionicons name="navigate" size={20} color="#EFF6FF" />
                </View>
                <View style={styles.nextContent}>
                  <Text style={styles.nextEyebrow}>URMĂTORUL PAS</Text>
                  <Text style={styles.nextTitle}>{learningPath.next_action.title}</Text>
                </View>
                <Ionicons name="chevron-down" size={18} color={TrainingColors.textSecondary} />
              </View>
            ) : null}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Module</Text>
              <Text style={styles.sectionMeta}>Deblochează-le în ordine</Text>
            </View>

            {learningPath.modules.map((module, moduleIndex) => (
              <ModuleCard
                key={module.id}
                module={module}
                index={moduleIndex}
                isBusy={isLoadingLearningPath}
                onRunStep={runStep}
              />
            ))}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Insigne</Text>
              <Text style={styles.sectionMeta}>Recompense pentru progres real</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.badgesRow}>
              {learningPath.badges.map((badge) => (
                <View key={badge.id} style={[styles.badgeCard, !badge.unlocked && styles.badgeLocked]}>
                  <View style={[styles.badgeIcon, badge.unlocked && styles.badgeIconUnlocked]}>
                    <Ionicons
                      name={badge.unlocked ? 'trophy' : 'lock-closed'}
                      size={19}
                      color={badge.unlocked ? TrainingColors.accentAmber : TrainingColors.textMuted}
                    />
                  </View>
                  <Text style={styles.badgeTitle}>{badge.title}</Text>
                  <Text style={styles.badgeDescription}>{badge.description}</Text>
                </View>
              ))}
            </ScrollView>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SummaryMetric({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.summaryMetric}>
      <Ionicons name={icon} size={17} color={TrainingColors.accentTeal} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function GoalCard({
  icon,
  title,
  detail,
  current,
  target,
  completed,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  current: number;
  target: number;
  completed: boolean;
}) {
  return (
    <View style={[styles.goalCard, completed && styles.goalCardCompleted]}>
      <View style={styles.goalHeader}>
        <Ionicons
          name={completed ? 'checkmark-circle' : icon}
          size={18}
          color={completed ? TrainingColors.accentTeal : TrainingColors.accentBlue}
        />
        <Text style={styles.goalProgress}>{current}/{target}</Text>
      </View>
      <Text style={styles.goalTitle}>{title}</Text>
      <Text style={styles.goalDetail}>{detail}</Text>
    </View>
  );
}

function ModuleCard({
  module,
  index,
  isBusy,
  onRunStep,
}: {
  module: LearningPathModule;
  index: number;
  isBusy: boolean;
  onRunStep: (step: LearningPathStep) => void;
}) {
  const isLocked = module.status === 'locked';
  const isCompleted = module.status === 'completed';
  return (
    <View style={[styles.moduleCard, isLocked && styles.moduleLocked]}>
      <View style={styles.moduleHeader}>
        <View style={[styles.moduleIcon, isCompleted && styles.moduleIconCompleted]}>
          <Ionicons
            name={isLocked ? 'lock-closed' : isCompleted ? 'checkmark' : MODULE_ICONS[module.level]}
            size={20}
            color={isCompleted ? '#07151A' : TrainingColors.textPrimary}
          />
        </View>
        <View style={styles.moduleHeaderText}>
          <Text style={styles.moduleEyebrow}>
            MODUL {index + 1} · {LEVEL_LABELS[module.level]}
          </Text>
          <Text style={styles.moduleTitle}>{module.title}</Text>
          <Text style={styles.moduleDescription}>{module.description}</Text>
        </View>
      </View>

      <View style={styles.moduleProgressRow}>
        <View style={styles.moduleProgressTrack}>
          <View style={[styles.moduleProgressFill, { width: `${module.progress_percent}%` }]} />
        </View>
        <Text style={styles.moduleProgressText}>
          {module.completed_steps}/{module.total_steps}
        </Text>
      </View>

      <View style={styles.steps}>
        {module.steps.map((step) => (
          <Pressable
            key={step.id}
            disabled={isBusy || step.status === 'locked' || step.status === 'completed'}
            onPress={() => onRunStep(step)}
            style={({ pressed }) => [
              styles.stepRow,
              step.status === 'completed' && styles.stepCompleted,
              step.status === 'locked' && styles.stepLocked,
              pressed && styles.pressed,
            ]}>
            <View style={styles.stepStatus}>
              <Ionicons
                name={
                  step.status === 'completed'
                    ? 'checkmark-circle'
                    : step.status === 'locked'
                      ? 'lock-closed'
                      : step.step_type === 'lesson'
                        ? 'book-outline'
                        : 'shield-outline'
                }
                size={19}
                color={
                  step.status === 'completed'
                    ? TrainingColors.accentTeal
                    : step.status === 'locked'
                      ? TrainingColors.textMuted
                      : TrainingColors.accentBlue
                }
              />
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDescription}>{step.description}</Text>
              {step.step_type === 'scenario' ? (
                <Text style={styles.stepProgress}>
                  {step.progress_current}/{step.progress_required} scenarii
                  {step.minimum_mastery
                    ? ` · mastery ${step.mastery_current ?? 0}/${step.minimum_mastery}`
                    : ''}
                </Text>
              ) : null}
            </View>
            {step.status !== 'locked' && step.status !== 'completed' ? (
              <Ionicons name="chevron-forward" size={17} color={TrainingColors.accentTeal} />
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  header: {
    paddingTop: 54,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
  },
  headerText: { flex: 1 },
  title: { color: TrainingColors.textPrimary, fontSize: 20, fontWeight: '800' },
  subtitle: { color: TrainingColors.textSecondary, fontSize: 10, marginTop: 2 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
  },
  content: { padding: 18, paddingBottom: 42, gap: 12 },
  stateCard: {
    minHeight: 180,
    padding: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stateText: { color: TrainingColors.textSecondary, fontSize: 13, textAlign: 'center' },
  retryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  retryText: { color: TrainingColors.accentTeal, fontSize: 12, fontWeight: '700' },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    backgroundColor: TrainingColors.panelAlt,
    padding: 16,
    gap: 12,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { color: TrainingColors.accentTeal, fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  levelValue: { color: TrainingColors.textPrimary, fontSize: 27, fontWeight: '800', marginTop: 3 },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(245,197,107,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,197,107,0.3)',
  },
  xpBadgeText: { color: TrainingColors.accentAmber, fontSize: 11, fontWeight: '800' },
  progressTrack: { height: 9, borderRadius: 6, backgroundColor: TrainingColors.panelSoft, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 6, backgroundColor: TrainingColors.accentTeal },
  heroMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  heroMetaText: { color: TrainingColors.textSecondary, fontSize: 9, flexShrink: 1 },
  statsRow: { flexDirection: 'row', gap: 8 },
  summaryMetric: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
  },
  summaryValue: { color: TrainingColors.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 3 },
  summaryLabel: { color: TrainingColors.textMuted, fontSize: 9, marginTop: 1 },
  goalsRow: { flexDirection: 'row', gap: 8 },
  goalCard: {
    flex: 1,
    minHeight: 130,
    padding: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    gap: 5,
  },
  goalCardCompleted: { borderColor: 'rgba(69,224,177,0.45)', backgroundColor: 'rgba(69,224,177,0.07)' },
  goalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalProgress: { color: TrainingColors.textMuted, fontSize: 10, fontWeight: '700' },
  goalTitle: { color: TrainingColors.textPrimary, fontSize: 12, fontWeight: '800' },
  goalDetail: { color: TrainingColors.textSecondary, fontSize: 10, lineHeight: 14 },
  nextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    backgroundColor: TrainingColors.buttonPrimary,
  },
  nextIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  nextContent: { flex: 1 },
  nextEyebrow: { color: '#CDE4FF', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  nextTitle: { color: '#EFF6FF', fontSize: 14, fontWeight: '800', marginTop: 2 },
  sectionHeader: {
    marginTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  sectionTitle: { color: TrainingColors.textPrimary, fontSize: 18, fontWeight: '800' },
  sectionMeta: { color: TrainingColors.textMuted, fontSize: 9 },
  moduleCard: {
    borderRadius: 21,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 14,
    gap: 12,
  },
  moduleLocked: { opacity: 0.58 },
  moduleHeader: { flexDirection: 'row', gap: 11 },
  moduleIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
  },
  moduleIconCompleted: { backgroundColor: TrainingColors.accentTeal, borderColor: TrainingColors.accentTeal },
  moduleHeaderText: { flex: 1 },
  moduleEyebrow: { color: TrainingColors.accentTeal, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  moduleTitle: { color: TrainingColors.textPrimary, fontSize: 16, fontWeight: '800', marginTop: 2 },
  moduleDescription: { color: TrainingColors.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 3 },
  moduleProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  moduleProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 4,
    backgroundColor: TrainingColors.panelSoft,
    overflow: 'hidden',
  },
  moduleProgressFill: { height: '100%', backgroundColor: TrainingColors.accentTeal },
  moduleProgressText: { color: TrainingColors.textMuted, fontSize: 10, fontWeight: '700' },
  steps: { gap: 8 },
  stepRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
  },
  stepCompleted: { borderColor: 'rgba(69,224,177,0.32)' },
  stepLocked: { backgroundColor: TrainingColors.panel },
  stepStatus: { width: 25, alignItems: 'center' },
  stepContent: { flex: 1 },
  stepTitle: { color: TrainingColors.textPrimary, fontSize: 12, fontWeight: '800' },
  stepDescription: { color: TrainingColors.textSecondary, fontSize: 9, lineHeight: 13, marginTop: 2 },
  stepProgress: { color: TrainingColors.accentTeal, fontSize: 9, fontWeight: '700', marginTop: 4 },
  badgesRow: { gap: 9, paddingRight: 18 },
  badgeCard: {
    width: 135,
    minHeight: 140,
    padding: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
  },
  badgeLocked: { opacity: 0.55 },
  badgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TrainingColors.panelAlt,
  },
  badgeIconUnlocked: { backgroundColor: 'rgba(245,197,107,0.12)' },
  badgeTitle: { color: TrainingColors.textPrimary, fontSize: 12, fontWeight: '800', marginTop: 10 },
  badgeDescription: { color: TrainingColors.textSecondary, fontSize: 9, lineHeight: 13, marginTop: 4 },
  pressed: { opacity: 0.8 },
});
