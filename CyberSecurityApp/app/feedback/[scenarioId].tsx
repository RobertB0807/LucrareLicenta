import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TrainingColors } from '@/features/training/ui-theme';

const config = {
  right: {
    title: 'Excellent decision',
    badge: 'Threat neutralized',
    score: '+25 XP',
    body: "You verified through a trusted channel instead of the link the attacker sent. That's exactly the right move.",
    color: TrainingColors.accentTeal,
    icon: 'checkmark-circle' as const,
  },
  wrong: {
    title: 'You fell for it',
    badge: 'Credentials compromised',
    score: '-15 XP',
    body: 'The link looked official but pointed to a spoofed domain. In the real world, your password would now be in attacker hands.',
    color: TrainingColors.accentDanger,
    icon: 'close-circle' as const,
  },
  neutral: {
    title: 'Cautious — but not safe',
    badge: 'Risk reduced, not removed',
    score: '+5 XP',
    body: 'Asking for their employee ID is good instinct, but a skilled attacker will improvise. Always end the conversation and verify independently.',
    color: TrainingColors.accentAmber,
    icon: 'warning' as const,
  },
};

const redFlags = [
  { label: 'Urgent 10-minute deadline', severity: 'High' },
  { label: 'Suspicious domain: secur3-bank-verify.com', severity: 'Critical' },
  { label: 'Unsolicited contact about charges', severity: 'Medium' },
  { label: 'Requesting credentials over chat', severity: 'High' },
];

export default function FeedbackScreen() {
  const { scenarioId, verdict } = useLocalSearchParams<{ scenarioId: string; verdict?: 'right' | 'wrong' | 'neutral' }>();
  const key = verdict && verdict in config ? verdict : 'neutral';
  const details = config[key];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={[styles.hero, { borderColor: details.color }]}>
        <View style={[styles.heroIcon, { backgroundColor: details.color }]}>
          <Ionicons name={details.icon} size={26} color="#EFF6FF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroBadge}>{details.badge}</Text>
          <Text style={styles.heroTitle}>{details.title}</Text>
          <View style={styles.scorePill}>
            <Ionicons name="trophy-outline" size={12} color="#EFF6FF" />
            <Text style={styles.scoreText}>{details.score}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="sparkles" size={14} color={TrainingColors.accentTeal} />
          <Text style={styles.sectionEyebrow}>AI debrief</Text>
        </View>
        <Text style={styles.sectionText}>{details.body}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Red flags in this attack</Text>
        <View style={styles.flags}>
          {redFlags.map((flag) => (
            <View key={flag.label} style={styles.flagRow}>
              <View
                style={[
                  styles.flagIcon,
                  flag.severity === 'Critical'
                    ? styles.flagCritical
                    : flag.severity === 'High'
                      ? styles.flagHigh
                      : styles.flagMedium,
                ]}>
                <Ionicons name="alert" size={13} color={TrainingColors.accentDanger} />
              </View>
              <Text style={styles.flagLabel}>{flag.label}</Text>
              <View style={styles.flagPill}>
                <Text style={styles.flagPillText}>{flag.severity}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        <Link href="/(tabs)/scenarios" asChild>
          <Pressable style={({ pressed }) => [styles.primaryAction, pressed && styles.actionPressed]}>
            <Text style={styles.primaryActionText}>Next scenario</Text>
          </Pressable>
        </Link>
        <Link href={{ pathname: '/chat/[scenarioId]', params: { scenarioId } }} asChild>
          <Pressable style={({ pressed }) => [styles.secondaryAction, pressed && styles.actionPressed]}>
            <Text style={styles.secondaryActionText}>Retry simulation</Text>
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
  flagPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  flagPillText: { color: TrainingColors.textSecondary, textTransform: 'uppercase', fontSize: 9, letterSpacing: 0.8, fontWeight: '700' },
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
  actionPressed: { opacity: 0.92 },
});
