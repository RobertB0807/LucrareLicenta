import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Link, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { AppBackdrop } from '@/components/app-backdrop';
import { StateCard } from '@/components/state-card';
import { useAuth } from '@/features/auth/auth-context';
import { getRecentLiveDrills } from '@/features/training/api';
import type {
  AttackType,
  DifficultyLevel,
  LearningPathNextAction,
  LearningProfileAttack,
  LiveDrillSummaryApiResponse,
} from '@/features/training/types';
import { TrainingColors, TrainingShadows } from '@/features/training/ui-theme';
import { useTrainingSession } from '@/features/training/useTrainingSession';

type RiskLevel = 'Scăzut' | 'Mediu' | 'Ridicat' | 'Critic';

const ATTACK_LABELS: Record<AttackType, string> = {
  phishing: 'Phishing prin email',
  smishing: 'Escrocherie SMS',
  impersonation: 'Impersonare',
};

const ATTACK_ICONS: Record<AttackType, keyof typeof Ionicons.glyphMap> = {
  phishing: 'mail-outline',
  smishing: 'chatbubble-ellipses-outline',
  impersonation: 'call-outline',
};

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: 'UȘOR',
  medium: 'MEDIU',
  hard: 'GREU',
};

function riskFromAccuracy(accuracy: number, attempts: number): RiskLevel {
  if (attempts < 2) return 'Mediu';
  if (accuracy <= 40) return 'Critic';
  if (accuracy <= 65) return 'Ridicat';
  if (accuracy <= 85) return 'Mediu';
  return 'Scăzut';
}

function adaptiveDifficulty(masteryScore: number, attempts: number): DifficultyLevel {
  if (attempts < 2 || masteryScore < 45) return 'easy';
  if (masteryScore < 75) return 'medium';
  return 'hard';
}

function getNextActionLabel(nextAction: LearningPathNextAction | null | undefined): string {
  if (!nextAction) {
    return 'Continuă traseul';
  }
  return nextAction.step_type === 'lesson' ? 'Deschide lecția' : 'Pornește scenariul';
}

