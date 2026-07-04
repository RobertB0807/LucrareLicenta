import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { AppBackdrop } from '@/components/app-backdrop';
import { StateCard } from '@/components/state-card';
import { createLiveDrill, getRecentLiveDrills, reportLiveDrill } from '@/features/training/api';
import { getDifficultyLabel } from '@/features/training/options';
import { useAuth } from '@/features/auth/auth-context';
import { buildUserStorageKey, FEEDBACK_CONTEXT_STORAGE_KEY } from '@/features/training/local-cache';
import type { AttackType, DifficultyLevel, LiveDrillApiResponse, LiveDrillSummaryApiResponse } from '@/features/training/types';
import { TrainingColors, TrainingShadows } from '@/features/training/ui-theme';
import { useTrainingSession } from '@/features/training/useTrainingSession';

type Scenario = {
  id: string;
  type: string;
  title: string;
  description: string;
  difficulty: 'Ușor' | 'Mediu' | 'Greu';
  time: string;
  attackType: AttackType;
  backendDifficulty: DifficultyLevel;
  channel: 'Email' | 'SMS' | 'Vocal' | 'Web';
  locked: boolean;
  unlockReason: string | null;
};

type DifficultyFilter = DifficultyLevel | 'all';

const filters = ['Toate', 'Email', 'SMS', 'Vocal'] as const;
const difficultyOrder: DifficultyLevel[] = ['easy', 'medium', 'hard'];
const DIFFICULTY_PRESENTATION: Record<
  DifficultyLevel,
  {
    label: string;
    subtitle: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    backgroundColor: string;
    borderColor: string;
  }
> = {
  easy: {
    label: 'Ușor',
    subtitle: 'Indicii evidente și decizii ghidate',
    icon: 'leaf-outline',
    color: '#45E0B1',
    backgroundColor: 'rgba(69, 224, 177, 0.12)',
    borderColor: 'rgba(69, 224, 177, 0.42)',
  },
  medium: {
    label: 'Mediu',
    subtitle: 'Context credibil și semnale discrete',
    icon: 'analytics-outline',
    color: '#F5A94A',
    backgroundColor: 'rgba(245, 169, 74, 0.12)',
    borderColor: 'rgba(245, 169, 74, 0.44)',
  },
  hard: {
    label: 'Greu',
    subtitle: 'Atacuri sofisticate și detalii subtile',
    icon: 'flame-outline',
    color: '#FF7D7D',
    backgroundColor: 'rgba(255, 125, 125, 0.12)',
    borderColor: 'rgba(255, 125, 125, 0.44)',
  },
};
const ATTACK_LABELS: Record<AttackType, string> = {
  phishing: 'Phishing prin email',
  smishing: 'Escrocherie SMS',
  impersonation: 'Impersonare',
};

const LIVE_DRILL_STATUS_COPY: Record<
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
    label: 'Eroare',
    icon: 'alert-circle-outline',
    color: TrainingColors.accentDanger,
  },
};

function channelLabel(channel: string): Scenario['channel'] {
  if (channel === 'email') return 'Email';
  if (channel === 'sms') return 'SMS';
  if (channel === 'phone' || channel === 'call') return 'Vocal';
  return 'Web';
}

function estimateTimeByDifficulty(difficulty: DifficultyLevel): string {
  if (difficulty === 'hard') return '6 min';
  if (difficulty === 'medium') return '4 min';
  return '3 min';
}

function buildScenarioTitle(description: string, attackType: AttackType, difficulty: DifficultyLevel): string {
  const firstSentence = description.split('.').map((item) => item.trim()).find(Boolean);
  if (firstSentence) {
    return firstSentence.length > 58 ? `${firstSentence.slice(0, 55)}...` : firstSentence;
  }
  return `${ATTACK_LABELS[attackType]} · ${getDifficultyLabel(difficulty)}`;
}

