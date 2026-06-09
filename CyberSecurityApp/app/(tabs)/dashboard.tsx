import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Link, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import type { AttackType, DifficultyLevel, LearningProfileAttack } from '@/features/training/types';
import { TrainingColors } from '@/features/training/ui-theme';
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

export default function DashboardScreen() {
  const {
    stats,
    perAttackStats,
    evaluation,
    sessionId,
    scenarioCatalog,
    adaptiveProfile,
    isLoadingAdaptiveProfile,
    learningPath,
    isLoadingLearningPath,
    refreshActiveSession,
    refreshAdaptiveProfile,
    refreshLearningPath,
  } = useTrainingSession();
  const { user, logout } = useAuth();
  const router = useRouter();
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
      const key = `${item.attack_type}-${item.difficulty}`;
      if (!map[key]) {
        map[key] = item.attacker_message_preview;
      }
    }
    return map;
  }, [scenarioCatalog]);

  const adaptiveAttackMap = useMemo(() => {
    const map = new Map<AttackType, LearningProfileAttack>();
    for (const item of adaptiveProfile?.by_attack ?? []) {
      map.set(item.attack_type, item);
    }
    return map;
  }, [adaptiveProfile?.by_attack]);

  useFocusEffect(
    useCallback(() => {
      void refreshActiveSession();
      void refreshAdaptiveProfile();
      void refreshLearningPath();
    }, [refreshActiveSession, refreshAdaptiveProfile, refreshLearningPath])
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
  }, [adaptiveProfile?.recommended_next, evaluation?.recommendation, scenarioCards]);

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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, contentInsets]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="shield-half" size={18} color="#EFF6FF" />
          </View>
          <View>
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
            accessibilityLabel="Deconectare"
            style={({ pressed }) => [styles.logoutButton, pressed && styles.pressableFeedback]}
            onPress={() => {
              void logout().catch(() => undefined).then(() => {
                router.replace('/login');
              });
            }}>
            <Ionicons name="log-out-outline" size={17} color={TrainingColors.textMuted} />
          </Pressable>
        </View>
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

      <Pressable
        style={({ pressed }) => [styles.pathCard, pressed && styles.pressableFeedback]}
        onPress={() => router.push('/learning-path' as Href)}>
        <View style={styles.pathIcon}>
          <Ionicons name="map-outline" size={21} color="#EFF6FF" />
        </View>
        <View style={styles.pathContent}>
          <View style={styles.pathTopRow}>
            <Text style={styles.pathEyebrow}>TRASEU DE ÎNVĂȚARE</Text>
            <Text style={styles.pathLevel}>
              {learningPath ? `Nivel ${learningPath.level}` : isLoadingLearningPath ? '...' : 'Nivel 1'}
            </Text>
          </View>
          <Text style={styles.pathTitle}>
            {learningPath?.next_action?.title ?? 'Construiește-ți progresul pas cu pas'}
          </Text>
          <View style={styles.pathProgressTrack}>
            <View
              style={[
                styles.pathProgressFill,
                { width: `${learningPath?.overall_progress ?? 0}%` },
              ]}
            />
          </View>
          <Text style={styles.pathMeta}>
            {learningPath
              ? `${learningPath.completed_modules}/${learningPath.total_modules} module · ${learningPath.xp} XP`
              : 'Module, obiective, niveluri și insigne'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={TrainingColors.accentTeal} />
      </Pressable>

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
        <Text style={styles.sectionTitle}>Continuă antrenamentul</Text>
        <Link href="/(tabs)/scenarios" asChild>
          <Pressable style={({ pressed }) => [styles.sectionLinkRow, pressed && styles.pressableFeedback]}>
            <Text style={styles.sectionLink}>Vezi toate</Text>
            <Ionicons name="chevron-forward" size={13} color={TrainingColors.accentTeal} />
          </Pressable>
        </Link>
      </View>
      <View style={styles.scenarioList}>
        {scenarioCards.map((scenario) => (
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
                pressed && styles.pressableFeedback,
              ]}>
              <View style={[styles.scenarioIcon, isCompact && styles.scenarioIconCompact]}>
                <Ionicons name={scenario.icon} size={18} color={TrainingColors.accentTeal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.scenarioType}>{scenario.type}</Text>
                <Text style={[styles.scenarioTitle, isCompact && styles.scenarioTitleCompact]}>{scenario.title}</Text>
              </View>
              <RiskBadge level={scenario.risk} />
            </Pressable>
          </Link>
        ))}
      </View>

      <View style={[styles.tipCard, isCompact && styles.tipCardCompact]}>
        <View style={styles.tipIcon}>
          <Ionicons name="sparkles" size={15} color={TrainingColors.accentTeal} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tipTitle}>Insight-ul zilei</Text>
          <Text style={styles.tipText}>
            {evaluation?.recommendation?.reason ??
              adaptiveProfile?.recommended_next.reason ??
              'Antrenează mai întâi categoria cu acuratețea cea mai mică, apoi crește gradual dificultatea.'}
          </Text>
        </View>
      </View>

      <Link href="/(tabs)/learn" asChild>
        <Pressable
          style={({ pressed }) => [
            styles.learnCard,
            isCompact && styles.learnCardCompact,
            pressed && styles.pressableFeedback,
          ]}>
          <View style={styles.learnIcon}>
            <Ionicons name="book-outline" size={18} color={TrainingColors.accentTeal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.learnTitle}>Deschide biblioteca de învățare</Text>
            <Text style={styles.learnText}>Lecții ghidate de AI despre phishing, scam-uri și altele</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={TrainingColors.textMuted} />
        </Pressable>
      </Link>
    </ScrollView>
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
  return (
    <View style={[styles.riskBadge, tone]}>
      <Text style={[styles.riskText, textTone]}>{level}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
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
  },
  headerTitle: { color: TrainingColors.textPrimary, fontSize: 22, fontWeight: '800' },
  headerSubtitle: { color: TrainingColors.textSecondary, fontSize: 12 },
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
  },
  scoreCard: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 18,
    overflow: 'hidden',
  },
  scoreCardCompact: { padding: 14, gap: 10, borderRadius: 20 },
  pathCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(69,224,177,0.35)',
    backgroundColor: 'rgba(69,224,177,0.07)',
    padding: 14,
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
  adaptiveCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 14,
    gap: 8,
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
    backgroundColor: 'rgba(69,224,177,0.07)',
    padding: 14,
    gap: 8,
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
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    padding: 16,
    gap: 12,
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
    backgroundColor: TrainingColors.panel,
    padding: 12,
    gap: 6,
    minWidth: 105,
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: TrainingColors.textPrimary, fontSize: 17, fontWeight: '800' },
  sectionLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionLink: { color: TrainingColors.accentTeal, fontSize: 12, fontWeight: '700' },
  scenarioList: { gap: 10 },
  scenarioCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scenarioCardCompact: { padding: 10, gap: 8 },
  scenarioIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
  },
  scenarioIconCompact: { width: 36, height: 36, borderRadius: 10 },
  scenarioType: {
    color: TrainingColors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  scenarioTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 1 },
  scenarioTitleCompact: { fontSize: 13 },
  riskBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
  riskText: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '800' },
  riskTextLow: { color: TrainingColors.accentTeal },
  riskTextMedium: { color: TrainingColors.accentAmber },
  riskTextHigh: { color: TrainingColors.accentDanger },
  riskTextCritical: { color: TrainingColors.accentDanger },
  riskLow: { borderColor: 'rgba(69,224,177,0.35)', backgroundColor: 'rgba(69,224,177,0.12)' },
  riskMedium: { borderColor: 'rgba(245,197,107,0.35)', backgroundColor: 'rgba(245,197,107,0.12)' },
  riskHigh: { borderColor: 'rgba(255,125,125,0.35)', backgroundColor: 'rgba(255,125,125,0.1)' },
  riskCritical: { borderColor: 'rgba(255,125,125,0.6)', backgroundColor: 'rgba(255,125,125,0.16)' },
  tipCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  tipCardCompact: { padding: 10, gap: 8 },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(69,224,177,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitle: { color: TrainingColors.textPrimary, fontSize: 12, fontWeight: '700' },
  tipText: { color: TrainingColors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  learnCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  learnCardCompact: { padding: 10, gap: 8 },
  learnIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(69,224,177,0.14)',
  },
  learnTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '700' },
  learnText: { color: TrainingColors.textSecondary, fontSize: 12, marginTop: 2 },
});
