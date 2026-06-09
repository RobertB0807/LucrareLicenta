import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import { getUserSessions } from '@/features/training/api';
import type {
  AttackType,
  DifficultyLevel,
  UserSessionSummaryApiResponse,
} from '@/features/training/types';
import { TrainingColors } from '@/features/training/ui-theme';
import { useTrainingSession } from '@/features/training/useTrainingSession';

const PAGE_SIZE = 12;

const ATTACK_LABELS: Record<AttackType, string> = {
  phishing: 'Phishing',
  smishing: 'Smishing',
  impersonation: 'Impersonare',
};

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: 'Ușor',
  medium: 'Mediu',
  hard: 'Greu',
};

function formatDate(value: string | null): string {
  if (!value) {
    return 'Dată indisponibilă';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Dată indisponibilă';
  }
  return date.toLocaleString('ro-RO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SessionsScreen() {
  const { user } = useAuth();
  const { sessionId, activateSession } = useTrainingSession();
  const [sessions, setSessions] = useState<UserSessionSummaryApiResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentUserId = user?.id ?? null;
  const activeUserIdRef = useRef<string | null>(currentUserId);
  activeUserIdRef.current = currentUserId;

  const loadSessions = useCallback(async (offset: number, replace: boolean) => {
    const requestUserId = user?.id ?? null;
    if (!requestUserId) {
      setSessions([]);
      setTotal(0);
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }
    if (replace) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);
    try {
      const response = await getUserSessions({ limit: PAGE_SIZE, offset });
      if (activeUserIdRef.current !== requestUserId) {
        return;
      }
      setTotal(response.total);
      setSessions((current) => (replace ? response.items : [...current, ...response.items]));
    } catch {
      if (activeUserIdRef.current === requestUserId) {
        setError('Nu am putut încărca istoricul sesiunilor.');
      }
    } finally {
      if (activeUserIdRef.current === requestUserId) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadSessions(0, true);
    }, [loadSessions])
  );

  const selectSession = async (
    item: UserSessionSummaryApiResponse,
    destination: 'training' | 'analytics' | 'pending'
  ) => {
    const key = `${item.session_id}:${destination}`;
    setActionKey(key);
    const activated = await activateSession(
      item.session_id,
      item.latest_attack_type,
      item.latest_difficulty
    );
    setActionKey(null);
    if (!activated) {
      Alert.alert('Sesiune indisponibilă', 'Nu am putut activa sesiunea selectată.');
      return;
    }

    if (destination === 'analytics') {
      router.replace('/(tabs)/analytics');
      return;
    }
    if (destination === 'pending' && item.pending_scenario_id) {
      router.push({
        pathname: '/chat/[scenarioId]',
        params: {
          scenarioId: item.pending_scenario_id,
          attackType: item.latest_attack_type ?? 'phishing',
          difficulty: item.latest_difficulty ?? 'easy',
          sessionId: item.session_id,
        },
      });
      return;
    }
    router.replace('/(tabs)/scenarios');
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
          <Text style={styles.title}>Istoric sesiuni</Text>
          <Text style={styles.subtitle}>{total} sesiuni salvate în cont</Text>
        </View>
        <Pressable
          accessibilityLabel="Reîncarcă istoricul"
          onPress={() => void loadSessions(0, true)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="refresh" size={19} color={TrainingColors.accentTeal} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={TrainingColors.accentTeal} />
            <Text style={styles.stateText}>Se încarcă sesiunile...</Text>
          </View>
        ) : null}

        {!isLoading && error ? (
          <View style={styles.stateCard}>
            <Ionicons name="cloud-offline-outline" size={24} color={TrainingColors.accentDanger} />
            <Text style={styles.stateText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={() => void loadSessions(0, true)}>
              <Text style={styles.retryText}>Încearcă din nou</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLoading && !error && sessions.length === 0 ? (
          <View style={styles.stateCard}>
            <Ionicons name="time-outline" size={28} color={TrainingColors.textMuted} />
            <Text style={styles.emptyTitle}>Nu există sesiuni încă</Text>
            <Text style={styles.stateText}>Prima sesiune va apărea după generarea unui scenariu.</Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.replace('/(tabs)/scenarios')}>
              <Text style={styles.primaryButtonText}>Începe antrenamentul</Text>
            </Pressable>
          </View>
        ) : null}

        {sessions.map((item) => {
          const isActive = item.session_id === sessionId;
          const attackLabel = item.latest_attack_type
            ? ATTACK_LABELS[item.latest_attack_type]
            : 'Fără scenarii';
          const difficultyLabel = item.latest_difficulty
            ? DIFFICULTY_LABELS[item.latest_difficulty]
            : null;
          return (
            <View key={item.session_id} style={[styles.sessionCard, isActive && styles.activeCard]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.statusDot, isActive && styles.statusDotActive]} />
                  <View style={styles.cardTitleText}>
                    <Text style={styles.cardTitle}>
                      {attackLabel}{difficultyLabel ? ` · ${difficultyLabel}` : ''}
                    </Text>
                    <Text style={styles.cardDate}>Actualizată {formatDate(item.updated_at)}</Text>
                  </View>
                </View>
                {isActive ? (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>ACTIVĂ</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.metrics}>
                <Metric label="Scor" value={String(item.total_score)} />
                <Metric label="Acuratețe" value={`${item.accuracy}%`} />
                <Metric label="Răspunsuri" value={String(item.total_attempts)} />
              </View>

              <Text style={styles.scenarioMeta}>
                {item.evaluated_scenarios} evaluate din {item.generated_scenarios} generate
              </Text>

              {item.pending_scenario_id ? (
                <Pressable
                  disabled={actionKey !== null}
                  style={({ pressed }) => [
                    styles.pendingButton,
                    pressed && styles.pressed,
                    actionKey !== null && styles.disabled,
                  ]}
                  onPress={() => void selectSession(item, 'pending')}>
                  {actionKey === `${item.session_id}:pending` ? (
                    <ActivityIndicator size="small" color="#EFF6FF" />
                  ) : (
                    <Ionicons name="play" size={15} color="#EFF6FF" />
                  )}
                  <Text style={styles.pendingButtonText}>Reia scenariul nefinalizat</Text>
                </Pressable>
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  disabled={actionKey !== null}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.pressed,
                    actionKey !== null && styles.disabled,
                  ]}
                  onPress={() => void selectSession(item, 'analytics')}>
                  <Ionicons name="stats-chart" size={15} color={TrainingColors.accentTeal} />
                  <Text style={styles.secondaryButtonText}>Statistici</Text>
                </Pressable>
                <Pressable
                  disabled={actionKey !== null}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.flexButton,
                    pressed && styles.pressed,
                    actionKey !== null && styles.disabled,
                  ]}
                  onPress={() => void selectSession(item, 'training')}>
                  {actionKey === `${item.session_id}:training` ? (
                    <ActivityIndicator size="small" color="#EFF6FF" />
                  ) : (
                    <Ionicons name="arrow-forward" size={15} color="#EFF6FF" />
                  )}
                  <Text style={styles.primaryButtonText}>Continuă</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        {!isLoading && sessions.length < total ? (
          <Pressable
            disabled={isLoadingMore}
            style={({ pressed }) => [styles.loadMoreButton, pressed && styles.pressed]}
            onPress={() => void loadSessions(sessions.length, false)}>
            {isLoadingMore ? (
              <ActivityIndicator size="small" color={TrainingColors.accentTeal} />
            ) : (
              <Text style={styles.loadMoreText}>Încarcă mai multe</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
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
  title: { color: TrainingColors.textPrimary, fontSize: 21, fontWeight: '800' },
  subtitle: { color: TrainingColors.textSecondary, fontSize: 11, marginTop: 2 },
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
  content: { padding: 18, paddingBottom: 40, gap: 12 },
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
  stateText: {
    color: TrainingColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  emptyTitle: { color: TrainingColors.textPrimary, fontSize: 18, fontWeight: '800' },
  retryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  retryText: { color: TrainingColors.accentTeal, fontSize: 12, fontWeight: '700' },
  sessionCard: {
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    gap: 12,
  },
  activeCard: { borderColor: 'rgba(69,224,177,0.55)' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitleGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitleText: { flex: 1 },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: TrainingColors.textMuted },
  statusDotActive: { backgroundColor: TrainingColors.accentTeal },
  cardTitle: { color: TrainingColors.textPrimary, fontSize: 15, fontWeight: '800' },
  cardDate: { color: TrainingColors.textMuted, fontSize: 10, marginTop: 3 },
  activeBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(69,224,177,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(69,224,177,0.3)',
  },
  activeBadgeText: { color: TrainingColors.accentTeal, fontSize: 9, fontWeight: '800' },
  metrics: { flexDirection: 'row', gap: 8 },
  metric: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: TrainingColors.panelAlt,
    borderWidth: 1,
    borderColor: TrainingColors.border,
  },
  metricValue: { color: TrainingColors.textPrimary, fontSize: 18, fontWeight: '800' },
  metricLabel: { color: TrainingColors.textMuted, fontSize: 9, marginTop: 2 },
  scenarioMeta: { color: TrainingColors.textSecondary, fontSize: 11 },
  pendingButton: {
    minHeight: 42,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
  },
  pendingButtonText: { color: '#EFF6FF', fontSize: 12, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8 },
  secondaryButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    backgroundColor: TrainingColors.buttonSecondary,
  },
  secondaryButtonText: { color: TrainingColors.accentTeal, fontSize: 12, fontWeight: '800' },
  primaryButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
  },
  flexButton: { flex: 1 },
  primaryButtonText: { color: '#EFF6FF', fontSize: 12, fontWeight: '800' },
  loadMoreButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
  },
  loadMoreText: { color: TrainingColors.accentTeal, fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
});