export default function ScenariosScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const contentInsets = useMemo(
    () => ({
      paddingHorizontal: isCompact ? 16 : 20,
      paddingTop: isCompact ? 40 : 50,
      paddingBottom: isCompact ? 110 : 130,
      gap: isCompact ? 10 : 12,
    }),
    [isCompact]
  );
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>('Toate');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all');
  const [sendingLiveId, setSendingLiveId] = useState<string | null>(null);
  const [liveDrillResult, setLiveDrillResult] = useState<LiveDrillApiResponse | null>(null);
  const [recentLiveDrill, setRecentLiveDrill] = useState<LiveDrillSummaryApiResponse | null>(null);
  const [liveDrillError, setLiveDrillError] = useState<string | null>(null);
  const [liveRecipient, setLiveRecipient] = useState('');
  const [reportingLiveId, setReportingLiveId] = useState<string | null>(null);
  const { user } = useAuth();
  const { sessionId, evaluation, scenarioCatalog, isLoadingCatalog, catalogError, refreshScenarioCatalog } =
    useTrainingSession();
  const feedbackStorageKey = useMemo(
    () => buildUserStorageKey(FEEDBACK_CONTEXT_STORAGE_KEY, user?.id),
    [user?.id]
  );

  const scenarios = useMemo<Scenario[]>(
    () =>
      scenarioCatalog.map((item) => {
        const description = item.attacker_message_preview;
        return {
          id: item.id,
          type: ATTACK_LABELS[item.attack_type],
          title: buildScenarioTitle(description, item.attack_type, item.difficulty),
          description,
          difficulty: getDifficultyLabel(item.difficulty) as Scenario['difficulty'],
          time: estimateTimeByDifficulty(item.difficulty),
          attackType: item.attack_type,
          backendDifficulty: item.difficulty,
          channel: channelLabel(item.channel),
          locked: item.locked,
          unlockReason: item.unlock_reason,
        };
      }),
    [scenarioCatalog]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const enriched = scenarios
      .filter((scenario) => {
        const matchesFilter = activeFilter === 'Toate' || scenario.channel === activeFilter;
        const matchesDifficulty =
          difficultyFilter === 'all' || scenario.backendDifficulty === difficultyFilter;
        const text = `${scenario.title} ${scenario.description} ${scenario.type}`.toLowerCase();
        return matchesFilter && matchesDifficulty && text.includes(q);
      });

    if (!evaluation?.recommendation) {
      return enriched;
    }

    const rec = evaluation.recommendation;
    return enriched.sort((a, b) => {
      const aRecommended = a.attackType === rec.attack_type && a.backendDifficulty === rec.difficulty;
      const bRecommended = b.attackType === rec.attack_type && b.backendDifficulty === rec.difficulty;
      return Number(bRecommended) - Number(aRecommended);
    });
  }, [activeFilter, difficultyFilter, evaluation?.recommendation, query, scenarios]);

  const groupedScenarios = useMemo(
    () =>
      difficultyOrder
        .map((level) => ({
          level,
          items: filtered.filter((scenario) => scenario.backendDifficulty === level),
        }))
        .filter((group) => group.items.length > 0),
    [filtered]
  );

  const liveRecipientValue = liveRecipient.trim();
  const defaultLiveRecipient = user?.email ?? 'emailul contului';
  const liveDrillStatus = recentLiveDrill
    ? LIVE_DRILL_STATUS_COPY[recentLiveDrill.delivery_status]
    : null;

  const canStartLiveDrill = useCallback(() => {
    if (!liveRecipientValue) {
      return true;
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(liveRecipientValue);
  }, [liveRecipientValue]);

  const refreshRecentLiveDrills = useCallback(async () => {
    try {
      const response = await getRecentLiveDrills();
      setRecentLiveDrill(response.items[0] ?? null);
    } catch {
      // The live feedback card is opportunistic; scenario browsing should remain usable.
    }
  }, []);

  useEffect(() => {
    void refreshRecentLiveDrills();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshRecentLiveDrills();
      }
    });

    return () => subscription.remove();
  }, [refreshRecentLiveDrills]);

  const startLiveEmailDrill = async (scenario: Scenario) => {
    if (sendingLiveId) {
      return;
    }
    if (!canStartLiveDrill()) {
      setLiveDrillError('Introdu o adresă de email validă sau lasă câmpul gol pentru contul tău.');
      return;
    }
    setSendingLiveId(scenario.id);
    setLiveDrillError(null);
    try {
      const result = await createLiveDrill({
        delivery_channel: 'email',
        recipient: liveRecipientValue || null,
        attack_type: scenario.attackType,
        difficulty: scenario.backendDifficulty,
        session_id: sessionId ?? null,
        template_id: scenario.id,
      });
      setLiveDrillResult(result);
      setRecentLiveDrill({
        id: result.id,
        session_id: result.session_id,
        scenario_id: result.scenario_id,
        delivery_channel: result.delivery_channel,
        recipient: result.recipient,
        subject: result.subject,
        tracking_url: result.tracking_url,
        delivery_status: result.delivery_status,
        delivery_error: result.delivery_error,
        opened_at: result.opened_at,
        reported_at: result.reported_at,
        created_at: result.created_at,
        attack_type: result.scenario.attack_type,
        difficulty: result.scenario.difficulty,
        red_flags: result.scenario.red_flags,
      });
    } catch (error) {
      setLiveDrillError(error instanceof Error ? error.message : 'Nu am putut porni exercițiul live.');
    } finally {
      setSendingLiveId(null);
    }
  };

  const openTrackingUrl = async (trackingUrl: string) => {
    try {
      await Linking.openURL(trackingUrl);
      setTimeout(() => {
        void refreshRecentLiveDrills();
      }, 800);
    } catch {
      setLiveDrillError('Nu am putut deschide linkul demo.');
    }
  };

  const openLiveDrillFeedback = async (drill: LiveDrillSummaryApiResponse) => {
    if (!user) {
      return;
    }

    const clicked = Boolean(drill.opened_at);
    await AsyncStorage.setItem(
      feedbackStorageKey,
      JSON.stringify({
        ownerUserId: user.id,
        scenarioId: drill.scenario_id,
        sessionId: drill.session_id,
        attackType: drill.attack_type,
        difficulty: drill.difficulty,
        isCorrect: !clicked,
        scoreDelta: clicked ? -5 : 0,
        explanation: clicked
          ? 'Ai deschis link-ul din exercițiul live. Într-un atac real, acesta ar fi putut duce la colectarea credențialelor sau instalarea unei pagini false. Oprește interacțiunea, verifică expeditorul prin canal oficial și raportează mesajul.'
          : 'Emailul live a fost trimis, dar link-ul nu a fost deschis încă. O decizie sigură este să verifici mesajul prin canal oficial și să îl raportezi fără să accesezi linkul.',
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

  const reportCurrentLiveDrill = async (drill: LiveDrillSummaryApiResponse) => {
    if (!user || reportingLiveId) {
      return;
    }

    setReportingLiveId(drill.id);
    setLiveDrillError(null);
    try {
      const report = await reportLiveDrill(drill.id);
      const updatedDrill: LiveDrillSummaryApiResponse = {
        ...drill,
        reported_at: report.reported_at,
        opened_at: report.opened_at,
      };
      setRecentLiveDrill(updatedDrill);
      await AsyncStorage.setItem(
        feedbackStorageKey,
        JSON.stringify({
          ownerUserId: user.id,
          scenarioId: report.scenario_id,
          sessionId: report.session_id,
          attackType: report.attack_type,
          difficulty: report.difficulty,
          isCorrect: report.is_correct,
          scoreDelta: report.score_delta,
          explanation: report.explanation,
          redFlags: report.red_flags,
          savedAt: Date.now(),
        })
      );
      router.push({
        pathname: '/feedback/[scenarioId]',
        params: {
          scenarioId: report.scenario_id,
          sessionId: report.session_id,
        },
      });
    } catch (error) {
      setLiveDrillError(error instanceof Error ? error.message : 'Nu am putut marca emailul ca raportat.');
    } finally {
      setReportingLiveId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <AppBackdrop grid />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentInsets]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="shield-checkmark-outline" size={19} color="#EFF6FF" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>SIMULĂRI INTERACTIVE</Text>
          <Text style={[styles.title, isCompact && styles.titleCompact]}>Laborator de antrenament</Text>
          <Text style={[styles.subtitle, isCompact && styles.subtitleCompact]}>
            Exersează decizii sigure în situații realiste
          </Text>
        </View>
      </View>

      <View style={[styles.searchBox, isCompact && styles.searchBoxCompact]}>
        <Ionicons name="search" size={16} color={TrainingColors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Caută scenarii"
          placeholderTextColor={TrainingColors.textMuted}
          style={styles.searchInput}
        />
        {query ? (
          <Pressable
            accessibilityLabel="Șterge căutarea"
            onPress={() => setQuery('')}
            hitSlop={10}
            style={({ pressed }) => [styles.clearSearch, pressed && styles.cardPressed]}>
            <Ionicons name="close-circle" size={18} color={TrainingColors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.map((f) => {
          const active = f === activeFilter;
          return (
            <Pressable
              key={f}
              onPress={() => setActiveFilter(f)}
              style={[styles.filter, active ? styles.filterActive : null]}>
              <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>{f}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.selectorHeader}>
        <Text style={styles.selectorLabel}>Dificultate</Text>
        <Text style={styles.resultCount}>
          {filtered.length} {filtered.length === 1 ? 'scenariu' : 'scenarii'}
        </Text>
      </View>

      <View style={styles.levelSelector}>
        <Pressable
          onPress={() => setDifficultyFilter('all')}
          style={[styles.levelButton, difficultyFilter === 'all' && styles.levelButtonActive]}>
          <Text
            style={[
              styles.levelButtonText,
              difficultyFilter === 'all' && styles.levelButtonTextActive,
            ]}>
            Toate
          </Text>
        </Pressable>
        {difficultyOrder.map((level) => {
          const active = difficultyFilter === level;
          const presentation = DIFFICULTY_PRESENTATION[level];
          return (
            <Pressable
              key={level}
              onPress={() => setDifficultyFilter(level)}
              style={[
                styles.levelButton,
                active && {
                  backgroundColor: presentation.backgroundColor,
                  borderColor: presentation.borderColor,
                },
              ]}>
              <View style={[styles.levelDot, { backgroundColor: presentation.color }]} />
              <Text
                style={[
                  styles.levelButtonText,
                  active && { color: presentation.color },
                ]}>
                {presentation.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {sessionId ? (
        <View style={styles.sessionCard}>
          <View style={styles.sessionIcon}>
            <Ionicons name="sync-outline" size={14} color={TrainingColors.accentTeal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sessionTitle}>Sesiune activă conectată</Text>
            <Text style={styles.sessionMeta}>Scenariile următoare vor continua sesiunea curentă.</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.liveControlPanel}>
        <View style={styles.liveControlHeader}>
          <View style={styles.liveControlIcon}>
            <Ionicons name="radio-outline" size={17} color={TrainingColors.accentTeal} />
          </View>
          <View style={styles.liveStatusCopy}>
            <Text style={styles.liveControlEyebrow}>EXERCIȚIU LIVE</Text>
            <Text style={styles.liveControlTitle}>Trimite scenariul într-un inbox real</Text>
          </View>
          {liveDrillStatus ? (
            <View style={[styles.liveStatusPill, { borderColor: `${liveDrillStatus.color}66` }]}>
              <Ionicons name={liveDrillStatus.icon} size={12} color={liveDrillStatus.color} />
              <Text style={[styles.liveStatusPillText, { color: liveDrillStatus.color }]}>
                {liveDrillStatus.label}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.recipientInputShell}>
          <Ionicons name="mail-outline" size={15} color={TrainingColors.textMuted} />
          <TextInput
            value={liveRecipient}
            onChangeText={setLiveRecipient}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder={`Destinatar: ${defaultLiveRecipient}`}
            placeholderTextColor={TrainingColors.textMuted}
            style={styles.recipientInput}
          />
          {liveRecipient ? (
            <Pressable
              accessibilityLabel="Șterge destinatarul"
              hitSlop={10}
              onPress={() => setLiveRecipient('')}
              style={({ pressed }) => [styles.clearSearch, pressed && styles.cardPressed]}>
              <Ionicons name="close-circle" size={17} color={TrainingColors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.liveControlActions}>
          <Text style={styles.liveControlHint}>
            Fiecare email live poate fi urmărit, raportat și analizat în feedback.
          </Text>
          <Link href={'/live-drills' as Href} asChild>
            <Pressable
              style={({ pressed }) => [styles.liveHistoryButton, pressed && styles.cardPressed]}>
              <Ionicons name="time-outline" size={13} color={TrainingColors.accentTeal} />
              <Text style={styles.liveHistoryButtonText}>Istoric</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      {liveDrillResult ? (
        <View style={styles.liveStatusCard}>
          <Ionicons
            name={liveDrillResult.delivery_status === 'sent' ? 'mail-unread-outline' : 'flask-outline'}
            size={16}
            color={TrainingColors.accentTeal}
          />
          <View style={styles.liveStatusCopy}>
            <Text style={styles.sessionTitle}>
              {liveDrillResult.delivery_status === 'sent'
                ? 'Email live trimis'
                : 'Exercițiu live pregătit'}
            </Text>
            <Text style={styles.sessionMeta}>
              {liveDrillResult.delivery_status === 'sent'
                ? `Verifică inbox-ul ${liveDrillResult.recipient}.`
                : `SMTP nu este configurat. Rulează demo-ul pentru ${liveDrillResult.recipient}.`}
            </Text>
          </View>
          {liveDrillResult.delivery_status === 'dry_run' ? (
            <Pressable
              onPress={() => void openTrackingUrl(liveDrillResult.tracking_url)}
              style={({ pressed }) => [styles.demoLinkButton, pressed && styles.cardPressed]}>
              <Ionicons name="open-outline" size={13} color={TrainingColors.accentTeal} />
              <Text style={styles.demoLinkButtonText}>Demo</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {liveDrillError ? (
        <View style={styles.liveErrorCard}>
          <Ionicons name="alert-circle-outline" size={16} color={TrainingColors.accentDanger} />
          <Text style={styles.liveErrorText}>{liveDrillError}</Text>
        </View>
      ) : null}

      {recentLiveDrill ? (
        <View
          style={[
            styles.liveFeedbackCard,
            recentLiveDrill.opened_at ? styles.liveFeedbackRisk : styles.liveFeedbackPending,
          ]}>
          <Pressable
            onPress={() => void openLiveDrillFeedback(recentLiveDrill)}
            style={({ pressed }) => [styles.liveFeedbackMain, pressed && styles.cardPressed]}>
            <View style={styles.liveFeedbackIcon}>
              <Ionicons
                name={recentLiveDrill.opened_at ? 'warning-outline' : 'mail-open-outline'}
                size={16}
                color={recentLiveDrill.opened_at ? TrainingColors.accentDanger : TrainingColors.accentAmber}
              />
            </View>
            <View style={styles.liveStatusCopy}>
              <Text style={styles.sessionTitle}>
                {recentLiveDrill.opened_at
                  ? 'Atac live deschis'
                  : recentLiveDrill.reported_at
                    ? 'Email live raportat'
                    : 'Email live trimis'}
              </Text>
              <Text style={styles.sessionMeta}>
                {recentLiveDrill.opened_at
                  ? 'Ai apăsat link-ul din email. Deschide feedback-ul pentru explicație.'
                  : recentLiveDrill.reported_at
                    ? 'Ai raportat emailul fără să deschizi linkul. Feedback pozitiv disponibil.'
                    : 'Dacă ai raportat emailul în Gmail, marchează asta aici.'}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={15} color={TrainingColors.textSecondary} />
          </Pressable>
          {recentLiveDrill.delivery_error ? (
            <Text style={styles.liveDeliveryError}>{recentLiveDrill.delivery_error}</Text>
          ) : null}
          {recentLiveDrill.delivery_status === 'dry_run' && !recentLiveDrill.opened_at ? (
            <Pressable
              onPress={() => void openTrackingUrl(recentLiveDrill.tracking_url)}
              style={({ pressed }) => [styles.secondaryLiveButton, pressed && styles.cardPressed]}>
              <Ionicons name="open-outline" size={14} color={TrainingColors.accentTeal} />
              <Text style={styles.secondaryLiveButtonText}>Deschide linkul demo</Text>
            </Pressable>
          ) : null}
          {!recentLiveDrill.opened_at && !recentLiveDrill.reported_at ? (
            <Pressable
              disabled={reportingLiveId === recentLiveDrill.id}
              onPress={() => void reportCurrentLiveDrill(recentLiveDrill)}
              style={({ pressed }) => [
                styles.reportAction,
                pressed && styles.cardPressed,
                reportingLiveId === recentLiveDrill.id && styles.liveActionDisabled,
              ]}>
              <Ionicons name="flag-outline" size={14} color="#EFF6FF" />
              <Text style={styles.reportActionText}>
                {reportingLiveId === recentLiveDrill.id ? 'Se salvează...' : 'Am raportat emailul'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.list}>
        {catalogError ? (
          <StateCard
            icon="cloud-offline-outline"
            title="Scenariile nu s-au încărcat"
            message={catalogError}
            tone="danger"
            actionLabel="Reîncearcă"
            onAction={() => void refreshScenarioCatalog()}
          />
        ) : null}
        {isLoadingCatalog ? (
          <StateCard
            loading
            title="Se încarcă laboratorul"
            message="Pregătim scenariile disponibile pentru nivelul tău."
            tone="info"
          />
        ) : null}
        {!isLoadingCatalog && !catalogError && filtered.length === 0 ? (
          <StateCard
            icon={query.trim() || activeFilter !== 'Toate' || difficultyFilter !== 'all' ? 'search-outline' : 'file-tray-outline'}
            title={
              query.trim() || activeFilter !== 'Toate' || difficultyFilter !== 'all'
                ? 'Niciun rezultat pentru filtre'
                : 'Nu există scenarii încă'
            }
            message={
              query.trim() || activeFilter !== 'Toate' || difficultyFilter !== 'all'
                ? 'Schimbă filtrul, dificultatea sau textul căutat ca să vezi scenariile disponibile.'
                : 'Catalogul va apărea aici după ce backend-ul returnează primele scenarii.'
            }
            tone="neutral"
            actionLabel={query.trim() || activeFilter !== 'Toate' || difficultyFilter !== 'all' ? 'Resetează' : undefined}
            onAction={
              query.trim() || activeFilter !== 'Toate' || difficultyFilter !== 'all'
                ? () => {
                    setQuery('');
                    setActiveFilter('Toate');
                    setDifficultyFilter('all');
                  }
                : undefined
            }
          />
        ) : null}
        {groupedScenarios.map((group) => {
          const presentation = DIFFICULTY_PRESENTATION[group.level];
          return (
            <View key={group.level} style={styles.levelSection}>
              <View style={styles.levelHeader}>
                <View
                  style={[
                    styles.levelHeaderIcon,
                    {
                      backgroundColor: presentation.backgroundColor,
                      borderColor: presentation.borderColor,
                    },
                  ]}>
                  <Ionicons name={presentation.icon} size={16} color={presentation.color} />
                </View>
                <View style={styles.levelHeaderText}>
                  <Text style={[styles.levelTitle, { color: presentation.color }]}>
                    {presentation.label}
                  </Text>
                  <Text style={styles.levelSubtitle}>{presentation.subtitle}</Text>
                </View>
                <Text style={styles.levelCount}>{group.items.length}</Text>
              </View>

              {group.items.map((scenario) => {
                const recommended =
                  evaluation?.recommendation?.attack_type === scenario.attackType &&
                  evaluation.recommendation.difficulty === scenario.backendDifficulty;
                const card = (
                  <Pressable
                    disabled={scenario.locked}
                    style={({ pressed }) => [
                      styles.card,
                      isCompact && styles.cardCompact,
                      recommended && styles.cardRecommended,
                      scenario.locked && styles.cardLocked,
                      pressed && !scenario.locked && styles.cardPressed,
                    ]}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardType}>{scenario.type}</Text>
                      <View style={styles.cardTags}>
                        {scenario.locked ? (
                          <View style={styles.lockedPill}>
                            <Ionicons name="lock-closed" size={10} color={TrainingColors.textMuted} />
                            <Text style={styles.lockedPillText}>Blocat</Text>
                          </View>
                        ) : null}
                        {recommended ? (
                          <View style={styles.recommendedPill}>
                            <Text style={styles.recommendedText}>Recomandat</Text>
                          </View>
                        ) : null}
                        <DifficultyTag level={scenario.backendDifficulty} />
                      </View>
                    </View>
                    <Text style={[styles.cardTitle, isCompact && styles.cardTitleCompact]}>
                      {scenario.title}
                    </Text>
                    <Text style={[styles.cardDescription, isCompact && styles.cardDescriptionCompact]}>
                      {scenario.description}
                    </Text>
                    {scenario.locked && scenario.unlockReason ? (
                      <Text style={styles.unlockReason}>{scenario.unlockReason}</Text>
                    ) : null}
                    <View style={styles.cardFooter}>
                      <View style={styles.cardMeta}>
                        <View style={styles.metaItem}>
                          <Ionicons name="pulse-outline" size={12} color={TrainingColors.textMuted} />
                          <Text style={styles.metaText}>{scenario.difficulty}</Text>
                        </View>
                        <Text style={styles.metaDivider}>|</Text>
                        <View style={styles.metaItem}>
                          <Ionicons name="time-outline" size={12} color={TrainingColors.textMuted} />
                          <Text style={styles.metaText}>{scenario.time}</Text>
                        </View>
                      </View>
                      <View style={styles.cardFooterAction}>
                        <Text style={styles.cardFooterActionText}>
                          {scenario.locked ? 'Blocat' : 'Start'}
                        </Text>
                        <Ionicons
                          name={scenario.locked ? 'lock-closed-outline' : 'arrow-forward'}
                          size={14}
                          color={scenario.locked ? TrainingColors.textMuted : TrainingColors.accentTeal}
                        />
                      </View>
                    </View>
                  </Pressable>
                );

                if (scenario.locked) {
                  return <View key={scenario.id}>{card}</View>;
                }

                return (
                  <View key={scenario.id} style={styles.cardGroup}>
                    <Link
                      href={{
                        pathname: '/chat/[scenarioId]',
                        params: {
                          scenarioId: scenario.id,
                          templateId: scenario.id,
                          attackType: scenario.attackType,
                          difficulty: scenario.backendDifficulty,
                          sessionId: sessionId ?? undefined,
                        },
                      }}
                      asChild>
                      {card}
                    </Link>
                    <Pressable
                      disabled={sendingLiveId === scenario.id}
                      onPress={() => void startLiveEmailDrill(scenario)}
                      style={({ pressed }) => [
                        styles.liveAction,
                        pressed && styles.cardPressed,
                        sendingLiveId === scenario.id && styles.liveActionDisabled,
                      ]}>
                      <Ionicons
                        name={sendingLiveId === scenario.id ? 'sync-outline' : 'mail-outline'}
                        size={14}
                        color={TrainingColors.accentTeal}
                      />
                      <Text style={styles.liveActionText}>
                        {sendingLiveId === scenario.id ? 'Se trimite...' : 'Trimite live email'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
      </ScrollView>
    </View>
  );
}

function DifficultyTag({ level }: { level: DifficultyLevel }) {
  const presentation = DIFFICULTY_PRESENTATION[level];
  return (
    <View
      style={[
        styles.difficultyPill,
        {
          borderColor: presentation.borderColor,
          backgroundColor: presentation.backgroundColor,
        },
      ]}>
      <View style={[styles.difficultyDot, { backgroundColor: presentation.color }]} />
      <Text style={[styles.difficultyTagText, { color: presentation.color }]}>
        {presentation.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20, paddingTop: 50, paddingBottom: 130, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  headerCopy: { flex: 1 },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TrainingColors.accentBlue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },
  eyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  title: { color: TrainingColors.textPrimary, fontSize: 24, fontWeight: '800', letterSpacing: 0 },
  subtitle: { color: TrainingColors.textSecondary, fontSize: 12, marginTop: 2 },
  titleCompact: { fontSize: 21 },
  subtitleCompact: { fontSize: 11 },
  searchBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    backgroundColor: 'rgba(13, 24, 40, 0.94)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...TrainingShadows.card,
  },
  searchBoxCompact: { paddingVertical: 8 },
  searchInput: { flex: 1, color: TrainingColors.textPrimary, fontSize: 14 },
  clearSearch: { padding: 2 },
  filters: { gap: 8, paddingTop: 4, paddingBottom: 2 },
  selectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 2,
  },
  selectorLabel: {
    color: TrainingColors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  resultCount: {
    color: TrainingColors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  filter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterActive: { backgroundColor: TrainingColors.buttonPrimary, borderColor: TrainingColors.buttonPrimaryBorder },
  filterText: { color: TrainingColors.textSecondary, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#EEF6FF' },
  levelSelector: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.94)',
    ...TrainingShadows.card,
  },
  levelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  levelButtonActive: {
    backgroundColor: 'rgba(245, 197, 107, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 197, 107, 0.38)',
  },
  levelButtonText: {
    color: TrainingColors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  levelButtonTextActive: { color: '#FFE7BA' },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  list: { gap: 10, marginTop: 2 },
  levelSection: { gap: 9, marginTop: 4 },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 5,
    paddingHorizontal: 2,
  },
  levelHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  levelHeaderText: { flex: 1 },
  levelTitle: { color: TrainingColors.textPrimary, fontSize: 15, fontWeight: '800' },
  levelSubtitle: { color: TrainingColors.textMuted, fontSize: 10, marginTop: 1 },
  levelCount: {
    minWidth: 25,
    textAlign: 'center',
    color: TrainingColors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 7,
    backgroundColor: TrainingColors.panelSoft,
  },
  sessionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.9)',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 12,
    ...TrainingShadows.card,
  },
  sessionIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(69,224,177,0.12)',
  },
  sessionTitle: { color: TrainingColors.textPrimary, fontSize: 12, fontWeight: '700' },
  sessionMeta: { color: TrainingColors.textSecondary, fontSize: 11, marginTop: 1 },
  liveControlPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    backgroundColor: 'rgba(13, 24, 40, 0.96)',
    padding: 13,
    gap: 11,
    ...TrainingShadows.card,
  },
  liveControlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveControlIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.34)',
    backgroundColor: 'rgba(69, 224, 177, 0.1)',
  },
  liveControlEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  liveControlTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1,
  },
  liveStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  liveStatusPillText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  recipientInputShell: {
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(5, 10, 19, 0.62)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recipientInput: {
    flex: 1,
    minWidth: 0,
    color: TrainingColors.textPrimary,
    fontSize: 13,
  },
  liveControlActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  liveControlHint: {
    flex: 1,
    color: TrainingColors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  liveHistoryButton: {
    minHeight: 34,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.32)',
    backgroundColor: 'rgba(69, 224, 177, 0.08)',
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  liveHistoryButtonText: {
    color: TrainingColors.accentTeal,
    fontSize: 11,
    fontWeight: '800',
  },
  liveStatusCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.38)',
    backgroundColor: 'rgba(18, 46, 53, 0.92)',
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    padding: 12,
    ...TrainingShadows.card,
  },
  liveStatusCopy: { flex: 1, minWidth: 0 },
  demoLinkButton: {
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.34)',
    backgroundColor: 'rgba(69, 224, 177, 0.11)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  demoLinkButtonText: {
    color: TrainingColors.accentTeal,
    fontSize: 10,
    fontWeight: '800',
  },
  liveErrorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 125, 125, 0.36)',
    backgroundColor: 'rgba(55, 20, 25, 0.9)',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 12,
  },
  liveErrorText: { color: TrainingColors.textPrimary, flex: 1, fontSize: 11, lineHeight: 16 },
  liveFeedbackCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    ...TrainingShadows.card,
  },
  liveFeedbackMain: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
  },
  liveFeedbackRisk: {
    borderColor: 'rgba(255, 125, 125, 0.38)',
    backgroundColor: 'rgba(55, 20, 25, 0.92)',
  },
  liveFeedbackPending: {
    borderColor: 'rgba(245, 169, 74, 0.38)',
    backgroundColor: 'rgba(45, 34, 18, 0.92)',
  },
  liveFeedbackIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  liveDeliveryError: {
    color: TrainingColors.accentDanger,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  secondaryLiveButton: {
    alignSelf: 'stretch',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.3)',
    backgroundColor: 'rgba(69, 224, 177, 0.08)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  secondaryLiveButtonText: {
    color: TrainingColors.accentTeal,
    fontSize: 12,
    fontWeight: '800',
  },
  reportAction: {
    alignSelf: 'stretch',
    borderRadius: 12,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    paddingVertical: 11,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  reportActionText: {
    color: '#EFF6FF',
    fontSize: 12,
    fontWeight: '800',
  },
  cardGroup: { gap: 7 },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: 'rgba(13, 24, 40, 0.94)',
    padding: 16,
    gap: 9,
    ...TrainingShadows.card,
  },
  cardCompact: { padding: 12, gap: 6 },
  cardPressed: { opacity: 0.92 },
  cardRecommended: {
    borderColor: 'rgba(69, 224, 177, 0.55)',
    backgroundColor: 'rgba(18, 46, 53, 0.97)',
    shadowColor: TrainingColors.accentTeal,
    shadowOpacity: 0.16,
  },
  cardLocked: {
    opacity: 0.68,
    borderColor: TrainingColors.borderSubtle,
    backgroundColor: 'rgba(13, 24, 40, 0.72)',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTags: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardType: {
    color: TrainingColors.accentTeal,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontSize: 10,
    fontWeight: '700',
  },
  cardTitle: { color: TrainingColors.textPrimary, fontSize: 17, fontWeight: '800' },
  cardTitleCompact: { fontSize: 15 },
  cardDescription: { color: TrainingColors.textSecondary, fontSize: 13, lineHeight: 18 },
  cardDescriptionCompact: { fontSize: 12, lineHeight: 16 },
  unlockReason: {
    color: TrainingColors.accentAmber,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  cardFooterAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  cardFooterActionText: {
    color: TrainingColors.accentTeal,
    fontSize: 11,
    fontWeight: '800',
  },
  liveAction: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.34)',
    backgroundColor: 'rgba(69, 224, 177, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  liveActionDisabled: { opacity: 0.64 },
  liveActionText: {
    color: TrainingColors.accentTeal,
    fontSize: 11,
    fontWeight: '800',
  },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: TrainingColors.textMuted, fontSize: 11 },
  metaDivider: { color: TrainingColors.textMuted, fontSize: 11 },
  difficultyPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  difficultyDot: { width: 5, height: 5, borderRadius: 3 },
  difficultyTagText: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  recommendedPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.45)',
    backgroundColor: 'rgba(69, 224, 177, 0.12)',
  },
  recommendedText: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '800',
  },
  lockedPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: TrainingColors.borderSubtle,
    backgroundColor: 'rgba(116, 142, 171, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lockedPillText: {
    color: TrainingColors.textMuted,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '800',
  },
});
