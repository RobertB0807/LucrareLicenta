import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppBackdrop } from '@/components/app-backdrop';
import { StateCard } from '@/components/state-card';
import { useAuth } from '@/features/auth/auth-context';
import { getRecentLiveDrills, reportLiveDrill } from '@/features/training/api';
import { buildUserStorageKey, FEEDBACK_CONTEXT_STORAGE_KEY } from '@/features/training/local-cache';
import type {
  AttackType,
  DifficultyLevel,
  LiveDrillSummaryApiResponse,
} from '@/features/training/types';
import { TrainingColors, TrainingShadows } from '@/features/training/ui-theme';

const LIVE_DRILL_LIMIT = 30;

const ATTACK_LABELS: Record<AttackType, string> = {
  phishing: 'Phishing email',
  smishing: 'Smishing SMS',
  impersonation: 'Impersonare',
};

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: 'Ușor',
  medium: 'Mediu',
  hard: 'Greu',
};

const STATUS_COPY: Record<
  LiveDrillSummaryApiResponse['delivery_status'],
  { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  sent: {
    label: 'Trimis',
    icon: 'paper-plane-outline',
    color: TrainingColors.accentTeal,
  },
  dry_run: {
    label: 'Demo',
    icon: 'flask-outline',
    color: TrainingColors.accentAmber,
  },
  failed: {
    label: 'Eșuat',
    icon: 'alert-circle-outline',
    color: TrainingColors.accentDanger,
  },
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Dată indisponibilă';
  }
  return date.toLocaleString('ro-RO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getOutcome(drill: LiveDrillSummaryApiResponse): {
  label: string;
  detail: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
} {
  if (drill.opened_at) {
    return {
      label: 'Link deschis',
      detail: 'Feedback de risc disponibil',
      color: TrainingColors.accentDanger,
      icon: 'warning-outline',
    };
  }
  if (drill.reported_at) {
    return {
      label: 'Raportat sigur',
      detail: 'Nu a fost deschis linkul',
      color: TrainingColors.accentTeal,
      icon: 'flag-outline',
    };
  }
  return {
    label: 'În desfășurare',
    detail: 'Așteaptă acțiunea utilizatorului',
    color: TrainingColors.accentAmber,
    icon: 'hourglass-outline',
  };
}

