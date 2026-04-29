import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TrainingColors } from '@/features/training/ui-theme';

const stats = [
  {
    label: 'Attacks detected',
    value: '47',
    icon: 'shield-checkmark' as keyof typeof Ionicons.glyphMap,
    tone: 'success' as const,
  },
  {
    label: 'Mistakes made',
    value: '08',
    icon: 'warning' as keyof typeof Ionicons.glyphMap,
    tone: 'warning' as const,
  },
];

const scenarios = [
  {
    id: 'phishing-email-01',
    type: 'Phishing Email',
    title: 'Bank verification alert',
    risk: 'High',
    icon: 'mail-outline' as keyof typeof Ionicons.glyphMap,
  },
  {
    id: 'smishing-01',
    type: 'SMS Scam',
    title: 'Package delivery failed',
    risk: 'Medium',
    icon: 'chatbubble-ellipses-outline' as keyof typeof Ionicons.glyphMap,
  },
  {
    id: 'vishing-01',
    type: 'Fake Support',
    title: 'IT helpdesk callback',
    risk: 'Critical',
    icon: 'call-outline' as keyof typeof Ionicons.glyphMap,
  },
] as const;

export default function DashboardScreen() {
  const cyberScore = 78;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="shield-half" size={18} color="#EFF6FF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Hey, Alex</Text>
            <Text style={styles.headerSubtitle}>Stay sharp. Stay safe.</Text>
          </View>
        </View>
        <View style={styles.bell}>
          <Ionicons name="notifications-outline" size={17} color={TrainingColors.textPrimary} />
          <View style={styles.bellDot} />
        </View>
      </View>

      <View style={styles.scoreCard}>
        <View style={styles.scoreGlow} />
        <View style={styles.scoreRing}>
          <Text style={styles.scoreRingText}>{cyberScore}</Text>
        </View>
        <View style={styles.scoreContent}>
          <Text style={styles.eyebrow}>Cyber Score</Text>
          <Text style={styles.scoreValue}>
            {cyberScore}
            <Text style={styles.scoreOutOf}> / 100</Text>
          </Text>
          <Text style={styles.scoreMeta}>
            +6 this week · <Text style={styles.successText}>Vigilant</Text>
          </Text>
        </View>
      </View>

      <Link href={{ pathname: '/chat/[scenarioId]', params: { scenarioId: 'daily' } }} asChild>
        <Pressable style={({ pressed }) => [styles.challengeCard, pressed && styles.pressableFeedback]}>
          <View style={styles.challengeIcon}>
            <Ionicons name="flame" size={22} color="#EFF6FF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.challengeEyebrow}>Daily challenge</Text>
            <Text style={styles.challengeTitle}>Spot the CEO impersonator</Text>
            <Text style={styles.challengeMeta}>+50 XP · 4 min</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#DCEBFF" />
        </Pressable>
      </Link>

      <View style={styles.metricGrid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.metricCard}>
            <View style={styles.metricTop}>
              <Ionicons
                name={s.icon}
                size={16}
                color={s.tone === 'success' ? TrainingColors.accentTeal : TrainingColors.accentAmber}
              />
              <Text style={styles.metricTime}>This month</Text>
            </View>
            <Text style={styles.metricValue}>{s.value}</Text>
            <Text style={styles.metricLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Continue training</Text>
        <Link href="/(tabs)/scenarios" asChild>
          <Pressable style={({ pressed }) => [styles.sectionLinkRow, pressed && styles.pressableFeedback]}>
            <Text style={styles.sectionLink}>View all</Text>
            <Ionicons name="chevron-forward" size={13} color={TrainingColors.accentTeal} />
          </Pressable>
        </Link>
      </View>
      <View style={styles.scenarioList}>
        {scenarios.map((scenario) => (
          <Link key={scenario.id} href={{ pathname: '/chat/[scenarioId]', params: { scenarioId: scenario.id } }} asChild>
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
          <Text style={styles.tipTitle}>Today&apos;s insight</Text>
          <Text style={styles.tipText}>
            Real banks never ask you to confirm credentials via SMS links. When in doubt, open the
            app directly.
          </Text>
        </View>
      </View>

      <Link href="/(tabs)/learn" asChild>
        <Pressable style={({ pressed }) => [styles.learnCard, pressed && styles.pressableFeedback]}>
          <View style={styles.learnIcon}>
            <Ionicons name="book-outline" size={18} color={TrainingColors.accentTeal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.learnTitle}>Open the Learn library</Text>
            <Text style={styles.learnText}>AI-tutored lessons on phishing, scams & more</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={TrainingColors.textMuted} />
        </Pressable>
      </Link>
    </ScrollView>
  );
}

function RiskBadge({ level }: { level: (typeof scenarios)[number]['risk'] }) {
  const tone =
    level === 'Critical'
      ? styles.riskCritical
      : level === 'High'
        ? styles.riskHigh
        : level === 'Medium'
          ? styles.riskMedium
          : styles.riskLow;
  const textTone =
    level === 'Critical'
      ? styles.riskTextCritical
      : level === 'High'
        ? styles.riskTextHigh
        : level === 'Medium'
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
  bell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    top: 9,
    right: 9,
    backgroundColor: TrainingColors.accentTeal,
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
