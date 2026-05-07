import { Ionicons } from '@expo/vector-icons';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TrainingColors } from '@/features/training/ui-theme';
import { useTrainingSession } from '@/features/training/useTrainingSession';

export default function FeedbackScreen() {
  const { scenarioId: routeScenarioId, sessionId: routeSessionId } = useLocalSearchParams<{
    scenarioId?: string;
    sessionId?: string;
  }>();
  const { evaluation, scenario, stats, sessionId } = useTrainingSession();
  const activeSessionId = sessionId ?? routeSessionId;
  const activeScenarioId = scenario?.scenario_id ?? routeScenarioId ?? 'live-session';

  // Determine verdict from real evaluation
  const isCorrect = evaluation?.is_correct ?? false;
  const scoreDelta = evaluation?.score_delta ?? 0;
  const explanation = evaluation?.explanation ?? 'Nu există date de evaluare.';
  const redFlags = scenario?.red_flags ?? [];
  const recommendation = evaluation?.recommendation;

  // Dynamic hero config based on real result
  const heroConfig = isCorrect
    ? {
        title: 'Decizie excelentă!',
        badge: 'Amenințare neutralizată',
        color: TrainingColors.accentTeal,
        icon: 'checkmark-circle' as const,
      }
    : scoreDelta < 0
      ? {
          title: 'Ai căzut în capcană',
          badge: 'Credențiale compromise',
          color: TrainingColors.accentDanger,
          icon: 'close-circle' as const,
        }
      : {
          title: 'Precaut — dar nu în siguranță',
          badge: 'Risc redus, nu eliminat',
          color: TrainingColors.accentAmber,
          icon: 'warning' as const,
        };

  // Format score display
  const scoreDisplay = scoreDelta >= 0 ? `+${scoreDelta} puncte` : `${scoreDelta} puncte`;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Hero section */}
      <View style={[styles.hero, { borderColor: heroConfig.color }]}>
        <View style={[styles.heroIcon, { backgroundColor: heroConfig.color }]}>
          <Ionicons name={heroConfig.icon} size={26} color="#EFF6FF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroBadge}>{heroConfig.badge}</Text>
          <Text style={styles.heroTitle}>{heroConfig.title}</Text>
          <View style={styles.scorePill}>
            <Ionicons name="trophy-outline" size={12} color="#EFF6FF" />
            <Text style={styles.scoreText}>{scoreDisplay}</Text>
          </View>
        </View>
      </View>

      {/* AI Debrief — real explanation */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="sparkles" size={14} color={TrainingColors.accentTeal} />
          <Text style={styles.sectionEyebrow}>Explicație AI</Text>
        </View>
        <Text style={styles.sectionText}>{explanation}</Text>
      </View>

      {/* Red Flags — real data */}
      {redFlags.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Red flags în acest atac</Text>
          <View style={styles.flags}>
            {redFlags.map((flag, index) => (
              <View key={flag} style={styles.flagRow}>
                <View
                  style={[
                    styles.flagIcon,
                    index === 0
                      ? styles.flagCritical
                      : index === 1
                        ? styles.flagHigh
                        : styles.flagMedium,
                  ]}>
                  <Ionicons name="alert" size={13} color={TrainingColors.accentDanger} />
                </View>
                <Text style={styles.flagLabel}>{flag}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Session stats summary */}
      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Sesiune curentă</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.totalScore}</Text>
            <Text style={styles.statLabel}>Scor</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.totalAttempts}</Text>
            <Text style={styles.statLabel}>Încercări</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.accuracy}%</Text>
            <Text style={styles.statLabel}>Acuratețe</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.correctStreak}</Text>
            <Text style={styles.statLabel}>Streak</Text>
          </View>
        </View>
      </View>

      {/* Recommendation */}
      {recommendation ? (
        <View style={styles.recommendCard}>
          <View style={styles.recommendIcon}>
            <Ionicons name="bulb-outline" size={16} color={TrainingColors.accentTeal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.recommendEyebrow}>Recomandare</Text>
            <Text style={styles.recommendText}>{recommendation.reason}</Text>
            <Text style={styles.recommendMeta}>
              {recommendation.attack_type} · {recommendation.difficulty}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        {recommendation ? (
          <Pressable
            style={({ pressed }) => [styles.primaryAction, pressed && styles.actionPressed]}
            onPress={() => {
              router.push({
                pathname: '/chat/[scenarioId]',
                params: {
                  scenarioId: activeScenarioId,
                  attackType: recommendation.attack_type,
                  difficulty: recommendation.difficulty,
                  sessionId: activeSessionId ?? undefined,
                },
              });
            }}>
            <Text style={styles.primaryActionText}>Scenariu recomandat</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.actionPressed]}
          onPress={() => {
            router.push({
              pathname: '/chat/[scenarioId]',
              params: {
                scenarioId: activeScenarioId,
                attackType: scenario?.attack_type ?? 'phishing',
                difficulty: scenario?.difficulty ?? 'easy',
                sessionId: activeSessionId ?? undefined,
              },
            });
          }}>
          <Text style={styles.secondaryActionText}>Reîncearcă simularea</Text>
        </Pressable>

        <Link href="/(tabs)/scenarios" asChild>
          <Pressable style={({ pressed }) => [styles.tertiaryAction, pressed && styles.actionPressed]}>
            <Text style={styles.tertiaryActionText}>Înapoi la scenarii</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  content: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 44, gap: 12, minHeight: '100%' },
  hero: {
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: TrainingColors.panel,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: { color: '#D8E6F8', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 10, fontWeight: '700' },
  heroTitle: { color: TrainingColors.textPrimary, fontSize: 28, fontWeight: '800', marginTop: 2 },
  scorePill: {
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.17)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scoreText: { color: '#EFF6FF', fontSize: 12, fontWeight: '700' },
  section: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 14,
    gap: 8,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionEyebrow: { color: TrainingColors.accentTeal, textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, fontWeight: '700' },
  sectionTitle: { color: TrainingColors.textPrimary, fontSize: 17, fontWeight: '800' },
  sectionText: { color: TrainingColors.textPrimary, fontSize: 13, lineHeight: 18 },
  flags: { gap: 8 },
  flagRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
  },
  flagIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  flagCritical: { backgroundColor: 'rgba(255,125,125,0.2)' },
  flagHigh: { backgroundColor: 'rgba(245,197,107,0.2)' },
  flagMedium: { backgroundColor: 'rgba(69,224,177,0.15)' },
  flagLabel: { flex: 1, color: TrainingColors.textPrimary, fontSize: 13, fontWeight: '600' },
  statsCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 14,
    gap: 10,
  },
  statsTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { color: TrainingColors.textPrimary, fontSize: 22, fontWeight: '800' },
  statLabel: { color: TrainingColors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  recommendCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(69,224,177,0.3)',
    backgroundColor: 'rgba(69,224,177,0.08)',
    padding: 14,
    flexDirection: 'row',
    gap: 10,
  },
  recommendIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(69,224,177,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendEyebrow: {
    color: TrainingColors.accentTeal,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 10,
    fontWeight: '700',
  },
  recommendText: { color: TrainingColors.textPrimary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  recommendMeta: {
    color: TrainingColors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 4,
  },
  actions: { marginTop: 'auto', gap: 8, paddingTop: 10 },
  primaryAction: {
    borderRadius: 16,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryActionText: { color: '#EFF6FF', textAlign: 'center', fontSize: 14, fontWeight: '800' },
  secondaryAction: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryActionText: { color: TrainingColors.textPrimary, textAlign: 'center', fontSize: 14, fontWeight: '700' },
  tertiaryAction: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  tertiaryActionText: { color: TrainingColors.textMuted, textAlign: 'center', fontSize: 13 },
  actionPressed: { opacity: 0.92 },
});
