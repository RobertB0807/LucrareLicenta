import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSessionEvents, getSessionSnapshot, getSessionTrends } from '@/features/training/api';
import type { AttackType, SessionEvent, SessionStats, SessionTrendPointApiResponse } from '@/features/training/types';
import { TrainingColors } from '@/features/training/ui-theme';
import { useTrainingSession } from '@/features/training/useTrainingSession';

type WeakSpot = {
  id: AttackType;
  label: string;
  value: number;
  tone: 'danger' | 'warning';
  icon: keyof typeof Ionicons.glyphMap;
};

type TrendAttackFilter = 'all' | AttackType;
type DateRangeFilter = '7d' | '30d' | 'all';

const ATTACK_LABELS: Record<AttackType, string> = {
  phishing: 'Phishing',
  smishing: 'Smishing',
  impersonation: 'Impersonare',
};

const ATTACK_SHORT_LABELS: Record<AttackType, string> = {
  phishing: 'PH',
  smishing: 'SM',
  impersonation: 'IM',
};

const ATTACK_ICONS: Record<AttackType, keyof typeof Ionicons.glyphMap> = {
  phishing: 'mail-outline',
  smishing: 'chatbubble-ellipses-outline',
  impersonation: 'call-outline',
};

export default function AnalyticsScreen() {
  const { sessionId, stats, perAttackStats } = useTrainingSession();
  const [serverStats, setServerStats] = useState<SessionStats | null>(null);
  const [serverEvents, setServerEvents] = useState<SessionEvent[]>([]);
  const [serverTrends, setServerTrends] = useState<SessionTrendPointApiResponse[]>([]);
  const [serverEventsTotal, setServerEventsTotal] = useState(0);
  const [eventsLimit, setEventsLimit] = useState(12);
  const [trendAttackFilter, setTrendAttackFilter] = useState<TrendAttackFilter>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>('30d');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setEventsLimit(12);
  }, [dateRangeFilter]);

  const rangeSince = useMemo(() => {
    if (dateRangeFilter === 'all') {
      return undefined;
    }

    const days = dateRangeFilter === '7d' ? 7 : 30;
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }, [dateRangeFilter]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!sessionId) {
        setServerStats(null);
        setServerEvents([]);
        setServerTrends([]);
        setServerEventsTotal(0);
        setFetchError(null);
        return;
      }

      setIsLoading(true);
      setFetchError(null);

      try {
        const [snapshot, events, trends] = await Promise.all([
          getSessionSnapshot(sessionId),
          getSessionEvents(sessionId, { limit: eventsLimit, offset: 0, since: rangeSince }),
          getSessionTrends(sessionId, {
            limit: 120,
            offset: 0,
            attackType: trendAttackFilter === 'all' ? undefined : trendAttackFilter,
            since: rangeSince,
          }),
        ]);

        if (cancelled) {
          return;
        }

        setServerStats(snapshot.session_stats);
        setServerEvents(events.events);
        setServerEventsTotal(events.total);
        setServerTrends(trends.points);
      } catch {
        if (!cancelled) {
          setFetchError('Nu am putut incarca datele salvate ale sesiunii.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [eventsLimit, rangeSince, sessionId, trendAttackFilter]);

  const effectiveStats = serverStats ?? {
    total_score: stats.totalScore,
    total_attempts: stats.totalAttempts,
    total_correct: 0,
    accuracy: stats.accuracy,
    correct_streak: stats.correctStreak,
    incorrect_streak: stats.incorrectStreak,
    per_attack: {
      phishing: perAttackStats.find((item) => item.id === 'phishing')?.value ?? {
        attempts: 0,
        correct: 0,
        accuracy: 0,
      },
      smishing: perAttackStats.find((item) => item.id === 'smishing')?.value ?? {
        attempts: 0,
        correct: 0,
        accuracy: 0,
      },
      impersonation: perAttackStats.find((item) => item.id === 'impersonation')?.value ?? {
        attempts: 0,
        correct: 0,
        accuracy: 0,
      },
    },
    recent_events: [],
  };

  const accuracyBars = useMemo(
    () =>
      (Object.keys(ATTACK_LABELS) as AttackType[]).map((attackType) => ({
        id: attackType,
        label: ATTACK_SHORT_LABELS[attackType],
        value: Math.max(0, Math.min(100, effectiveStats.per_attack[attackType]?.accuracy ?? 0)),
      })),
    [effectiveStats.per_attack]
  );

  const weakSpots = useMemo<WeakSpot[]>(
    () =>
      accuracyBars
        .slice()
        .sort((a, b) => a.value - b.value)
        .map((bar, index) => ({
          id: bar.id,
          label: ATTACK_LABELS[bar.id],
          value: bar.value,
          tone: index === 0 ? 'danger' : 'warning',
          icon: ATTACK_ICONS[bar.id],
        })),
    [accuracyBars]
  );

  const activityFeed = serverEvents.length > 0 ? serverEvents : effectiveStats.recent_events;
  const trendSlice = serverTrends.slice(-10);
  const trendStart = trendSlice[0];
  const trendEnd = trendSlice[trendSlice.length - 1];
  const scoreTrendDelta =
    trendStart && trendEnd ? trendEnd.score_after - trendStart.score_after : (trendEnd?.score_after ?? 0);

  const badges = [
    { name: 'Prima detectare', earned: effectiveStats.total_correct > 0 },
    {
      name: 'Expert phishing',
      earned:
        (effectiveStats.per_attack.phishing?.attempts ?? 0) >= 3 &&
        (effectiveStats.per_attack.phishing?.accuracy ?? 0) >= 80,
    },
    { name: 'Serie x3', earned: effectiveStats.correct_streak >= 3 },
    {
      name: 'Campion smishing',
      earned:
        (effectiveStats.per_attack.smishing?.attempts ?? 0) >= 3 &&
        (effectiveStats.per_attack.smishing?.accuracy ?? 0) >= 80,
    },
    {
      name: 'Pro vishing',
      earned:
        (effectiveStats.per_attack.impersonation?.attempts ?? 0) >= 3 &&
        (effectiveStats.per_attack.impersonation?.accuracy ?? 0) >= 80,
    },
    {
      name: 'Fără greșeli',
      earned: effectiveStats.total_attempts >= 5 && effectiveStats.incorrect_streak === 0,
    },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="stats-chart" size={18} color="#EFF6FF" />
        </View>
        <View>
          <Text style={styles.title}>Progres</Text>
          <Text style={styles.subtitle}>Apărarea ta, măsurată</Text>
        </View>
      </View>

      {!sessionId ? (
        <View style={styles.emptyCard}>
          <Ionicons name="information-circle-outline" size={18} color={TrainingColors.textMuted} />
          <Text style={styles.emptyText}>
            Nu există o sesiune activă. Rulează un scenariu din tab-ul Antrenează pentru a vedea statistica persistată.
          </Text>
        </View>
      ) : null}

      {fetchError ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={TrainingColors.accentDanger} />
          <Text style={styles.errorText}>{fetchError}</Text>
        </View>
      ) : null}

      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}>
          {isLoading ? (
            <ActivityIndicator size="small" color={TrainingColors.accentTeal} />
          ) : (
            <Ionicons name="sparkles" size={16} color={TrainingColors.accentTeal} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryEyebrow}>Rezumat sesiune</Text>
          <Text style={styles.summaryText}>
            Scor: <Text style={styles.positive}>{effectiveStats.total_score}</Text> · Acuratețe:{' '}
            <Text style={styles.positive}>{effectiveStats.accuracy}%</Text> · Încercări:{' '}
            <Text style={styles.negative}>{effectiveStats.total_attempts}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.filtersCard}>
        <Text style={styles.filtersLabel}>Filtru trend atac</Text>
        <View style={styles.filtersRow}>
          {(['all', 'phishing', 'smishing', 'impersonation'] as const).map((value) => {
            const active = trendAttackFilter === value;
            const label =
              value === 'all'
                ? 'Toate'
                : value === 'phishing'
                  ? 'Phishing'
                  : value === 'smishing'
                    ? 'Smishing'
                    : 'Impersonare';
            return (
              <Text
                key={value}
                onPress={() => setTrendAttackFilter(value)}
                style={[styles.filterChip, active ? styles.filterChipActive : null]}>
                {label}
              </Text>
            );
          })}
        </View>
        <Text style={styles.filtersLabel}>Interval</Text>
        <View style={styles.filtersRow}>
          {(['7d', '30d', 'all'] as const).map((value) => {
            const active = dateRangeFilter === value;
            const label = value === '7d' ? '7 zile' : value === '30d' ? '30 zile' : 'Tot';
            return (
              <Text
                key={value}
                onPress={() => setDateRangeFilter(value)}
                style={[styles.filterChip, active ? styles.filterChipActive : null]}>
                {label}
              </Text>
            );
          })}
        </View>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartEyebrow}>Evoluție sesiune</Text>
            <Text style={styles.chartScore}>{trendEnd?.score_after ?? effectiveStats.total_score}</Text>
          </View>
          <View style={styles.trendPill}>
            <Ionicons
              name={scoreTrendDelta >= 0 ? 'trending-up-outline' : 'trending-down-outline'}
              size={12}
              color={scoreTrendDelta >= 0 ? TrainingColors.accentTeal : TrainingColors.accentDanger}
            />
            <Text style={styles.trendText}>
              {scoreTrendDelta >= 0 ? '+' : ''}
              {scoreTrendDelta} scor
            </Text>
          </View>
        </View>
        {trendSlice.length > 0 ? (
          <View style={styles.bars}>
            {trendSlice.map((point) => (
              <View key={`${point.attempt_index}-${point.timestamp}`} style={styles.barColumn}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      point.is_correct ? styles.barFillActive : styles.barFillMuted,
                      { height: `${Math.max(8, Math.min(100, point.accuracy_after))}%` },
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>{point.attempt_index}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.activityEmptyCard}>
            <Text style={styles.activityEmptyText}>Trendul va apărea după primele răspunsuri evaluate.</Text>
          </View>
        )}
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartEyebrow}>Acuratețe de detecție pe tip de atac</Text>
            <Text style={styles.chartScore}>{effectiveStats.accuracy}%</Text>
          </View>
          <View style={styles.trendPill}>
            <Ionicons name="shield-checkmark-outline" size={12} color={TrainingColors.accentTeal} />
            <Text style={styles.trendText}>{effectiveStats.total_attempts} încercări</Text>
          </View>
        </View>
        <View style={styles.bars}>
          {accuracyBars.map((bar, index) => {
            const isBest = bar.value === Math.max(...accuracyBars.map((item) => item.value));
            return (
              <View key={`${bar.id}-${index}`} style={styles.barColumn}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      isBest ? styles.barFillActive : styles.barFillMuted,
                      { height: `${bar.value}%` },
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>{bar.label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Zone vulnerabile</Text>
      <View style={styles.weakSpotList}>
        {weakSpots.map((spot) => (
          <View key={spot.id} style={styles.weakSpotCard}>
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
                <Text style={styles.weakSpotMeta}>Acuratețe detecție {spot.value}%</Text>
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

      <Text style={styles.sectionTitle}>Activitate recentă</Text>
      <View style={styles.activityList}>
        {activityFeed.length === 0 ? (
          <View style={styles.activityEmptyCard}>
            <Text style={styles.activityEmptyText}>Nu există încă evenimente persistate pentru această sesiune.</Text>
          </View>
        ) : (
          activityFeed.slice(0, 6).map((event) => (
            <View key={event.id} style={styles.activityCard}>
              <Text style={styles.activityTitle}>{event.title}</Text>
              <Text style={styles.activityDetail}>{event.detail}</Text>
            </View>
          ))
        )}
        {serverEventsTotal > serverEvents.length ? (
          <Text onPress={() => setEventsLimit((current) => current + 12)} style={styles.loadMoreText}>
            Încarcă mai multă activitate
          </Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Insigne</Text>
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
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  emptyText: { color: TrainingColors.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,125,125,0.35)',
    backgroundColor: 'rgba(255,125,125,0.08)',
    padding: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  errorText: { color: TrainingColors.textPrimary, fontSize: 12, flex: 1 },
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
  negative: { color: TrainingColors.accentAmber, fontWeight: '700' },
  filtersCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 12,
    gap: 6,
  },
  filtersLabel: { color: TrainingColors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  filtersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    color: TrainingColors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  filterChipActive: {
    borderColor: TrainingColors.buttonPrimaryBorder,
    backgroundColor: TrainingColors.buttonPrimary,
    color: '#EFF6FF',
  },
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
  activityList: { gap: 8 },
  activityCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 10,
    gap: 4,
  },
  activityTitle: { color: TrainingColors.textPrimary, fontSize: 12, fontWeight: '700' },
  activityDetail: { color: TrainingColors.textSecondary, fontSize: 11, lineHeight: 16 },
  activityEmptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 10,
  },
  activityEmptyText: { color: TrainingColors.textMuted, fontSize: 12 },
  loadMoreText: {
    color: TrainingColors.accentTeal,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 6,
  },
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
