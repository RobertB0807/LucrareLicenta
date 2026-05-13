import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import type { AttackType, DifficultyLevel } from '@/features/training/types';
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

function recommendedDifficulty(accuracy: number, attempts: number): DifficultyLevel {
  if (attempts < 2) return 'easy';
  if (accuracy < 50) return 'easy';
  if (accuracy < 80) return 'medium';
  return 'hard';
}

export default function DashboardScreen() {
  const { stats, perAttackStats, evaluation, sessionId, scenarioCatalog } = useTrainingSession();
  const { user, logout } = useAuth();

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

  const cyberScore = Math.max(0, Math.min(100, stats.accuracy));
  const estimatedDetected = Math.round((stats.totalAttempts * stats.accuracy) / 100);
  const mistakes = Math.max(0, stats.totalAttempts - estimatedDetected);

  const scenarioCards = useMemo(
    () =>
      perAttackStats
        .map(({ id, value }) => {
          const accuracy = value?.accuracy ?? 0;
          const attempts = value?.attempts ?? 0;
          const difficulty = recommendedDifficulty(accuracy, attempts);
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
          const aAccuracy = perAttackStats.find((item) => item.id === a.attackType)?.value?.accuracy ?? 0;
          const bAccuracy = perAttackStats.find((item) => item.id === b.attackType)?.value?.accuracy ?? 0;
          return aAccuracy - bAccuracy;
        }),
    [perAttackStats, scenarioPreviewByKey]
  );

  const challenge = useMemo(() => {
    if (evaluation?.recommendation) {
      const attack = evaluation.recommendation.attack_type;
      return {
        title: `Scenariu recomandat · ${ATTACK_LABELS[attack]}`,
        difficulty: evaluation.recommendation.difficulty,
        attackType: attack,
      };
    }

    const fallback = scenarioCards[0];
    return {
      title: fallback ? `Zonă prioritară · ${fallback.type}` : 'Provocarea zilei',
      difficulty: fallback?.difficulty ?? 'easy',
      attackType: fallback?.attackType ?? 'phishing',
    };
  }, [evaluation?.recommendation, scenarioCards]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="shield-half" size={18} color="#EFF6FF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>
              {user ? `Bună, ${user.displayName}` : 'Panou de antrenament'}
            </Text>
            <Text style={styles.headerSubtitle}>Rămâi atent. Rămâi în siguranță.</Text>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [styles.logoutButton, pressed && styles.pressableFeedback]}
          onPress={logout}
        >
          <Ionicons name="log-out-outline" size={17} color={TrainingColors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.scoreCard}>
        <View style={styles.scoreGlow} />
        <View style={styles.scoreRing}>
          <Text style={styles.scoreRingText}>{cyberScore}</Text>
        </View>
        <View style={styles.scoreContent}>
          <Text style={styles.eyebrow}>Scor de securitate</Text>
          <Text style={styles.scoreValue}>
            {cyberScore}
            <Text style={styles.scoreOutOf}> / 100</Text>
          </Text>
          <Text style={styles.scoreMeta}>
            {stats.totalAttempts} încercări · <Text style={styles.successText}>Sesiune activă</Text>
          </Text>
        </View>
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
        <Pressable style={({ pressed }) => [styles.challengeCard, pressed && styles.pressableFeedback]}>
          <View style={styles.challengeIcon}>
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

      <View style={styles.metricGrid}>
        {[
          {
            label: 'Atacuri detectate',
            value: `${estimatedDetected}`,
            icon: 'shield-checkmark' as keyof typeof Ionicons.glyphMap,
            tone: 'success' as const,
          },
          {
            label: 'Greșeli făcute',
            value: `${mistakes}`,
            icon: 'warning' as keyof typeof Ionicons.glyphMap,
            tone: 'warning' as const,
          },
        ].map((s) => (
          <View key={s.label} style={styles.metricCard}>
            <View style={styles.metricTop}>
              <Ionicons
                name={s.icon}
                size={16}
                color={s.tone === 'success' ? TrainingColors.accentTeal : TrainingColors.accentAmber}
              />
              <Text style={styles.metricTime}>Luna aceasta</Text>
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
            <Pressable style={({ pressed }) => [styles.scenarioCard, pressed && styles.pressableFeedback]}>
              <View style={styles.scenarioIcon}>
                <Ionicons name={scenario.icon} size={18} color={TrainingColors.accentTeal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.scenarioType}>{scenario.type}</Text>
                <Text style={styles.scenarioTitle}>{scenario.title}</Text>
              </View>
              <RiskBadge level={scenario.risk} />
            </Pressable>
          </Link>
        ))}
      </View>

      <View style={styles.tipCard}>
        <View style={styles.tipIcon}>
          <Ionicons name="sparkles" size={15} color={TrainingColors.accentTeal} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tipTitle}>Insight-ul zilei</Text>
          <Text style={styles.tipText}>
            {evaluation?.recommendation?.reason ??
              'Antrenează mai întâi categoria cu acuratețea cea mai mică, apoi crește gradual dificultatea.'}
          </Text>
        </View>
      </View>

      <Link href="/(tabs)/learn" asChild>
        <Pressable style={({ pressed }) => [styles.learnCard, pressed && styles.pressableFeedback]}>
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
  scoreContent: { flex: 1 },
  eyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '800',
  },
  scoreValue: { color: TrainingColors.textPrimary, fontSize: 32, fontWeight: '800', marginTop: 2 },
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
  pressableFeedback: { opacity: 0.92 },
  challengeIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  challengeEyebrow: {
    color: '#CFE0F8',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 10,
    fontWeight: '700',
  },
  challengeTitle: { color: '#EFF6FF', fontWeight: '700', marginTop: 1 },
  challengeMeta: { color: '#CFE0F8', fontSize: 12, marginTop: 1 },
  metricGrid: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 12,
    gap: 6,
  },
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
  scenarioType: {
    color: TrainingColors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  scenarioTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 1 },
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
