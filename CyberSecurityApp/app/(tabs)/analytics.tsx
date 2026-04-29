import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TrainingColors } from '@/features/training/ui-theme';

const weekly = [42, 51, 48, 60, 66, 72, 78];
const weakSpots = [
  { label: 'Urgency-based attacks', value: 38, icon: 'time-outline' as const, tone: 'danger' as const },
  { label: 'Spoofed links', value: 52, icon: 'link-outline' as const, tone: 'warning' as const },
  { label: 'Voice phishing', value: 64, icon: 'call-outline' as const, tone: 'warning' as const },
];
const badges = [
  { name: 'First Catch', earned: true },
  { name: 'Phishing Expert', earned: true },
  { name: 'Streak x7', earned: true },
  { name: 'Smishing Slayer', earned: false },
  { name: 'Vishing Pro', earned: false },
  { name: 'Zero-Click', earned: false },
];

export default function AnalyticsScreen() {
  const max = Math.max(...weekly);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="stats-chart" size={18} color="#EFF6FF" />
        </View>
        <View>
          <Text style={styles.title}>Progress</Text>
          <Text style={styles.subtitle}>Your defense, measured</Text>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}>
          <Ionicons name="sparkles" size={16} color={TrainingColors.accentTeal} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryEyebrow}>AI summary</Text>
          <Text style={styles.summaryText}>
            You&apos;re <Text style={styles.positive}>+42% sharper</Text> over the past month, but
            still vulnerable to <Text style={styles.negative}>urgency-based attacks</Text>. Practice
            slowing down before responding.
          </Text>
        </View>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartEyebrow}>Cyber score · 7d</Text>
            <Text style={styles.chartScore}>78</Text>
          </View>
          <View style={styles.trendPill}>
            <Ionicons name="trending-up-outline" size={12} color={TrainingColors.accentTeal} />
            <Text style={styles.trendText}>+18%</Text>
          </View>
        </View>
        <View style={styles.bars}>
          {weekly.map((value, index) => {
            const height = (value / max) * 100;
            const isLast = index === weekly.length - 1;
            return (
              <View key={`${value}-${index}`} style={styles.barColumn}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      isLast ? styles.barFillActive : styles.barFillMuted,
                      { height: `${height}%` },
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Weak spots</Text>
      <View style={styles.weakSpotList}>
        {weakSpots.map((spot) => (
          <View key={spot.label} style={styles.weakSpotCard}>
            <View style={styles.weakSpotTop}>
              <View
                style={[
                  styles.weakSpotIcon,
                  spot.tone === 'danger' ? styles.weakSpotIconDanger : styles.weakSpotIconWarning,
                ]}>
                <Ionicons
                  name={spot.icon}
                  size={14}
                  color={spot.tone === 'danger' ? TrainingColors.accentDanger : TrainingColors.accentAmber}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.weakSpotName}>{spot.label}</Text>
                <Text style={styles.weakSpotMeta}>Detection accuracy {spot.value}%</Text>
              </View>
              <Text style={styles.weakSpotValue}>{spot.value}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${spot.value}%` },
                  spot.tone === 'danger' ? styles.progressFillDanger : styles.progressFillWarning,
                ]}
              />
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Badges</Text>
      <View style={styles.badgesGrid}>
        {badges.map((badge) => (
          <View key={badge.name} style={[styles.badgeCard, !badge.earned && styles.badgeCardLocked]}>
            <View style={[styles.badgeIcon, badge.earned ? styles.badgeIconEarned : styles.badgeIconLocked]}>
              <Ionicons name="trophy-outline" size={18} color="#EFF6FF" />
            </View>
            <Text style={styles.badgeText}>{badge.name}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  content: { paddingHorizontal: 20, paddingTop: 50, paddingBottom: 130, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: TrainingColors.textPrimary, fontSize: 24, fontWeight: '800' },
  subtitle: { color: TrainingColors.textSecondary, fontSize: 12 },
  summaryCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  summaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(69,224,177,0.12)',
  },
  summaryEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  summaryText: { color: TrainingColors.textPrimary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  positive: { color: TrainingColors.accentTeal, fontWeight: '700' },
  negative: { color: TrainingColors.accentDanger, fontWeight: '700' },
  chartCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 14,
    gap: 10,
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chartEyebrow: { color: TrainingColors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  chartScore: { color: TrainingColors.textPrimary, fontSize: 32, fontWeight: '800' },
  trendPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(69,224,177,0.25)',
    backgroundColor: 'rgba(69,224,177,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendText: { color: TrainingColors.accentTeal, fontSize: 11, fontWeight: '700' },
  bars: { height: 132, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barColumn: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: {
    height: 112,
    width: '100%',
    borderRadius: 8,
    justifyContent: 'flex-end',
    backgroundColor: TrainingColors.panelAlt,
    overflow: 'hidden',
  },
  barFill: { width: '100%', borderRadius: 8 },
  barFillMuted: { backgroundColor: '#2D3F5E' },
  barFillActive: { backgroundColor: TrainingColors.accentBlue },
  barLabel: { color: TrainingColors.textMuted, fontSize: 10 },
  sectionTitle: { color: TrainingColors.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 4 },
  weakSpotList: { gap: 9 },
  weakSpotCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 12,
    gap: 10,
  },
  weakSpotTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  weakSpotIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  weakSpotIconDanger: { backgroundColor: 'rgba(255,125,125,0.14)' },
  weakSpotIconWarning: { backgroundColor: 'rgba(245,197,107,0.15)' },
  weakSpotName: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '700' },
  weakSpotMeta: { color: TrainingColors.textMuted, fontSize: 11 },
  weakSpotValue: { color: TrainingColors.textPrimary, fontSize: 13, fontWeight: '800' },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: TrainingColors.panelAlt, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  progressFillDanger: { backgroundColor: TrainingColors.accentDanger },
  progressFillWarning: { backgroundColor: TrainingColors.accentAmber },
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badgeCard: {
    width: '31.8%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    gap: 6,
  },
  badgeCardLocked: { opacity: 0.45 },
  badgeIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badgeIconEarned: { backgroundColor: TrainingColors.accentBlue },
  badgeIconLocked: { backgroundColor: '#334A70' },
  badgeText: { color: TrainingColors.textPrimary, fontSize: 10, fontWeight: '700', textAlign: 'center' },
});