export default function DashboardScreen() {
  const {
    stats,
    perAttackStats,
    evaluation,
    sessionId,
    scenarioCatalog,
    adaptiveProfile,
    isLoadingAdaptiveProfile,
    adaptiveProfileError,
    learningPath,
    isLoadingLearningPath,
    learningPathError,
    refreshActiveSession,
    refreshAdaptiveProfile,
    refreshLearningPath,
  } = useTrainingSession();
  const { user } = useAuth();
  const router = useRouter();
  const [liveDrills, setLiveDrills] = useState<LiveDrillSummaryApiResponse[]>([]);
  const [isLoadingLiveDrills, setIsLoadingLiveDrills] = useState(false);
  const [liveDrillError, setLiveDrillError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const contentInsets = useMemo(
    () => ({
      paddingHorizontal: isCompact ? 16 : 20,
      paddingTop: isCompact ? 40 : 50,
      paddingBottom: isCompact ? 110 : 130,
      gap: isCompact ? 12 : 14,
    }),
    [isCompact]
  );

  const scenarioPreviewByKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of scenarioCatalog) {
      if (item.locked) {
        continue;
      }
      const key = `${item.attack_type}-${item.difficulty}`;
      if (!map[key]) {
        map[key] = item.attacker_message_preview;
      }
    }
    return map;
  }, [scenarioCatalog]);

  const scenarioAccess = useMemo(() => {
    const unlocked = scenarioCatalog.filter((item) => !item.locked);
    const locked = scenarioCatalog.filter((item) => item.locked);
    const unlockedAdvanced = unlocked.filter((item) => item.difficulty !== 'easy');
    const nextLocked = locked.find((item) => item.unlock_reason);
    const byDifficulty = (['easy', 'medium', 'hard'] as DifficultyLevel[]).map((difficulty) => {
      const items = scenarioCatalog.filter((item) => item.difficulty === difficulty);
      const available = items.filter((item) => !item.locked).length;
      return {
        difficulty,
        total: items.length,
        available,
        locked: items.length - available,
      };
    });
    return {
      total: scenarioCatalog.length,
      unlocked: unlocked.length,
      locked: locked.length,
      unlockedAdvanced: unlockedAdvanced.length,
      nextLocked,
      byDifficulty,
    };
  }, [scenarioCatalog]);

  const adaptiveAttackMap = useMemo(() => {
    const map = new Map<AttackType, LearningProfileAttack>();
    for (const item of adaptiveProfile?.by_attack ?? []) {
      map.set(item.attack_type, item);
    }
    return map;
  }, [adaptiveProfile?.by_attack]);

  const refreshLiveDrills = useCallback(async () => {
    if (!user) {
      setLiveDrills([]);
      setIsLoadingLiveDrills(false);
      return;
    }

    setIsLoadingLiveDrills(true);
    setLiveDrillError(null);
    try {
      const response = await getRecentLiveDrills({ limit: 12 });
      setLiveDrills(response.items);
    } catch {
      setLiveDrills([]);
      setLiveDrillError('Nu am putut sincroniza exercițiile live.');
    } finally {
      setIsLoadingLiveDrills(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void refreshActiveSession();
      void refreshAdaptiveProfile();
      void refreshLearningPath();
      void refreshLiveDrills();
    }, [refreshActiveSession, refreshAdaptiveProfile, refreshLearningPath, refreshLiveDrills])
  );

  const sessionScore = stats.totalScore;
  const estimatedDetected = Math.round((stats.totalAttempts * stats.accuracy) / 100);
  const mistakes = Math.max(0, stats.totalAttempts - estimatedDetected);

  const scenarioCards = useMemo(
    () =>
      perAttackStats
        .map(({ id, value }) => {
          const adaptive = adaptiveAttackMap.get(id);
          const attempts = adaptive?.attempts ?? value?.attempts ?? 0;
          const masteryScore = adaptive?.mastery_score ?? value?.accuracy ?? 0;
          const difficulty = adaptiveDifficulty(masteryScore, attempts);
          const accuracy = adaptive?.accuracy ?? value?.accuracy ?? 0;
          const preview = scenarioPreviewByKey[`${id}-${difficulty}`];
          const title = preview
            ? preview.length > 58
              ? `${preview.slice(0, 55)}...`
              : preview
            : `Exersează ${ATTACK_LABELS[id].toLowerCase()}`;
          return {
            id: `${id}-${difficulty}`,
            type: ATTACK_LABELS[id],
            title,
            risk: riskFromAccuracy(accuracy, attempts),
            icon: ATTACK_ICONS[id],
            attackType: id,
            difficulty,
          };
        })
        .sort((a, b) => {
          const aMastery = adaptiveAttackMap.get(a.attackType)?.mastery_score ?? 0;
          const bMastery = adaptiveAttackMap.get(b.attackType)?.mastery_score ?? 0;
          return aMastery - bMastery;
        }),
    [adaptiveAttackMap, perAttackStats, scenarioPreviewByKey]
  );

  const challenge = useMemo(() => {
    const recommendation = evaluation?.recommendation ?? adaptiveProfile?.recommended_next;
    if (recommendation) {
      const attack = recommendation.attack_type;
      const recommendedUnlocked = scenarioCatalog.some(
        (item) =>
          item.attack_type === recommendation.attack_type &&
          item.difficulty === recommendation.difficulty &&
          !item.locked
      );
      if (!recommendedUnlocked) {
        const fallbackUnlocked = scenarioCatalog.find(
          (item) => item.attack_type === recommendation.attack_type && !item.locked
        );
        if (fallbackUnlocked) {
          return {
            title: `Scenariu disponibil · ${ATTACK_LABELS[fallbackUnlocked.attack_type]}`,
            difficulty: fallbackUnlocked.difficulty,
            attackType: fallbackUnlocked.attack_type,
          };
        }
      }
      return {
        title: `Scenariu recomandat · ${ATTACK_LABELS[attack]}`,
        difficulty: recommendation.difficulty,
        attackType: attack,
      };
    }

    const fallback = scenarioCards[0];
    return {
      title: fallback ? `Zonă prioritară · ${fallback.type}` : 'Provocarea zilei',
      difficulty: fallback?.difficulty ?? 'easy',
      attackType: fallback?.attackType ?? 'phishing',
    };
  }, [adaptiveProfile?.recommended_next, evaluation?.recommendation, scenarioCards, scenarioCatalog]);

  const nextPathUnlockHint = useMemo(() => {
    if (!learningPath) {
      return null;
    }
    const activeModule =
      learningPath.modules.find((module) => module.status === 'in_progress') ??
      learningPath.modules.find((module) => module.status === 'available') ??
      learningPath.modules.find((module) => module.status === 'locked');
    return activeModule?.next_unlock_hint ?? activeModule?.unlock_reason ?? null;
  }, [learningPath]);

  const continuePath = useCallback(() => {
    const nextAction = learningPath?.next_action;
    if (!nextAction) {
      router.push('/learning-path' as Href);
      return;
    }
    if (nextAction.step_type === 'lesson' && nextAction.lesson_id) {
      router.push({
        pathname: '/(tabs)/learn',
        params: { lessonId: nextAction.lesson_id },
      });
      return;
    }
    if (nextAction.attack_type && nextAction.difficulty) {
      router.push({
        pathname: '/chat/[scenarioId]',
        params: {
          scenarioId: `path-${nextAction.step_id}`,
          attackType: nextAction.attack_type,
          difficulty: nextAction.difficulty,
          sessionId: sessionId ?? undefined,
        },
      });
      return;
    }
    router.push('/learning-path' as Href);
  }, [learningPath?.next_action, router, sessionId]);

  const weakestAdaptiveArea = adaptiveProfile?.weak_areas[0];
  const topReview = adaptiveProfile?.review_queue?.[0];

  const reviewBadgeText =
    isLoadingAdaptiveProfile && !adaptiveProfile
      ? 'Se încarcă...'
      : topReview?.status === 'due_now'
      ? 'Repetă acum'
      : topReview?.status === 'due_soon'
        ? 'Urmează'
        : topReview
          ? 'Programat'
          : 'Fără recapitulări';

  const reviewMetaText = topReview
    ? `${ATTACK_LABELS[topReview.attack_type]} · ${DIFFICULTY_LABELS[topReview.difficulty]}`
    : isLoadingAdaptiveProfile && !adaptiveProfile
      ? 'Se calculează recapitulările din progresul tău...'
      : 'Recapitulările apar după primele răspunsuri evaluate.';

  const liveSummary = useMemo(() => {
    const opened = liveDrills.filter((item) => item.opened_at).length;
    const reported = liveDrills.filter((item) => item.reported_at && !item.opened_at).length;
    const pending = liveDrills.filter((item) => !item.opened_at && !item.reported_at).length;
    const completed = opened + reported;
    const safeRate = completed > 0 ? Math.round((reported / completed) * 100) : 0;
    const latest = liveDrills[0] ?? null;
    return { opened, reported, pending, completed, safeRate, latest };
  }, [liveDrills]);

  const liveStatusText = isLoadingLiveDrills
    ? 'Se sincronizează inbox-ul'
    : liveSummary.latest?.opened_at
      ? 'Ultimul email a fost deschis'
      : liveSummary.latest?.reported_at
        ? 'Ultimul email a fost raportat'
        : liveSummary.pending > 0
          ? `${liveSummary.pending} email live în desfășurare`
          : liveSummary.completed > 0
            ? `${liveSummary.safeRate}% raportare sigură`
            : 'Trimite primul email live';

  const liveStatusTone =
    liveSummary.latest?.opened_at
      ? 'danger'
      : liveSummary.pending > 0
        ? 'warning'
        : liveSummary.completed > 0
          ? 'success'
          : 'neutral';

  const dashboardState = useMemo(() => {
    if (isLoadingLearningPath && !learningPath) {
      return {
        type: 'loading' as const,
        title: 'Se sincronizează traseul',
        message: 'Încărcăm recomandarea curentă și progresul salvat.',
      };
    }
    if (learningPathError) {
      return {
        type: 'error' as const,
        title: 'Traseul nu s-a încărcat',
        message: learningPathError,
        retry: refreshLearningPath,
      };
    }
    if (adaptiveProfileError) {
      return {
        type: 'error' as const,
        title: 'Profil adaptiv indisponibil',
        message: adaptiveProfileError,
        retry: refreshAdaptiveProfile,
      };
    }
    if (liveDrillError) {
      return {
        type: 'error' as const,
        title: 'Live inbox nesincronizat',
        message: liveDrillError,
        retry: refreshLiveDrills,
      };
    }
    return null;
  }, [
    adaptiveProfileError,
    isLoadingLearningPath,
    learningPath,
    learningPathError,
    liveDrillError,
    refreshAdaptiveProfile,
    refreshLearningPath,
    refreshLiveDrills,
  ]);

  return (
    <View style={styles.screen}>
      <AppBackdrop grid />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentInsets]}
        showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="shield-half" size={18} color="#EFF6FF" />
          </View>
          <View>
            <Text style={styles.welcomeEyebrow}>CENTRU DE COMANDĂ</Text>
            <Text style={[styles.headerTitle, isCompact && styles.headerTitleCompact]}>
              {user ? `Bună, ${user.displayName}` : 'Panou de antrenament'}
            </Text>
            <Text style={[styles.headerSubtitle, isCompact && styles.headerSubtitleCompact]}>
              Rămâi atent. Rămâi în siguranță.
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Istoricul sesiunilor"
            style={({ pressed }) => [styles.logoutButton, pressed && styles.pressableFeedback]}
            onPress={() => router.push('/sessions' as Href)}>
            <Ionicons name="time-outline" size={18} color={TrainingColors.accentTeal} />
          </Pressable>
          <Pressable
            accessibilityLabel="Profil și setări"
            style={({ pressed }) => [styles.logoutButton, pressed && styles.pressableFeedback]}
            onPress={() => router.push('/profile' as Href)}>
            <Ionicons name="person-outline" size={18} color={TrainingColors.textMuted} />
          </Pressable>
        </View>
      </View>

      {dashboardState ? (
        <StateCard
          compact
          loading={dashboardState.type === 'loading'}
          icon={dashboardState.type === 'loading' ? undefined : 'cloud-offline-outline'}
          title={dashboardState.title}
          message={dashboardState.message}
          tone={dashboardState.type === 'loading' ? 'info' : 'danger'}
          actionLabel={dashboardState.type === 'error' ? 'Reîncearcă' : undefined}
          onAction={dashboardState.type === 'error' ? () => void dashboardState.retry() : undefined}
        />
      ) : null}

      <View style={styles.focusPanel}>
        <View style={styles.focusTopRow}>
          <View style={styles.focusHeading}>
            <Text style={styles.focusEyebrow}>PLANUL TĂU</Text>
            <Text style={styles.focusTitle}>
              {learningPath?.next_action?.title ?? 'Începe traseul personalizat'}
            </Text>
          </View>
          <View style={styles.focusLevelPill}>
            <Ionicons name="flash-outline" size={13} color={TrainingColors.accentAmber} />
            <Text style={styles.focusLevelText}>
              {learningPath ? `Nivel ${learningPath.level}` : 'Nivel 1'}
            </Text>
          </View>
        </View>

        <Text style={styles.focusText}>
          {learningPath?.next_action?.step_type === 'lesson'
            ? 'Continuă cu lecția recomandată pentru nivelul tău, apoi promovează quiz-ul ca să crești progresul.'
            : learningPath?.next_action?.step_type === 'scenario'
              ? 'Aplică ce ai învățat într-un scenariu potrivit nivelului tău actual.'
              : 'Finalizează prima lecție ca să deblochezi treptat scenarii mai dificile.'}
        </Text>

        <View style={styles.focusProgressTrack}>
          <View
            style={[
              styles.focusProgressFill,
              { width: `${learningPath?.overall_progress ?? 0}%` },
            ]}
          />
        </View>

        <View style={styles.focusStatsRow}>
          <FocusStat
            icon="book-outline"
            label="Traseu"
            value={`${learningPath?.overall_progress ?? 0}%`}
          />
          <FocusStat
            icon="lock-open-outline"
            label="Scenarii"
            value={`${scenarioAccess.unlocked}/${scenarioAccess.total || 0}`}
          />
          <FocusStat
            icon="mail-unread-outline"
            label="Live"
            value={
              liveSummary.pending > 0
                ? `${liveSummary.pending} activ`
                : liveSummary.completed > 0
                  ? `${liveSummary.safeRate}%`
                  : '0'
            }
          />
        </View>

        <Pressable
          onPress={() => router.push('/live-drills' as Href)}
          style={({ pressed }) => [
            styles.liveSnapshot,
            liveStatusTone === 'danger'
              ? styles.liveSnapshotDanger
              : liveStatusTone === 'warning'
                ? styles.liveSnapshotWarning
                : liveStatusTone === 'success'
                  ? styles.liveSnapshotSuccess
                  : null,
            pressed && styles.pressableFeedback,
          ]}>
          <View style={styles.liveSnapshotIcon}>
            <Ionicons
              name={
                liveStatusTone === 'danger'
                  ? 'warning-outline'
                  : liveStatusTone === 'success'
                    ? 'flag-outline'
                    : 'mail-unread-outline'
              }
              size={15}
              color={
                liveStatusTone === 'danger'
                  ? TrainingColors.accentDanger
                  : liveStatusTone === 'warning'
                    ? TrainingColors.accentAmber
                    : TrainingColors.accentTeal
              }
            />
          </View>
          <View style={styles.liveSnapshotCopy}>
            <Text style={styles.liveSnapshotLabel}>Live inbox</Text>
            <Text style={styles.liveSnapshotText}>{liveStatusText}</Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={TrainingColors.textSecondary} />
        </Pressable>

        <View style={styles.focusActions}>
          <Pressable
            onPress={continuePath}
            style={({ pressed }) => [styles.primaryPathButton, pressed && styles.pressableFeedback]}>
            <Text style={styles.primaryPathButtonText}>
              {getNextActionLabel(learningPath?.next_action)}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => router.push('/learning-path' as Href)}
            style={({ pressed }) => [styles.secondaryPathButton, pressed && styles.pressableFeedback]}>
            <Ionicons name="map-outline" size={15} color={TrainingColors.accentTeal} />
            <Text style={styles.secondaryPathButtonText}>Vezi traseul</Text>
          </Pressable>
        </View>

        {scenarioAccess.nextLocked?.unlock_reason ? (
          <View style={styles.unlockHint}>
            <Ionicons name="lock-closed-outline" size={14} color={TrainingColors.accentAmber} />
            <Text style={styles.unlockHintText}>{scenarioAccess.nextLocked.unlock_reason}</Text>
          </View>
        ) : null}
        {nextPathUnlockHint ? (
          <View style={styles.unlockHint}>
            <Ionicons name="map-outline" size={14} color={TrainingColors.accentTeal} />
            <Text style={styles.unlockHintText}>{nextPathUnlockHint}</Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.scoreCard, isCompact && styles.scoreCardCompact]}>
        <View style={styles.scoreGlow} />
        <View style={[styles.scoreRing, isCompact && styles.scoreRingCompact]}>
          <Text style={[styles.scoreRingText, isCompact && styles.scoreRingTextCompact]}>{sessionScore}</Text>
        </View>
        <View style={styles.scoreContent}>
          <Text style={styles.eyebrow}>Scor sesiune</Text>
          <Text style={[styles.scoreValue, isCompact && styles.scoreValueCompact]}>
            {sessionScore}
            <Text style={styles.scoreOutOf}> puncte</Text>
          </Text>
          <Text style={styles.scoreMeta}>
            {stats.totalAttempts} încercări ·{' '}
            <Text style={styles.successText}>{stats.accuracy}% acuratețe</Text>
          </Text>
        </View>
      </View>

      <View style={styles.unlockPanel}>
        <View style={styles.unlockPanelHeader}>
          <View style={styles.unlockPanelHeading}>
            <Text style={styles.unlockPanelEyebrow}>ACCES SCENARII</Text>
            <Text style={styles.unlockPanelTitle}>Ce poți exersa acum</Text>
          </View>
          <Pressable
            onPress={() => router.push('/(tabs)/scenarios' as Href)}
            style={({ pressed }) => [styles.unlockPanelAction, pressed && styles.pressableFeedback]}>
            <Text style={styles.unlockPanelActionText}>Laborator</Text>
            <Ionicons name="arrow-forward" size={12} color={TrainingColors.accentTeal} />
          </Pressable>
        </View>
        <View style={styles.unlockRows}>
          {scenarioAccess.byDifficulty.map((row) => {
            const isFullyUnlocked = row.locked === 0 && row.total > 0;
            return (
              <View key={row.difficulty} style={styles.unlockRow}>
                <View
                  style={[
                    styles.unlockDifficultyDot,
                    row.difficulty === 'easy'
                      ? styles.unlockDotEasy
                      : row.difficulty === 'medium'
                        ? styles.unlockDotMedium
                        : styles.unlockDotHard,
                  ]}
                />
                <View style={styles.unlockRowText}>
                  <Text style={styles.unlockRowTitle}>{DIFFICULTY_LABELS[row.difficulty]}</Text>
                  <Text style={styles.unlockRowMeta}>
                    {row.available}/{row.total} disponibile
                  </Text>
                </View>
                <View style={[styles.unlockStatusPill, isFullyUnlocked && styles.unlockStatusOpen]}>
                  <Ionicons
                    name={isFullyUnlocked ? 'lock-open-outline' : 'lock-closed-outline'}
                    size={12}
                    color={isFullyUnlocked ? TrainingColors.accentTeal : TrainingColors.textMuted}
                  />
                  <Text
                    style={[
                      styles.unlockStatusText,
                      isFullyUnlocked && styles.unlockStatusTextOpen,
                    ]}>
                    {isFullyUnlocked ? 'Deblocat' : `${row.locked} blocate`}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.adaptiveCard}>
        <View style={styles.adaptiveTopRow}>
          <View>
            <Text style={styles.adaptiveEyebrow}>Profil adaptiv</Text>
            <Text style={styles.adaptiveValue}>{adaptiveProfile?.overall_mastery ?? stats.accuracy}%</Text>
          </View>
          <View style={styles.adaptivePill}>
            <Text style={styles.adaptivePillText}>{adaptiveProfile?.coverage ?? 0}% acoperire</Text>
          </View>
        </View>
        <Text style={styles.adaptiveText}>
          {adaptiveProfile
            ? `Următorul pas: ${ATTACK_LABELS[challenge.attackType]} · ${DIFFICULTY_LABELS[challenge.difficulty]}`
            : 'Profilul adaptiv se construiește după primele răspunsuri evaluate.'}
        </Text>
        {weakestAdaptiveArea ? (
          <Text style={styles.adaptiveHint}>
            Zonă prioritară: {ATTACK_LABELS[weakestAdaptiveArea.attack_type]} · {DIFFICULTY_LABELS[weakestAdaptiveArea.difficulty]}
          </Text>
        ) : null}
      </View>

      <View style={styles.reviewCard}>
        <View style={styles.reviewTopRow}>
          <View>
            <Text style={styles.reviewEyebrow}>Recapitulare programată</Text>
            <Text style={styles.reviewTitle}>{reviewBadgeText}</Text>
          </View>
          {adaptiveProfile?.review_summary ? (
            <View style={styles.reviewPill}>
              <Text style={styles.reviewPillText}>
                {adaptiveProfile.review_summary.due_now} acum · {adaptiveProfile.review_summary.due_soon} curând
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.reviewMeta}>{reviewMetaText}</Text>

        {topReview ? (
          <>
            <View style={styles.reviewProgressRow}>
              <View style={styles.reviewProgressInfo}>
                <Text style={styles.reviewProgressLabel}>{ATTACK_LABELS[topReview.attack_type]}</Text>
                <Text style={styles.reviewProgressHint}>
                  {topReview.attempts} rulări · {topReview.mastery_score}% mastery
                </Text>
              </View>
              <Text style={styles.reviewProgressValue}>{topReview.accuracy}%</Text>
            </View>
            <Link
              href={{
                pathname: '/chat/[scenarioId]',
                params: {
                  scenarioId: `review-${topReview.attack_type}-${topReview.difficulty}`,
                  attackType: topReview.attack_type,
                  difficulty: topReview.difficulty,
                  sessionId: sessionId ?? undefined,
                },
              }}
              asChild>
              <Pressable style={({ pressed }) => [styles.reviewButton, pressed && styles.pressableFeedback]}>
                <Ionicons name="refresh" size={15} color="#EFF6FF" />
                <Text style={styles.reviewButtonText}>Începe recapitularea</Text>
              </Pressable>
            </Link>
          </>
        ) : null}
      </View>

      <Link
        href={{
          pathname: '/chat/[scenarioId]',
          params: {
            scenarioId: `daily-${challenge.attackType}-${challenge.difficulty}`,
            attackType: challenge.attackType,
            difficulty: challenge.difficulty,
            sessionId: sessionId ?? undefined,
          },
        }}
        asChild>
        <Pressable
          style={({ pressed }) => [
            styles.challengeCard,
            isCompact && styles.challengeCardCompact,
            pressed && styles.pressableFeedback,
          ]}>
          <View style={[styles.challengeIcon, isCompact && styles.challengeIconCompact]}>
            <Ionicons name="flame" size={22} color="#EFF6FF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.challengeEyebrow}>Provocarea zilei</Text>
            <Text style={styles.challengeTitle}>{challenge.title}</Text>
            <Text style={styles.challengeMeta}>{DIFFICULTY_LABELS[challenge.difficulty]} · sesiune activă</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#DCEBFF" />
        </Pressable>
      </Link>

      <View style={[styles.metricGrid, isCompact && styles.metricGridCompact]}>
        {[
          {
            label: 'Atacuri detectate',
            value: `${estimatedDetected}`,
            icon: 'shield-checkmark' as keyof typeof Ionicons.glyphMap,
            tone: 'success' as const,
            timeframe: 'Sesiunea curentă',
          },
          {
            label: 'Greșeli făcute',
            value: `${mistakes}`,
            icon: 'warning' as keyof typeof Ionicons.glyphMap,
            tone: 'warning' as const,
            timeframe: 'Sesiunea curentă',
          },
          {
            label: 'Record zile active',
            value: `${learningPath?.longest_streak ?? 0}`,
            icon: 'trophy' as keyof typeof Ionicons.glyphMap,
            tone: 'success' as const,
            timeframe: 'Progres total',
          },
        ].map((s) => (
          <View key={s.label} style={[styles.metricCard, isCompact && styles.metricCardCompact]}>
            <View style={styles.metricTop}>
              <Ionicons
                name={s.icon}
                size={16}
                color={s.tone === 'success' ? TrainingColors.accentTeal : TrainingColors.accentAmber}
              />
              <Text style={styles.metricTime}>{s.timeframe}</Text>
            </View>
            <Text style={styles.metricValue}>{s.value}</Text>
            <Text style={styles.metricLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>RECOMANDĂRI PENTRU TINE</Text>
          <Text style={styles.sectionTitle}>Continuă antrenamentul</Text>
        </View>
        <Link href="/(tabs)/scenarios" asChild>
          <Pressable style={({ pressed }) => [styles.sectionLinkRow, pressed && styles.pressableFeedback]}>
            <Text style={styles.sectionLink}>Vezi toate</Text>
            <View style={styles.sectionLinkIcon}>
              <Ionicons name="arrow-forward" size={12} color={TrainingColors.accentTeal} />
            </View>
          </Pressable>
        </Link>
      </View>
      <View style={styles.scenarioList}>
        {scenarioCards.map((scenario, index) => {
          const accent =
            scenario.attackType === 'phishing'
              ? TrainingColors.accentBlue
              : scenario.attackType === 'smishing'
                ? TrainingColors.accentTeal
                : TrainingColors.accentAmber;
          return (
            <Link
              key={scenario.id}
              href={{
                pathname: '/chat/[scenarioId]',
                params: {
                  scenarioId: scenario.id,
                  attackType: scenario.attackType,
                  difficulty: scenario.difficulty,
                  sessionId: sessionId ?? undefined,
                },
              }}
              asChild>
              <Pressable
                style={({ pressed }) => [
                  styles.scenarioCard,
                  isCompact && styles.scenarioCardCompact,
                  pressed && styles.scenarioCardPressed,
                ]}>
                <View style={[styles.scenarioAccent, { backgroundColor: accent }]} />
                <View style={styles.scenarioTopRow}>
                  <View
                    style={[
                      styles.scenarioIcon,
                      isCompact && styles.scenarioIconCompact,
                      {
                        backgroundColor: `${accent}16`,
                        borderColor: `${accent}42`,
                      },
                    ]}>
                    <Ionicons name={scenario.icon} size={18} color={accent} />
                  </View>
                  <View style={styles.scenarioHeading}>
                    <Text style={[styles.scenarioType, { color: accent }]}>{scenario.type}</Text>
                    <Text style={styles.scenarioIndex}>SCENARIUL {index + 1}</Text>
                  </View>
                  <View style={styles.scenarioArrow}>
                    <Ionicons name="arrow-forward" size={15} color={TrainingColors.textSecondary} />
                  </View>
                </View>

                <Text
                  numberOfLines={2}
                  style={[styles.scenarioTitle, isCompact && styles.scenarioTitleCompact]}>
                  {scenario.title}
                </Text>

                <View style={styles.scenarioFooter}>
                  <View style={styles.scenarioMeta}>
                    <Ionicons name="speedometer-outline" size={13} color={TrainingColors.textMuted} />
                    <Text style={styles.scenarioMetaText}>
                      Nivel {DIFFICULTY_LABELS[scenario.difficulty].toLowerCase()}
                    </Text>
                  </View>
                  <RiskBadge level={scenario.risk} />
                </View>
              </Pressable>
            </Link>
          );
        })}
      </View>

      <View style={[styles.tipCard, isCompact && styles.tipCardCompact]}>
        <View style={styles.tipTopRow}>
          <View style={styles.tipIcon}>
            <Ionicons name="sparkles" size={17} color={TrainingColors.accentTeal} />
          </View>
          <View style={styles.tipHeading}>
            <Text style={styles.tipEyebrow}>RECOMANDARE ADAPTIVĂ</Text>
            <Text style={styles.tipTitle}>Insight-ul zilei</Text>
          </View>
          <View style={styles.tipStatus}>
            <View style={styles.tipStatusDot} />
            <Text style={styles.tipStatusText}>ACTIV</Text>
          </View>
        </View>
        <Text style={styles.tipText}>
          {evaluation?.recommendation?.reason ??
            adaptiveProfile?.recommended_next.reason ??
            'Antrenează mai întâi categoria cu acuratețea cea mai mică, apoi crește gradual dificultatea.'}
        </Text>
      </View>

      <Link href="/(tabs)/learn" asChild>
        <Pressable
          style={({ pressed }) => [
            styles.learnCard,
            isCompact && styles.learnCardCompact,
            pressed && styles.scenarioCardPressed,
          ]}>
          <View style={styles.learnGlow} />
          <View style={styles.learnIcon}>
            <Ionicons name="book-outline" size={20} color={TrainingColors.accentTeal} />
          </View>
          <View style={styles.learnContent}>
            <Text style={styles.learnEyebrow}>BIBLIOTECA CYBER</Text>
            <Text style={styles.learnTitle}>Transformă greșelile în cunoștințe</Text>
            <Text style={styles.learnText}>
              Lecții scurte, quiz-uri și explicații ghidate de AI.
            </Text>
            <View style={styles.learnAction}>
              <Text style={styles.learnActionText}>Explorează lecțiile</Text>
              <Ionicons name="arrow-forward" size={13} color={TrainingColors.accentTeal} />
            </View>
          </View>
        </Pressable>
      </Link>
      </ScrollView>
    </View>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const tone =
    level === 'Critic'
      ? styles.riskCritical
      : level === 'Ridicat'
        ? styles.riskHigh
        : level === 'Mediu'
          ? styles.riskMedium
          : styles.riskLow;
  const textTone =
    level === 'Critic'
      ? styles.riskTextCritical
      : level === 'Ridicat'
        ? styles.riskTextHigh
        : level === 'Mediu'
          ? styles.riskTextMedium
          : styles.riskTextLow;
  const dotColor =
    level === 'Scăzut'
      ? TrainingColors.accentTeal
      : level === 'Mediu'
        ? TrainingColors.accentAmber
        : TrainingColors.accentDanger;
  return (
    <View style={[styles.riskBadge, tone]}>
      <View style={[styles.riskDot, { backgroundColor: dotColor }]} />
      <Text style={[styles.riskText, textTone]}>Risc {level.toLowerCase()}</Text>
    </View>
  );
}

function FocusStat({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.focusStat}>
      <Ionicons name={icon} size={14} color={TrainingColors.accentTeal} />
      <Text style={styles.focusStatValue}>{value}</Text>
      <Text style={styles.focusStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20, paddingTop: 50, paddingBottom: 130, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: TrainingColors.buttonPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    shadowColor: TrainingColors.accentBlue,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },
  welcomeEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 1,
  },
  headerTitle: { color: TrainingColors.textPrimary, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  headerSubtitle: { color: TrainingColors.textSecondary, fontSize: 12, marginTop: 1 },
  headerTitleCompact: { fontSize: 20 },
  headerSubtitleCompact: { fontSize: 11 },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    ...TrainingShadows.card,
  },
  focusPanel: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(77, 228, 178, 0.34)',
    backgroundColor: 'rgba(15, 35, 45, 0.96)',
    padding: 18,
    gap: 13,
    ...TrainingShadows.card,
  },
  focusTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  focusHeading: { flex: 1 },
  focusEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  focusTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    marginTop: 3,
  },
  focusLevelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(246,199,110,0.35)',
    backgroundColor: 'rgba(246,199,110,0.11)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  focusLevelText: { color: TrainingColors.accentAmber, fontSize: 11, fontWeight: '900' },
  focusText: { color: TrainingColors.textSecondary, fontSize: 12, lineHeight: 18 },
  focusProgressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: TrainingColors.panelSoft,
    overflow: 'hidden',
  },
  focusProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: TrainingColors.accentTeal,
  },
  focusStatsRow: { flexDirection: 'row', gap: 8 },
  focusStat: {
    flex: 1,
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.borderSubtle,
    backgroundColor: 'rgba(5,10,19,0.3)',
    padding: 10,
    justifyContent: 'center',
  },
  focusStatValue: { color: TrainingColors.textPrimary, fontSize: 16, fontWeight: '900', marginTop: 4 },
  focusStatLabel: { color: TrainingColors.textMuted, fontSize: 9, fontWeight: '800', marginTop: 1 },
  liveSnapshot: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: TrainingColors.borderSubtle,
    backgroundColor: 'rgba(5,10,19,0.24)',
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  liveSnapshotSuccess: {
    borderColor: 'rgba(77, 228, 178, 0.22)',
    backgroundColor: 'rgba(77, 228, 178, 0.07)',
  },
  liveSnapshotWarning: {
    borderColor: 'rgba(246, 199, 110, 0.24)',
    backgroundColor: 'rgba(246, 199, 110, 0.08)',
  },
  liveSnapshotDanger: {
    borderColor: 'rgba(255, 133, 141, 0.25)',
    backgroundColor: 'rgba(255, 133, 141, 0.08)',
  },
  liveSnapshotIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TrainingColors.borderSubtle,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveSnapshotCopy: { flex: 1, minWidth: 0 },
  liveSnapshotLabel: {
    color: TrainingColors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
  },
  liveSnapshotText: {
    color: TrainingColors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  focusActions: { flexDirection: 'row', gap: 8 },
  primaryPathButton: {
    flex: 1.35,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    backgroundColor: TrainingColors.buttonPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  primaryPathButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  secondaryPathButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  secondaryPathButtonText: { color: TrainingColors.textPrimary, fontSize: 12, fontWeight: '800' },
  unlockHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(246,199,110,0.22)',
    backgroundColor: 'rgba(246,199,110,0.08)',
    padding: 10,
  },
  unlockHintText: { flex: 1, color: TrainingColors.accentAmber, fontSize: 11, lineHeight: 16 },
  scoreCard: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    backgroundColor: 'rgba(13, 24, 40, 0.94)',
    padding: 20,
    overflow: 'hidden',
    ...TrainingShadows.card,
  },
  scoreCardCompact: { padding: 14, gap: 10, borderRadius: 20 },
  pathCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(69,224,177,0.35)',
    backgroundColor: 'rgba(19, 42, 52, 0.92)',
    padding: 16,
    ...TrainingShadows.card,
  },
  pathIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
  },
  pathContent: { flex: 1, gap: 4 },
  pathTopRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  pathEyebrow: { color: TrainingColors.accentTeal, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  pathLevel: { color: TrainingColors.accentAmber, fontSize: 10, fontWeight: '800' },
  pathTitle: { color: TrainingColors.textPrimary, fontSize: 13, fontWeight: '800' },
  pathProgressTrack: {
    height: 5,
    borderRadius: 4,
    backgroundColor: TrainingColors.panelSoft,
    overflow: 'hidden',
  },
  pathProgressFill: { height: '100%', backgroundColor: TrainingColors.accentTeal },
  pathMeta: { color: TrainingColors.textSecondary, fontSize: 9 },
  unlockPanel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.9)',
    padding: 16,
    gap: 12,
    ...TrainingShadows.card,
  },
  unlockPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  unlockPanelHeading: { flex: 1 },
  unlockPanelEyebrow: {
    color: TrainingColors.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  unlockPanelTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  unlockPanelAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(77, 228, 178, 0.28)',
    backgroundColor: 'rgba(77, 228, 178, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  unlockPanelActionText: { color: TrainingColors.accentTeal, fontSize: 11, fontWeight: '900' },
  unlockRows: { gap: 8 },
  unlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.borderSubtle,
    backgroundColor: 'rgba(5, 10, 19, 0.25)',
    paddingHorizontal: 11,
    paddingVertical: 10,
    gap: 10,
  },
  unlockDifficultyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  unlockDotEasy: { backgroundColor: TrainingColors.accentTeal },
  unlockDotMedium: { backgroundColor: TrainingColors.accentAmber },
  unlockDotHard: { backgroundColor: TrainingColors.accentDanger },
  unlockRowText: { flex: 1 },
  unlockRowTitle: { color: TrainingColors.textPrimary, fontSize: 12, fontWeight: '900' },
  unlockRowMeta: { color: TrainingColors.textMuted, fontSize: 10, marginTop: 1 },
  unlockStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.borderSubtle,
    backgroundColor: TrainingColors.panel,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  unlockStatusOpen: {
    borderColor: 'rgba(77, 228, 178, 0.32)',
    backgroundColor: 'rgba(77, 228, 178, 0.09)',
  },
  unlockStatusText: { color: TrainingColors.textMuted, fontSize: 10, fontWeight: '800' },
  unlockStatusTextOpen: { color: TrainingColors.accentTeal },
  adaptiveCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.9)',
    padding: 16,
    gap: 8,
    ...TrainingShadows.card,
  },
  adaptiveTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  adaptiveEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  adaptiveValue: { color: TrainingColors.textPrimary, fontSize: 28, fontWeight: '800', marginTop: 2 },
  adaptivePill: {
    borderRadius: 999,
    backgroundColor: 'rgba(69,224,177,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(69,224,177,0.28)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  adaptivePillText: { color: TrainingColors.accentTeal, fontSize: 10, fontWeight: '700' },
  adaptiveText: { color: TrainingColors.textSecondary, fontSize: 12, lineHeight: 17 },
  adaptiveHint: { color: TrainingColors.textPrimary, fontSize: 12, fontWeight: '700' },
  reviewCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(69,224,177,0.28)',
    backgroundColor: 'rgba(16, 39, 47, 0.92)',
    padding: 16,
    gap: 8,
    ...TrainingShadows.card,
  },
  reviewTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  reviewEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  reviewTitle: { color: TrainingColors.textPrimary, fontSize: 20, fontWeight: '800', marginTop: 2 },
  reviewPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(69,224,177,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(69,224,177,0.28)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  reviewPillText: { color: TrainingColors.accentTeal, fontSize: 10, fontWeight: '700' },
  reviewMeta: { color: TrainingColors.textSecondary, fontSize: 12, lineHeight: 17 },
  reviewProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 12,
  },
  reviewProgressInfo: { flex: 1, gap: 2 },
  reviewProgressLabel: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '700' },
  reviewProgressHint: { color: TrainingColors.textMuted, fontSize: 11 },
  reviewProgressValue: { color: TrainingColors.accentTeal, fontSize: 20, fontWeight: '800' },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    backgroundColor: TrainingColors.buttonPrimary,
    paddingVertical: 11,
  },
  reviewButtonText: { color: '#EFF6FF', fontSize: 13, fontWeight: '700' },
  scoreGlow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -112,
    right: -78,
    backgroundColor: 'rgba(88, 166, 255, 0.22)',
  },
  scoreRing: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 6,
    borderColor: TrainingColors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRingText: { color: TrainingColors.textPrimary, fontSize: 24, fontWeight: '800' },
  scoreRingCompact: { width: 72, height: 72, borderRadius: 36 },
  scoreRingTextCompact: { fontSize: 20 },
  scoreContent: { flex: 1 },
  eyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '800',
  },
  scoreValue: { color: TrainingColors.textPrimary, fontSize: 32, fontWeight: '800', marginTop: 2 },
  scoreValueCompact: { fontSize: 28 },
  scoreOutOf: { color: TrainingColors.textMuted, fontSize: 16, fontWeight: '500' },
  scoreMeta: { color: TrainingColors.textSecondary, fontSize: 12, marginTop: 2 },
  successText: { color: TrainingColors.accentTeal },
  challengeCard: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    backgroundColor: '#286ED5',
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    padding: 18,
    gap: 12,
    shadowColor: TrainingColors.accentBlue,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 7,
  },
  challengeCardCompact: { padding: 12, gap: 10, borderRadius: 20 },
  pressableFeedback: { opacity: 0.92 },
  challengeIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  challengeIconCompact: { width: 40, height: 40, borderRadius: 12 },
  challengeEyebrow: {
    color: '#CFE0F8',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 10,
    fontWeight: '700',
  },
  challengeTitle: { color: '#EFF6FF', fontWeight: '700', marginTop: 1 },
  challengeMeta: { color: '#CFE0F8', fontSize: 12, marginTop: 1 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricGridCompact: { flexWrap: 'wrap' },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.92)',
    padding: 12,
    gap: 6,
    minWidth: 105,
    ...TrainingShadows.card,
  },
  metricCardCompact: { padding: 10 },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricTime: {
    color: TrainingColors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  metricValue: { color: TrainingColors.textPrimary, fontSize: 28, fontWeight: '800' },
  metricLabel: { color: TrainingColors.textSecondary, fontSize: 12 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionEyebrow: {
    color: TrainingColors.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginBottom: 3,
  },
  sectionTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 3 },
  sectionLink: { color: TrainingColors.accentTeal, fontSize: 12, fontWeight: '700' },
  sectionLinkIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(77, 228, 178, 0.28)',
    backgroundColor: 'rgba(77, 228, 178, 0.09)',
  },
  scenarioList: { gap: 11 },
  scenarioCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.92)',
    padding: 15,
    gap: 10,
    ...TrainingShadows.card,
  },
  scenarioCardCompact: { padding: 13, gap: 8 },
  scenarioCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.992 }],
  },
  scenarioAccent: {
    position: 'absolute',
    top: 14,
    bottom: 14,
    left: 0,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  scenarioTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scenarioIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  scenarioIconCompact: { width: 36, height: 36, borderRadius: 10 },
  scenarioHeading: { flex: 1, gap: 2 },
  scenarioType: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontWeight: '800',
  },
  scenarioIndex: {
    color: TrainingColors.textMuted,
    fontSize: 9,
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  scenarioArrow: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TrainingColors.panelAlt,
    borderWidth: 1,
    borderColor: TrainingColors.borderSubtle,
  },
  scenarioTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    letterSpacing: -0.15,
    paddingLeft: 2,
  },
  scenarioTitleCompact: { fontSize: 13 },
  scenarioFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: TrainingColors.borderSubtle,
    paddingTop: 10,
    marginTop: 1,
  },
  scenarioMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  scenarioMetaText: { color: TrainingColors.textMuted, fontSize: 10, fontWeight: '600' },
  riskBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
  riskDot: { width: 5, height: 5, borderRadius: 3 },
  riskText: { fontSize: 9, letterSpacing: 0.3, fontWeight: '800' },
  riskTextLow: { color: TrainingColors.accentTeal },
  riskTextMedium: { color: TrainingColors.accentAmber },
  riskTextHigh: { color: TrainingColors.accentDanger },
  riskTextCritical: { color: TrainingColors.accentDanger },
  riskLow: { borderColor: 'rgba(69,224,177,0.35)', backgroundColor: 'rgba(69,224,177,0.12)' },
  riskMedium: { borderColor: 'rgba(245,197,107,0.35)', backgroundColor: 'rgba(245,197,107,0.12)' },
  riskHigh: { borderColor: 'rgba(255,125,125,0.35)', backgroundColor: 'rgba(255,125,125,0.1)' },
  riskCritical: { borderColor: 'rgba(255,125,125,0.6)', backgroundColor: 'rgba(255,125,125,0.16)' },
  tipCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(77, 228, 178, 0.26)',
    backgroundColor: 'rgba(14, 35, 43, 0.95)',
    gap: 12,
    padding: 16,
    ...TrainingShadows.card,
  },
  tipCardCompact: { padding: 13, gap: 10 },
  tipTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(77, 228, 178, 0.13)',
    borderWidth: 1,
    borderColor: 'rgba(77, 228, 178, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipHeading: { flex: 1 },
  tipEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  tipTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '800', marginTop: 2 },
  tipStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(77, 228, 178, 0.08)',
  },
  tipStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: TrainingColors.accentTeal,
  },
  tipStatusText: {
    color: TrainingColors.accentTeal,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  tipText: {
    color: TrainingColors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    paddingLeft: 2,
  },
  learnCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(104, 169, 255, 0.28)',
    backgroundColor: 'rgba(15, 29, 48, 0.96)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    ...TrainingShadows.card,
  },
  learnCardCompact: { padding: 13, gap: 10 },
  learnGlow: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    right: -80,
    top: -90,
    backgroundColor: 'rgba(104, 169, 255, 0.1)',
  },
  learnIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77, 228, 178, 0.11)',
    borderWidth: 1,
    borderColor: 'rgba(77, 228, 178, 0.22)',
  },
  learnContent: { flex: 1 },
  learnEyebrow: {
    color: TrainingColors.accentBlue,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  learnTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
  },
  learnText: { color: TrainingColors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 },
  learnAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  learnActionText: { color: TrainingColors.accentTeal, fontSize: 11, fontWeight: '800' },
});