export default function LiveDrillsScreen() {
  const { user } = useAuth();
  const [drills, setDrills] = useState<LiveDrillSummaryApiResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeUserIdRef = useRef<string | null>(user?.id ?? null);
  activeUserIdRef.current = user?.id ?? null;
  const feedbackStorageKey = useMemo(
    () => buildUserStorageKey(FEEDBACK_CONTEXT_STORAGE_KEY, user?.id),
    [user?.id]
  );

  const summary = useMemo(() => {
    const opened = drills.filter((item) => item.opened_at).length;
    const reported = drills.filter((item) => item.reported_at && !item.opened_at).length;
    const pending = drills.filter((item) => !item.opened_at && !item.reported_at).length;
    return { opened, reported, pending };
  }, [drills]);

  const loadDrills = useCallback(async () => {
    const requestUserId = user?.id ?? null;
    if (!requestUserId) {
      setDrills([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await getRecentLiveDrills({ limit: LIVE_DRILL_LIMIT });
      if (activeUserIdRef.current === requestUserId) {
        setDrills(response.items);
      }
    } catch {
      if (activeUserIdRef.current === requestUserId) {
        setError('Nu am putut încărca exercițiile live.');
      }
    } finally {
      if (activeUserIdRef.current === requestUserId) {
        setIsLoading(false);
      }
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadDrills();
    }, [loadDrills])
  );

  const openFeedback = async (
    drill: LiveDrillSummaryApiResponse,
    override?: {
      isCorrect: boolean;
      scoreDelta: number;
      explanation: string;
      openedAt: string | null;
      reportedAt: string | null;
    }
  ) => {
    if (!user) {
      return;
    }

    const clicked = Boolean(override?.openedAt ?? drill.opened_at);
    await AsyncStorage.setItem(
      feedbackStorageKey,
      JSON.stringify({
        ownerUserId: user.id,
        scenarioId: drill.scenario_id,
        sessionId: drill.session_id,
        attackType: drill.attack_type,
        difficulty: drill.difficulty,
        isCorrect: override?.isCorrect ?? !clicked,
        scoreDelta: override?.scoreDelta ?? (clicked ? -5 : 0),
        explanation:
          override?.explanation ??
          (clicked
            ? 'Ai deschis link-ul din exercițiul live. Într-un atac real, acesta ar fi putut expune credențiale sau dispozitivul.'
            : 'Emailul live a fost trimis, dar link-ul nu a fost deschis. Verifică mesajul prin canal oficial și raportează-l fără să accesezi linkul.'),
        redFlags: drill.red_flags,
        savedAt: Date.now(),
      })
    );

    router.push({
      pathname: '/feedback/[scenarioId]',
      params: {
        scenarioId: drill.scenario_id,
        sessionId: drill.session_id,
      },
    });
  };

  const reportDrill = async (drill: LiveDrillSummaryApiResponse) => {
    if (!user || actionId) {
      return;
    }

    setActionId(drill.id);
    setError(null);
    try {
      const report = await reportLiveDrill(drill.id);
      setDrills((current) =>
        current.map((item) =>
          item.id === drill.id
            ? {
                ...item,
                opened_at: report.opened_at,
                reported_at: report.reported_at,
              }
            : item
        )
      );
      await openFeedback(drill, {
        isCorrect: report.is_correct,
        scoreDelta: report.score_delta,
        explanation: report.explanation,
        openedAt: report.opened_at,
        reportedAt: report.reported_at,
      });
    } catch {
      setError('Nu am putut marca exercițiul ca raportat.');
    } finally {
      setActionId(null);
    }
  };

  const openDemoLink = async (drill: LiveDrillSummaryApiResponse) => {
    setActionId(drill.id);
    setError(null);
    try {
      await Linking.openURL(drill.tracking_url);
      setTimeout(() => {
        void loadDrills();
      }, 900);
    } catch {
      setError('Nu am putut deschide linkul demo.');
    } finally {
      setActionId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <AppBackdrop grid />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Înapoi"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="arrow-back" size={20} color={TrainingColors.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Exerciții live</Text>
          <Text style={styles.subtitle}>Inbox, raportare și rezultate</Text>
        </View>
        <Pressable
          accessibilityLabel="Reîncarcă exercițiile live"
          onPress={() => void loadDrills()}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="refresh" size={19} color={TrainingColors.accentTeal} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.summaryEyebrow}>SUMAR LIVE</Text>
              <Text style={styles.summaryTitle}>{drills.length} exerciții recente</Text>
            </View>
            <View style={styles.summaryIcon}>
              <Ionicons name="radio-outline" size={18} color={TrainingColors.accentTeal} />
            </View>
          </View>
          <View style={styles.summaryGrid}>
            <SummaryMetric label="Raportate" value={String(summary.reported)} tone="success" />
            <SummaryMetric label="Deschise" value={String(summary.opened)} tone="danger" />
            <SummaryMetric label="Active" value={String(summary.pending)} tone="warning" />
          </View>
        </View>

        {isLoading ? (
          <StateCard
            loading
            title="Se încarcă exercițiile live"
            message="Sincronizăm inbox-ul de antrenament și ultimele rezultate."
            tone="info"
          />
        ) : null}

        {!isLoading && error ? (
          <StateCard
            icon="cloud-offline-outline"
            title="Exercițiile live nu s-au încărcat"
            message={error}
            tone="danger"
            actionLabel="Reîncearcă"
            onAction={() => void loadDrills()}
          />
        ) : null}

        {!isLoading && !error && drills.length === 0 ? (
          <StateCard
            icon="mail-unread-outline"
            title="Nu ai exerciții live încă"
            message="Trimite un scenariu live din laborator ca să urmărești raportarea și click-urile."
            tone="neutral"
            actionLabel="Laborator"
            onAction={() => router.replace('/(tabs)/scenarios')}
          />
        ) : null}

        {drills.map((drill) => {
          const status = STATUS_COPY[drill.delivery_status];
          const outcome = getOutcome(drill);
          const isBusy = actionId === drill.id;
          return (
            <View key={drill.id} style={styles.drillCard}>
              <View style={styles.drillHeader}>
                <View style={[styles.outcomeIcon, { borderColor: `${outcome.color}55` }]}>
                  <Ionicons name={outcome.icon} size={17} color={outcome.color} />
                </View>
                <View style={styles.drillTitleGroup}>
                  <Text style={styles.drillTitle}>{outcome.label}</Text>
                  <Text style={styles.drillMeta}>{outcome.detail}</Text>
                </View>
                <View style={[styles.statusPill, { borderColor: `${status.color}55` }]}>
                  <Ionicons name={status.icon} size={11} color={status.color} />
                  <Text style={[styles.statusPillText, { color: status.color }]}>
                    {status.label}
                  </Text>
                </View>
              </View>

              <View style={styles.detailPanel}>
                <Text style={styles.subjectText}>{drill.subject}</Text>
                <Text style={styles.detailText}>{drill.recipient}</Text>
                <Text style={styles.detailText}>
                  {ATTACK_LABELS[drill.attack_type]} · {DIFFICULTY_LABELS[drill.difficulty]} ·{' '}
                  {formatDate(drill.created_at)}
                </Text>
                {drill.delivery_error ? (
                  <Text style={styles.errorText}>{drill.delivery_error}</Text>
                ) : null}
              </View>

              <View style={styles.timeline}>
                <TimelineItem label="Creat" active />
                <TimelineItem label="Deschis" active={Boolean(drill.opened_at)} danger={Boolean(drill.opened_at)} />
                <TimelineItem label="Raportat" active={Boolean(drill.reported_at)} />
              </View>

              <View style={styles.actions}>
                {drill.delivery_status === 'dry_run' && !drill.opened_at ? (
                  <Pressable
                    disabled={isBusy}
                    onPress={() => void openDemoLink(drill)}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.pressed,
                      isBusy && styles.disabled,
                    ]}>
                    <Ionicons name="open-outline" size={14} color={TrainingColors.accentTeal} />
                    <Text style={styles.secondaryButtonText}>Demo link</Text>
                  </Pressable>
                ) : null}
                {!drill.opened_at && !drill.reported_at ? (
                  <Pressable
                    disabled={isBusy}
                    onPress={() => void reportDrill(drill)}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      styles.flexButton,
                      pressed && styles.pressed,
                      isBusy && styles.disabled,
                    ]}>
                    {isBusy ? (
                      <ActivityIndicator size="small" color="#EFF6FF" />
                    ) : (
                      <Ionicons name="flag-outline" size={14} color="#EFF6FF" />
                    )}
                    <Text style={styles.primaryButtonText}>Am raportat</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    disabled={isBusy}
                    onPress={() => void openFeedback(drill)}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      styles.flexButton,
                      pressed && styles.pressed,
                      isBusy && styles.disabled,
                    ]}>
                    <Ionicons name="document-text-outline" size={14} color="#EFF6FF" />
                    <Text style={styles.primaryButtonText}>Vezi feedback</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'success'
      ? TrainingColors.accentTeal
      : tone === 'warning'
        ? TrainingColors.accentAmber
        : TrainingColors.accentDanger;
  return (
    <View style={styles.summaryMetric}>
      <Text style={[styles.summaryMetricValue, { color }]}>{value}</Text>
      <Text style={styles.summaryMetricLabel}>{label}</Text>
    </View>
  );
}

function TimelineItem({
  label,
  active,
  danger,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
}) {
  return (
    <View style={styles.timelineItem}>
      <View
        style={[
          styles.timelineDot,
          active && styles.timelineDotActive,
          danger && styles.timelineDotDanger,
        ]}
      />
      <Text style={[styles.timelineText, active && styles.timelineTextActive]}>{label}</Text>
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
    backgroundColor: 'rgba(13, 24, 40, 0.96)',
  },
  headerText: { flex: 1, minWidth: 0 },
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
  content: { padding: 18, paddingBottom: 42, gap: 12 },
  summaryCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    backgroundColor: 'rgba(13, 24, 40, 0.96)',
    padding: 15,
    gap: 13,
    ...TrainingShadows.card,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  summaryTitle: { color: TrainingColors.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 2 },
  summaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.34)',
    backgroundColor: 'rgba(69, 224, 177, 0.1)',
  },
  summaryGrid: { flexDirection: 'row', gap: 8 },
  summaryMetric: {
    flex: 1,
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(5, 10, 19, 0.44)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryMetricValue: { fontSize: 20, fontWeight: '800' },
  summaryMetricLabel: { color: TrainingColors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2 },
  stateCard: {
    minHeight: 188,
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
  retryText: { color: TrainingColors.accentTeal, fontSize: 12, fontWeight: '800' },
  drillCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.96)',
    padding: 14,
    gap: 12,
    ...TrainingShadows.card,
  },
  drillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  outcomeIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  drillTitleGroup: { flex: 1, minWidth: 0 },
  drillTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '800' },
  drillMeta: { color: TrainingColors.textMuted, fontSize: 10, marginTop: 2 },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  statusPillText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  detailPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(5, 10, 19, 0.44)',
    padding: 11,
    gap: 4,
  },
  subjectText: { color: TrainingColors.textPrimary, fontSize: 13, fontWeight: '800' },
  detailText: { color: TrainingColors.textSecondary, fontSize: 11, lineHeight: 16 },
  errorText: { color: TrainingColors.accentDanger, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  timeline: {
    flexDirection: 'row',
    gap: 8,
  },
  timelineItem: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  timelineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: TrainingColors.textMuted,
  },
  timelineDotActive: { backgroundColor: TrainingColors.accentTeal },
  timelineDotDanger: { backgroundColor: TrainingColors.accentDanger },
  timelineText: { color: TrainingColors.textMuted, fontSize: 9, fontWeight: '800' },
  timelineTextActive: { color: TrainingColors.textSecondary },
  actions: { flexDirection: 'row', gap: 8 },
  primaryButton: {
    minHeight: 42,
    paddingHorizontal: 14,
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
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.55 },
});
