import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { getSessionEvents, getSessionSnapshot, getSessionTrendAggregates } from '@/features/training/api';
import type {
  AttackType,
  LearningProfileAttack,
  SessionEvent,
  SessionStats,
  SessionTrendAggregatesApiResponse,
} from '@/features/training/types';
import { TrainingColors } from '@/features/training/ui-theme';
import { useTrainingSession } from '@/features/training/useTrainingSession';

type WeakSpot = {
  id: string;
  label: string;
  value: number;
  detail: string;
  attempts: number;
  mastery: number;
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

const ATTACK_TREND_COLORS: Record<AttackType, string> = {
  phishing: TrainingColors.accentTeal,
  smishing: TrainingColors.accentBlue,
  impersonation: TrainingColors.accentAmber,
};

export default function AnalyticsScreen() {
  const {
    sessionId,
    stats,
    perAttackStats,
    adaptiveProfile,
    isLoadingAdaptiveProfile,
    refreshActiveSession,
    refreshAdaptiveProfile,
  } = useTrainingSession();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const contentInsets = useMemo(
    () => ({
      paddingHorizontal: isCompact ? 16 : 20,
      paddingTop: isCompact ? 40 : 50,
      paddingBottom: isCompact ? 120 : 130,
      gap: isCompact ? 10 : 12,
    }),
    [isCompact]
  );
  const [serverStats, setServerStats] = useState<SessionStats | null>(null);
  const [serverEvents, setServerEvents] = useState<SessionEvent[]>([]);
  const [serverTrendAggregates, setServerTrendAggregates] = useState<SessionTrendAggregatesApiResponse | null>(null);
  const [perAttackTrendAggregates, setPerAttackTrendAggregates] = useState<
    Record<AttackType, SessionTrendAggregatesApiResponse | null>
  >({
    phishing: null,
    smishing: null,
    impersonation: null,
  });
  const [serverEventsTotal, setServerEventsTotal] = useState(0);
  const [eventsLimit, setEventsLimit] = useState(12);
  const [trendAttackFilter, setTrendAttackFilter] = useState<TrendAttackFilter>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>('30d');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [focusRevision, setFocusRevision] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setFocusRevision((current) => current + 1);
      void refreshActiveSession();
      void refreshAdaptiveProfile();
    }, [refreshActiveSession, refreshAdaptiveProfile])
  );

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
        setServerTrendAggregates(null);
        setPerAttackTrendAggregates({
          phishing: null,
          smishing: null,
          impersonation: null,
        });
        setServerEventsTotal(0);
        setFetchError(null);
        return;
      }

      setIsLoading(true);
      setFetchError(null);
      setServerStats(null);

      try {
        const [snapshot, events, trendAggregates, phishingTrend, smishingTrend, impersonationTrend] =
          await Promise.all([
          getSessionSnapshot(sessionId),
          getSessionEvents(sessionId, { limit: eventsLimit, offset: 0, since: rangeSince }),
          getSessionTrendAggregates(sessionId, {
            attackType: trendAttackFilter === 'all' ? undefined : trendAttackFilter,
            since: rangeSince,
          }),
          getSessionTrendAggregates(sessionId, { attackType: 'phishing', since: rangeSince }),
          getSessionTrendAggregates(sessionId, { attackType: 'smishing', since: rangeSince }),
          getSessionTrendAggregates(sessionId, { attackType: 'impersonation', since: rangeSince }),
          ]);

        if (cancelled) {
          return;
        }

        setServerStats(snapshot.session_stats);
        setServerEvents(events.events);
        setServerEventsTotal(events.total);
        setServerTrendAggregates(trendAggregates);
        setPerAttackTrendAggregates({
          phishing: phishingTrend,
          smishing: smishingTrend,
          impersonation: impersonationTrend,
        });
      } catch {
        if (!cancelled) {
          setFetchError('Nu am putut incarca datele salvate ale sesiunii.');
          setPerAttackTrendAggregates({
            phishing: null,
            smishing: null,
            impersonation: null,
          });
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
  }, [
    eventsLimit,
    focusRevision,
    rangeSince,
    sessionId,
    stats.totalAttempts,
    stats.totalScore,
    trendAttackFilter,
  ]);

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

  const aggregateByAttackMap = useMemo(() => {
    const map = new Map<AttackType, SessionTrendAggregatesApiResponse['by_attack'][number]>();
    for (const item of serverTrendAggregates?.by_attack ?? []) {
      map.set(item.attack_type, item);
    }
    return map;
  }, [serverTrendAggregates?.by_attack]);

  const adaptiveByAttackMap = useMemo(() => {
    const map = new Map<AttackType, LearningProfileAttack>();
    for (const item of adaptiveProfile?.by_attack ?? []) {
      map.set(item.attack_type, item);
    }
    return map;
  }, [adaptiveProfile?.by_attack]);

  const accuracyBars = useMemo(() => {
    return (Object.keys(ATTACK_LABELS) as AttackType[]).map((attackType) => {
      const adaptiveItem = adaptiveByAttackMap.get(attackType);
      const aggregateItem = aggregateByAttackMap.get(attackType);
      const accuracy =
        adaptiveItem?.accuracy ?? aggregateItem?.accuracy ?? effectiveStats.per_attack[attackType]?.accuracy ?? 0;
      return {
        id: attackType,
        label: ATTACK_SHORT_LABELS[attackType],
        value: Math.max(0, Math.min(100, accuracy)),
      };
    });
  }, [adaptiveByAttackMap, aggregateByAttackMap, effectiveStats.per_attack]);

  const weakSpots = useMemo<WeakSpot[]>(
    () =>
      adaptiveProfile?.weak_areas?.length
        ? adaptiveProfile.weak_areas
            .slice()
            .sort((a, b) => a.mastery_score - b.mastery_score)
            .map((item, index) => ({
              id: `${item.attack_type}-${item.difficulty}`,
              label: `${ATTACK_LABELS[item.attack_type]} · ${item.difficulty}`,
              detail:
                item.attempts > 0
                  ? `${item.attempts} rulări · ${item.mastery_score}% mastery`
                  : 'Neexplorat încă',
              attempts: item.attempts,
              mastery: item.mastery_score,
              value: item.accuracy,
              tone: index === 0 ? 'danger' : 'warning',
              icon: ATTACK_ICONS[item.attack_type],
            }))
        : accuracyBars
            .slice()
            .sort((a, b) => a.value - b.value)
            .map((bar, index) => ({
              id: bar.id,
              label: ATTACK_LABELS[bar.id],
              detail: `${bar.value}% acuratețe`,
              attempts: effectiveStats.per_attack[bar.id]?.attempts ?? 0,
              mastery: bar.value,
              value: bar.value,
              tone: index === 0 ? 'danger' : 'warning',
              icon: ATTACK_ICONS[bar.id],
            })),
    [accuracyBars, adaptiveProfile?.weak_areas, effectiveStats.per_attack]
  );

  const activityFeed = serverEvents.length > 0 ? serverEvents : effectiveStats.recent_events;
  const trendSlice = (serverTrendAggregates?.by_day ?? []).slice(-10);
  const trendStart = trendSlice[0];
  const trendEnd = trendSlice[trendSlice.length - 1];
  const scoreTrendDelta =
    trendStart && trendEnd
      ? trendEnd.cumulative_score_after - trendStart.cumulative_score_after
      : (trendEnd?.cumulative_score_after ?? 0);
  const trendAttemptsCount =
    serverTrendAggregates?.total_attempts ?? trendSlice.reduce((sum, point) => sum + point.attempts, 0);
  const trendRangeLabel = dateRangeFilter === '7d' ? '7 zile' : dateRangeFilter === '30d' ? '30 zile' : 'Tot';
  const movingAverageWindow = trendSlice.length >= 7 ? 7 : 5;
  const showMovingAverage = trendSlice.length >= movingAverageWindow;
  const movingAverageValues = useMemo(() => {
    if (!showMovingAverage) {
      return [];
    }
    return trendSlice.map((point, index) => {
      const start = Math.max(0, index - movingAverageWindow + 1);
      const windowPoints = trendSlice.slice(start, index + 1);
      const avg = windowPoints.reduce((sum, item) => sum + item.accuracy, 0) / windowPoints.length;
      return Math.round(avg);
    });
  }, [movingAverageWindow, showMovingAverage, trendSlice]);

  const perAttackTrendSeries = useMemo(() => {
    return (Object.keys(ATTACK_LABELS) as AttackType[]).map((attackType) => {
      const series = perAttackTrendAggregates[attackType]?.by_day ?? [];
      const slice = series.slice(-10);
      const points = slice.map((item) => Math.max(0, Math.min(100, item.accuracy)));
      const fallbackAccuracy =
        aggregateByAttackMap.get(attackType)?.accuracy ?? effectiveStats.per_attack[attackType]?.accuracy ?? 0;
      const fallbackAttempts =
        perAttackTrendAggregates[attackType]?.total_attempts ??
        aggregateByAttackMap.get(attackType)?.attempts ??
        effectiveStats.per_attack[attackType]?.attempts ??
        0;
      return {
        attackType,
        label: ATTACK_LABELS[attackType],
        color: ATTACK_TREND_COLORS[attackType],
        latestAccuracy: slice[slice.length - 1]?.accuracy ?? fallbackAccuracy,
        attempts: fallbackAttempts,
        points,
      };
    });
  }, [aggregateByAttackMap, effectiveStats.per_attack, perAttackTrendAggregates]);

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
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, contentInsets]}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="stats-chart" size={18} color="#EFF6FF" />
        </View>
        <View>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>Progres</Text>
          <Text style={[styles.subtitle, isCompact && styles.subtitleCompact]}>Apărarea ta, măsurată</Text>
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
          {isLoading || isLoadingAdaptiveProfile ? (
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

      <View style={styles.adaptiveCard}>
        <View style={styles.adaptiveHeader}>
          <View>
            <Text style={styles.adaptiveEyebrow}>Profil adaptiv</Text>
            <Text style={styles.adaptiveTitle}>
              {adaptiveProfile?.overall_mastery ?? stats.accuracy}% stăpânire globală
            </Text>
          </View>
          <View style={styles.adaptivePill}>
            <Text style={styles.adaptivePillText}>{adaptiveProfile?.coverage ?? 0}% acoperire</Text>
          </View>
        </View>
        <Text style={styles.adaptiveText}>
          {adaptiveProfile?.recommended_next
            ? `Următorul pas: ${ATTACK_LABELS[adaptiveProfile.recommended_next.attack_type]} · ${
                adaptiveProfile.recommended_next.difficulty === 'easy'
                  ? 'UȘOR'
                  : adaptiveProfile.recommended_next.difficulty === 'medium'
                    ? 'MEDIU'
                    : 'GREU'
              }`
            : 'Profilul adaptiv se construiește după primele răspunsuri evaluate.'}
        </Text>
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
            <Text style={[styles.chartScore, isCompact && styles.chartScoreCompact]}>
              {trendEnd?.cumulative_score_after ?? effectiveStats.total_score}
            </Text>
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
        {showMovingAverage ? (
          <View style={styles.chartLegendRow}>
            <View style={styles.movingAverageLegendLine} />
            <Text style={styles.movingAverageLegendText}>Media {movingAverageWindow} zile</Text>
          </View>
        ) : null}
        {trendSlice.length > 0 ? (
          <View style={[styles.bars, isCompact && styles.barsCompact]}>
            {trendSlice.map((point, index) => (
              <View key={point.day} style={styles.barColumn}>
                <View style={[styles.barTrack, isCompact && styles.barTrackCompact]}>
                  <View
                    style={[
                      styles.barFill,
                      point.accuracy >= 60 ? styles.barFillActive : styles.barFillMuted,
                      { height: `${Math.max(8, Math.min(100, point.accuracy))}%` },
                    ]}
                  />
                  {showMovingAverage && movingAverageValues[index] !== undefined ? (
                    <View
                      style={[
                        styles.movingAverageLine,
                        {
                          bottom: `${Math.max(0, Math.min(100, movingAverageValues[index]))}%`,
                        },
                      ]}
                    />
                  ) : null}
                </View>
                <Text style={styles.barLabel}>{point.day.slice(5)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.activityEmptyCard}>
            <Text style={styles.activityEmptyText}>Trendul zilnic va apărea după primele răspunsuri evaluate.</Text>
          </View>
        )}
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartEyebrow}>Acuratețe de detecție pe tip de atac</Text>
            <Text style={[styles.chartScore, isCompact && styles.chartScoreCompact]}>
              {effectiveStats.accuracy}%
            </Text>
          </View>
          <View style={styles.trendPill}>
            <Ionicons name="shield-checkmark-outline" size={12} color={TrainingColors.accentTeal} />
            <Text style={styles.trendText}>{trendAttemptsCount} încercări</Text>
          </View>
        </View>
        <View style={[styles.bars, isCompact && styles.barsCompact]}>
          {accuracyBars.map((bar, index) => {
            const isBest = bar.value === Math.max(...accuracyBars.map((item) => item.value));
            return (
              <View key={`${bar.id}-${index}`} style={styles.barColumn}>
                <View style={[styles.barTrack, isCompact && styles.barTrackCompact]}>
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

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <Text style={styles.chartEyebrow}>Trend acuratețe pe tip de atac</Text>
            <Text style={[styles.chartScore, isCompact && styles.chartScoreCompact]}>{trendAttemptsCount}</Text>
            <Text style={styles.chartMeta}>încercări urmărite</Text>
          </View>
          <View style={styles.trendPill}>
            <Ionicons name="calendar-outline" size={12} color={TrainingColors.accentTeal} />
            <Text style={styles.trendText}>{trendRangeLabel}</Text>
          </View>
        </View>
        <View style={styles.attackTrendList}>
          {perAttackTrendSeries.map((series) => (
            <View key={series.attackType} style={styles.attackTrendItem}>
              <View style={styles.attackTrendHeader}>
                <View
                  style={[
                    styles.attackTrendIcon,
                    { backgroundColor: `${series.color}26`, borderColor: `${series.color}55` },
                  ]}>
                  <Ionicons name={ATTACK_ICONS[series.attackType]} size={14} color={series.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.attackTrendLabel}>{series.label}</Text>
                  <Text style={styles.attackTrendMeta}>{series.attempts} încercări</Text>
                </View>
                <Text style={styles.attackTrendValue}>{Math.round(series.latestAccuracy)}%</Text>
              </View>
              {series.points.length > 0 ? (
                <View style={[styles.miniBars, isCompact && styles.miniBarsCompact]}>
                  {series.points.map((value, index) => (
                    <View
                      key={`${series.attackType}-${index}`}
                      style={[styles.miniBarTrack, isCompact && styles.miniBarTrackCompact]}>
                      <View
                        style={[
                          styles.miniBarFill,
                          { height: `${Math.max(6, value)}%`, backgroundColor: series.color },
                        ]}
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.attackTrendEmpty}>Nu există încă trenduri persistate.</Text>
              )}
            </View>
          ))}
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
                <Text style={styles.weakSpotMeta}>{spot.detail}</Text>
              </View>
              <Text style={styles.weakSpotValue}>{spot.mastery}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${spot.mastery}%` },
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
          <View
            key={badge.name}
            style={[
              styles.badgeCard,
              isCompact && styles.badgeCardCompact,
              !badge.earned && styles.badgeCardLocked,
            ]}>
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
  titleCompact: { fontSize: 21 },
  subtitleCompact: { fontSize: 11 },
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
  adaptiveCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 14,
    gap: 8,
  },
  adaptiveHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  adaptiveEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '700',
  },
  adaptiveTitle: { color: TrainingColors.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 2 },
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
  chartScoreCompact: { fontSize: 28 },
  chartMeta: {
    color: TrainingColors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  chartLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  movingAverageLegendLine: {
    width: 18,
    height: 2,
    borderRadius: 999,
    backgroundColor: TrainingColors.accentAmber,
  },
  movingAverageLegendText: { color: TrainingColors.textMuted, fontSize: 10, fontWeight: '700' },
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
  barsCompact: { height: 112 },
  barColumn: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: {
    height: 112,
    width: '100%',
    borderRadius: 8,
    justifyContent: 'flex-end',
    backgroundColor: TrainingColors.panelAlt,
    overflow: 'hidden',
    position: 'relative',
  },
  barTrackCompact: { height: 96 },
  barFill: { width: '100%', borderRadius: 8 },
  barFillMuted: { backgroundColor: '#2D3F5E' },
  barFillActive: { backgroundColor: TrainingColors.accentBlue },
  movingAverageLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: TrainingColors.accentAmber,
    opacity: 0.9,
  },
  barLabel: { color: TrainingColors.textMuted, fontSize: 10 },
  attackTrendList: { gap: 10 },
  attackTrendItem: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    padding: 12,
    gap: 8,
  },
  attackTrendHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attackTrendIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attackTrendLabel: { color: TrainingColors.textPrimary, fontSize: 13, fontWeight: '700' },
  attackTrendMeta: { color: TrainingColors.textMuted, fontSize: 10 },
  attackTrendValue: { color: TrainingColors.textPrimary, fontSize: 12, fontWeight: '800' },
  miniBars: { height: 46, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  miniBarsCompact: { height: 38 },
  miniBarTrack: {
    flex: 1,
    height: 40,
    borderRadius: 6,
    backgroundColor: TrainingColors.panel,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  miniBarTrackCompact: { height: 32 },
  miniBarFill: { width: '100%', borderRadius: 6 },
  attackTrendEmpty: { color: TrainingColors.textMuted, fontSize: 11 },
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
  badgeCardCompact: { width: '48%' },
  badgeCardLocked: { opacity: 0.45 },
  badgeIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badgeIconEarned: { backgroundColor: TrainingColors.accentBlue },
  badgeIconLocked: { backgroundColor: '#334A70' },
  badgeText: { color: TrainingColors.textPrimary, fontSize: 10, fontWeight: '700', textAlign: 'center' },
});
