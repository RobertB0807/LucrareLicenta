import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppBackdrop } from '@/components/app-backdrop';
import { useAuth } from '@/features/auth/auth-context';
import {
  buildUserChatProgressPrefix,
  buildUserStorageKey,
  FEEDBACK_CONTEXT_STORAGE_KEY,
} from '@/features/training/local-cache';
import type { AttackType, DifficultyLevel } from '@/features/training/types';
import { TrainingColors } from '@/features/training/ui-theme';
import { useTrainingSession } from '@/features/training/useTrainingSession';

type Msg =
  | { id: string; from: 'attacker'; kind: 'text'; text: string }
  | { id: string; from: 'attacker'; kind: 'link'; text: string; url: string }
  | { id: string; from: 'user'; kind: 'text'; text: string }
  | { id: string; from: 'system'; kind: 'text'; text: string };

const CHAT_PROGRESS_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const CHAT_PROGRESS_MAX_ENTRIES = 12;
const GENERATED_SCENARIO_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PersistedChatProgress = {
  ownerUserId: string;
  messages: Msg[];
  scriptDone: boolean;
  scenarioId: string | null;
  updatedAt: number;
};

async function cleanupChatProgressStorage(
  currentKey: string,
  chatProgressPrefix: string,
  expectedUserId: string | null
): Promise<void> {
  const storage = AsyncStorage as typeof AsyncStorage & {
    multiGet?: (keys: readonly string[]) => Promise<[string, string | null][]>;
    multiRemove?: (keys: readonly string[]) => Promise<void>;
  };

  const allKeys = await AsyncStorage.getAllKeys();
  const chatKeys = allKeys.filter((key) => key.startsWith(`${chatProgressPrefix}:`));
  if (!chatKeys.length) {
    return;
  }

  const now = Date.now();
  const entries =
    typeof storage.multiGet === 'function'
      ? await storage.multiGet(chatKeys)
      : await Promise.all(chatKeys.map(async (key) => [key, await AsyncStorage.getItem(key)] as [string, string | null]));
  const validEntries: { key: string; updatedAt: number }[] = [];
  const keysToRemove: string[] = [];

  for (const [key, raw] of entries) {
    if (!raw) {
      keysToRemove.push(key);
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedChatProgress;
      if (
        parsed.ownerUserId !== expectedUserId ||
        typeof parsed.updatedAt !== 'number' ||
        now - parsed.updatedAt > CHAT_PROGRESS_TTL_MS
      ) {
        keysToRemove.push(key);
        continue;
      }
      validEntries.push({ key, updatedAt: parsed.updatedAt });
    } catch {
      keysToRemove.push(key);
    }
  }

  validEntries.sort((a, b) => b.updatedAt - a.updatedAt);
  const overflowEntries = validEntries
    .filter((entry) => entry.key !== currentKey)
    .slice(Math.max(0, CHAT_PROGRESS_MAX_ENTRIES - 1));

  const uniqueKeysToRemove = Array.from(new Set([...keysToRemove, ...overflowEntries.map((entry) => entry.key)]));
  if (uniqueKeysToRemove.length) {
    if (typeof storage.multiRemove === 'function') {
      await storage.multiRemove(uniqueKeysToRemove);
    } else {
      await Promise.all(uniqueKeysToRemove.map((key) => AsyncStorage.removeItem(key)));
    }
  }
}

const CHANNEL_CONFIG: Record<string, { name: string; icon: keyof typeof Ionicons.glyphMap; subtitle: string }> = {
  email: { name: 'Email suspect', icon: 'mail-outline', subtitle: 'inbox · simulare' },
  sms: { name: 'SMS suspect', icon: 'chatbubble-ellipses-outline', subtitle: 'mesaj · simulare' },
  chat: { name: 'Chat suspect', icon: 'chatbubbles-outline', subtitle: 'online · simulare' },
  phone: { name: 'Apel suspect', icon: 'call-outline', subtitle: 'apel · simulare' },
};

const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: 'ușor',
  medium: 'mediu',
  hard: 'greu',
};

/** Split a long attacker message into multiple bubbles by sentence for a more natural chat feel. */
function splitIntoBubbles(message: string): string[] {
  // Split on ". " while keeping the period, but avoid splitting on short fragments
  const sentences = message.split(/(?<=\.)\s+/);
  const bubbles: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > 120 && current.length > 0) {
      bubbles.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current.trim()) {
    bubbles.push(current.trim());
  }

  return bubbles.length > 0 ? bubbles : [message];
}

/** Detect if a message contains a URL-like pattern and extract it */
function extractUrl(text: string): { cleanText: string; url: string } | null {
  const urlPattern = /\b([a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+(?:\/[^\s]*)?)\b/;
  const match = text.match(urlPattern);
  if (match && match[1].includes('.') && !match[1].startsWith('Q') && match[1].length > 5) {
    const url = match[1];
    const cleanText = text.replace(url, '').trim().replace(/\s{2,}/g, ' ');
    return { cleanText: cleanText || text, url };
  }
  return null;
}

function sameMessageContent(a: Msg, b: Msg): boolean {
  return (
    a.from === b.from &&
    a.kind === b.kind &&
    a.text === b.text &&
    ('url' in a ? a.url : undefined) === ('url' in b ? b.url : undefined)
  );
}

function normalizeChatMessages(messages: Msg[]): Msg[] {
  const normalized: Msg[] = [];
  const seenById = new Map<string, Msg>();

  messages.filter(Boolean).forEach((message, index) => {
    const existing = seenById.get(message.id);
    if (!existing) {
      seenById.set(message.id, message);
      normalized.push(message);
      return;
    }

    if (sameMessageContent(existing, message)) {
      return;
    }

    const recoveredMessage = {
      ...message,
      id: `${message.id}-recovered-${index}`,
    } as Msg;
    seenById.set(recoveredMessage.id, recoveredMessage);
    normalized.push(recoveredMessage);
  });

  return normalized;
}

function appendNormalizedMessages(current: Msg[], next: Msg | Msg[]): Msg[] {
  return normalizeChatMessages([...current, ...(Array.isArray(next) ? next : [next])]);
}

export default function ChatScenarioScreen() {
  const {
    scenarioId,
    templateId,
    generateNew,
    attackType,
    difficulty,
    runId,
    sessionId: routeSessionId,
  } = useLocalSearchParams<{
    scenarioId: string;
    templateId?: string;
    generateNew?: string;
    attackType?: string;
    difficulty?: string;
    runId?: string;
    sessionId?: string;
  }>();

  const { user, isAuthenticated } = useAuth();
  const {
    scenario,
    isLoading,
    error,
    startSimulation,
    restoreScenario,
    evaluateWithOptionId,
    evaluation,
    sessionId,
  } = useTrainingSession();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [scriptDone, setScriptDone] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [isChatStateHydrated, setIsChatStateHydrated] = useState(false);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [hasRestoredChatState, setHasRestoredChatState] = useState(false);
  const [restoredScenarioId, setRestoredScenarioId] = useState<string | null>(null);
  const hasGeneratedRef = useRef(false);
  const animatedScenarioIdRef = useRef<string | null>(null);
  const choiceInFlightRef = useRef(false);
  const feedbackNavigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const messagesRef = useRef<Msg[]>([]);
  const chatProgressPrefix = useMemo(
    () => buildUserChatProgressPrefix(user?.id),
    [user?.id]
  );
  const chatStorageKey = useMemo(
    () =>
      `${chatProgressPrefix}:${String(scenarioId ?? 'unknown')}:${String(attackType ?? 'phishing')}:${String(difficulty ?? 'easy')}:${String(routeSessionId ?? 'new')}:${generateNew === 'true' ? `fresh-${String(runId ?? 'new')}` : 'restore'}`,
    [attackType, chatProgressPrefix, difficulty, generateNew, routeSessionId, runId, scenarioId]
  );
  const feedbackStorageKey = useMemo(
    () => buildUserStorageKey(FEEDBACK_CONTEXT_STORAGE_KEY, user?.id),
    [user?.id]
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    const hydrationUserId = user?.id ?? null;

    setMessages([]);
    setTyping(false);
    setScriptDone(false);
    setEvaluating(false);
    setHasRestoredChatState(false);
    setRestoredScenarioId(null);
    setHydratedUserId(null);
    setIsChatStateHydrated(false);
    hasGeneratedRef.current = false;
    animatedScenarioIdRef.current = null;
    choiceInFlightRef.current = false;

    const hydrateChatProgress = async () => {
      try {
        await cleanupChatProgressStorage(chatStorageKey, chatProgressPrefix, hydrationUserId);

        if (generateNew === 'true') {
          await AsyncStorage.removeItem(chatStorageKey);
          return;
        }

        const raw = await AsyncStorage.getItem(chatStorageKey);
        if (!raw || cancelled) {
          return;
        }

        const parsed = JSON.parse(raw) as PersistedChatProgress;
        if (parsed.ownerUserId !== hydrationUserId) {
          await AsyncStorage.removeItem(chatStorageKey);
          return;
        }
        if (Array.isArray(parsed.messages)) {
          const restoredMessages = normalizeChatMessages(parsed.messages);
          setMessages(restoredMessages);
          if (parsed.messages.length > 0) {
            animatedScenarioIdRef.current =
              parsed.scenarioId ?? (restoredMessages.some((message) => message.from === 'attacker') ? 'restored' : null);
          }
        }
        setScriptDone(Boolean(parsed.scriptDone));
        setRestoredScenarioId(parsed.scenarioId ?? null);
        setHasRestoredChatState(true);
      } catch {
        setHasRestoredChatState(false);
        setRestoredScenarioId(null);
      } finally {
        if (!cancelled) {
          setHydratedUserId(hydrationUserId);
          setIsChatStateHydrated(true);
        }
      }
    };

    void hydrateChatProgress();
    return () => {
      cancelled = true;
    };
  }, [chatProgressPrefix, chatStorageKey, generateNew, user?.id]);

  useEffect(() => {
    if (!isChatStateHydrated || !user || hydratedUserId !== user.id) {
      return;
    }

    const stateToPersist: PersistedChatProgress = {
      ownerUserId: user.id,
      messages: normalizeChatMessages(messages),
      scriptDone,
      scenarioId: scenario?.scenario_id ?? null,
      updatedAt: Date.now(),
    };
    void AsyncStorage.setItem(chatStorageKey, JSON.stringify(stateToPersist)).then(() =>
      cleanupChatProgressStorage(chatStorageKey, chatProgressPrefix, user.id)
    );
  }, [
    chatProgressPrefix,
    chatStorageKey,
    hydratedUserId,
    isChatStateHydrated,
    messages,
    scenario?.scenario_id,
    scriptDone,
    user,
  ]);

  // Restore an existing generated scenario before creating a replacement.
  useEffect(() => {
    if (!isChatStateHydrated) return;
    if (hasGeneratedRef.current) return;

    const directScenarioId =
      !templateId &&
      generateNew !== 'true' &&
      GENERATED_SCENARIO_ID_PATTERN.test(String(scenarioId ?? ''))
        ? String(scenarioId)
        : null;
    const scenarioIdToRestore =
      generateNew === 'true'
        ? null
        : (hasRestoredChatState ? restoredScenarioId : null) ?? directScenarioId;

    if (scenarioIdToRestore && scenario?.scenario_id === scenarioIdToRestore) {
      hasGeneratedRef.current = true;
      return;
    }
    hasGeneratedRef.current = true;

    let cancelled = false;
    const restoreOrGenerate = async () => {
      if (scenarioIdToRestore) {
        const restored = await restoreScenario(scenarioIdToRestore);
        if (cancelled || restored) {
          return;
        }

        if (hasRestoredChatState) {
          setMessages([]);
          setScriptDone(false);
          setHasRestoredChatState(false);
          setRestoredScenarioId(null);
        }
      }

      const at = (attackType as AttackType) || 'phishing';
      const diff = (difficulty as DifficultyLevel) || 'easy';
      await startSimulation(at, diff, routeSessionId ?? null, templateId);
    };

    void restoreOrGenerate();
    return () => {
      cancelled = true;
    };
  }, [
    attackType,
    difficulty,
    generateNew,
    hasRestoredChatState,
    isChatStateHydrated,
    restoreScenario,
    restoredScenarioId,
    routeSessionId,
    scenario?.scenario_id,
    scenarioId,
    startSimulation,
    templateId,
  ]);

  // When scenario arrives from backend, animate the attacker messages
  useEffect(() => {
    if (
      !isChatStateHydrated ||
      !scenario ||
      animatedScenarioIdRef.current === scenario.scenario_id
    ) {
      return;
    }

    if (messagesRef.current.some((message) => message.from === 'attacker')) {
      animatedScenarioIdRef.current = scenario.scenario_id;
      if (!scriptDone) {
        setScriptDone(true);
      }
      return;
    }

    animatedScenarioIdRef.current = scenario.scenario_id;

    const bubbleTexts = splitIntoBubbles(scenario.attacker_message);
    const attackerMessages: Msg[] = [];

    for (let i = 0; i < bubbleTexts.length; i++) {
      const text = bubbleTexts[i];
      const urlData = extractUrl(text);

      if (urlData) {
        attackerMessages.push({
          id: `atk-${scenario.scenario_id}-${i}`,
          from: 'attacker',
          kind: 'link',
          text: urlData.cleanText,
          url: urlData.url,
        });
      } else {
        attackerMessages.push({
          id: `atk-${scenario.scenario_id}-${i}`,
          from: 'attacker',
          kind: 'text',
          text,
        });
      }
    }

    // Animate messages one by one
    let cancelled = false;
    let idx = 0;

    const showNext = () => {
      if (cancelled || idx >= attackerMessages.length) {
        setTyping(false);
        setScriptDone(true);
        return;
      }
      setTyping(true);
      const currentIdx = idx;
      const delay = 900 + Math.random() * 600;
      setTimeout(() => {
        if (cancelled) return;
        const msg = attackerMessages[currentIdx];
        if (msg) {
          setMessages((m) => appendNormalizedMessages(m, msg));
        }
        idx += 1;
        setTyping(false);
        setTimeout(showNext, 350);
      }, delay);
    };

    showNext();
    return () => {
      cancelled = true;
    };
  }, [isChatStateHydrated, scenario, scriptDone]);

  // After evaluation completes, navigate to feedback
  useEffect(() => {
    if (!evaluation || !evaluating || !isAuthenticated || !user?.id) {
      return;
    }

    let cancelled = false;
    const persistAndNavigate = async () => {
      try {
        await AsyncStorage.setItem(
          feedbackStorageKey,
          JSON.stringify({
            ownerUserId: user.id,
            scenarioId: scenario?.scenario_id ?? null,
            sessionId: sessionId ?? routeSessionId ?? null,
            attackType: scenario?.attack_type ?? ((attackType as AttackType) || 'phishing'),
            difficulty: scenario?.difficulty ?? ((difficulty as DifficultyLevel) || 'easy'),
            isCorrect: evaluation.is_correct,
            scoreDelta: evaluation.score_delta,
            explanation: evaluation.explanation,
            recommendation: evaluation.recommendation,
            redFlags: scenario?.red_flags ?? [],
            savedAt: Date.now(),
          })
        );
      } catch {
        // Navigation can continue even when the local feedback fallback cannot be saved.
      }

      if (cancelled) {
        return;
      }

      if (feedbackNavigationTimeoutRef.current) {
        clearTimeout(feedbackNavigationTimeoutRef.current);
      }

      feedbackNavigationTimeoutRef.current = setTimeout(() => {
        feedbackNavigationTimeoutRef.current = null;
        if (cancelled) {
          return;
        }
        router.push({
          pathname: '/feedback/[scenarioId]',
          params: {
            scenarioId: scenario?.scenario_id ?? 'unknown',
            sessionId: sessionId ?? undefined,
          },
        });
      }, 600);
    };

    void persistAndNavigate();
    return () => {
      cancelled = true;
      if (feedbackNavigationTimeoutRef.current) {
        clearTimeout(feedbackNavigationTimeoutRef.current);
        feedbackNavigationTimeoutRef.current = null;
      }
    };
  }, [
    attackType,
    difficulty,
    evaluation,
    evaluating,
    isAuthenticated,
    routeSessionId,
    scenario?.attack_type,
    scenario?.difficulty,
    scenario?.red_flags,
    scenario?.scenario_id,
    feedbackStorageKey,
    sessionId,
    user?.id,
  ]);

  const onChoice = async (optionId: string, label: string) => {
    if (choiceInFlightRef.current || evaluating || isLoading || evaluation) {
      return;
    }
    choiceInFlightRef.current = true;
    // Add user message
    setMessages((m) =>
      appendNormalizedMessages(m, {
        id: `u-${Date.now()}-${optionId}`,
        from: 'user',
        kind: 'text',
        text: label,
      })
    );
    setEvaluating(true);

    // Evaluate via backend using the direct method
    const success = await evaluateWithOptionId(optionId);
    if (!success) {
      choiceInFlightRef.current = false;
      setEvaluating(false);
    }
  };

  const channelConfig = useMemo(() => {
    const channel = scenario?.channel ?? 'email';
    return CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG.email;
  }, [scenario?.channel]);

  // Scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, typing]);

  // Loading state
  if (isLoading && !scenario) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <AppBackdrop />
        <ActivityIndicator size="large" color={TrainingColors.accentTeal} />
        <Text style={styles.loadingText}>Se generează scenariul...</Text>
      </View>
    );
  }

  // Error state
  if (error && !scenario) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <AppBackdrop />
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={32} color={TrainingColors.accentDanger} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => {
              hasGeneratedRef.current = false;
              const at = (attackType as AttackType) || 'phishing';
              const diff = (difficulty as DifficultyLevel) || 'easy';
              startSimulation(at, diff, routeSessionId ?? null, templateId);
            }}>
            <Text style={styles.retryText}>Încearcă din nou</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      <AppBackdrop />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Înapoi la scenarii"
          onPress={() => router.push('/(tabs)/scenarios')}
          style={styles.headerButton}>
          <Ionicons name="arrow-back" size={18} color={TrainingColors.textPrimary} />
        </Pressable>
        <View style={styles.avatar}>
          <Ionicons name={channelConfig.icon} size={18} color="#FDECEC" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{channelConfig.name}</Text>
          <Text style={styles.headerSubtitle}>{channelConfig.subtitle}</Text>
        </View>
        <View style={styles.difficultyBadge}>
          <Text style={styles.difficultyText}>
            {DIFFICULTY_LABELS[(scenario?.difficulty ?? difficulty ?? 'easy') as DifficultyLevel]}
          </Text>
        </View>
      </View>

      <View style={styles.banner}>
        <Ionicons name="sparkles" size={13} color={TrainingColors.accentAmber} />
        <Text style={styles.bannerText}>Simulare AI · răspunsurile nu sunt reale</Text>
      </View>

      {error ? (
        <View style={styles.inlineError}>
          <Ionicons name="alert-circle" size={14} color={TrainingColors.accentDanger} />
          <Text style={styles.inlineErrorText}>{error}</Text>
        </View>
      ) : null}

      <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={styles.messageContent}>
        {messages.filter(Boolean).map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
        {typing ? (
          <View style={styles.typingBubble}>
            <View style={styles.typingRow}>
              <View style={[styles.typingDot, { opacity: 0.45 }]} />
              <View style={[styles.typingDot, { opacity: 0.7 }]} />
              <View style={styles.typingDot} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.composer}>
        {evaluating || (evaluation && !evaluating) ? (
          <View style={styles.evaluatingContainer}>
            <ActivityIndicator size="small" color={TrainingColors.accentTeal} />
            <Text style={styles.evaluatingText}>Se evaluează răspunsul...</Text>
          </View>
        ) : scriptDone && scenario ? (
          <View style={styles.choices}>
            <Text style={styles.choicesLabel}>Cum răspunzi?</Text>
            {scenario.options.map((option) => (
              <Pressable
                key={option.id}
                disabled={evaluating || isLoading}
                onPress={() => onChoice(option.id, option.text)}
                style={({ pressed }) => [
                  styles.choiceButton,
                  pressed && styles.choicePressed,
                  (evaluating || isLoading) && styles.choiceDisabled,
                ]}>
                <Text style={styles.choiceText}>{option.text}</Text>
                <Ionicons name="send" size={13} color={TrainingColors.accentTeal} />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingText}>Se încarcă mesajele...</Text>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  if (msg.from === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{msg.text}</Text>
        </View>
      </View>
    );
  }
  if (msg.from === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{msg.text}</Text>
      </View>
    );
  }
  if (msg.kind === 'link') {
    return (
      <View style={styles.attackerRow}>
        <View style={styles.attackerBubble}>
          <Text style={styles.attackerText}>{msg.text}</Text>
          <View style={styles.linkCard}>
            <Ionicons name="link-outline" size={12} color={TrainingColors.accentDanger} />
            <Text style={styles.linkText}>{msg.url}</Text>
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.attackerRow}>
      <View style={styles.attackerBubble}>
        <Text style={styles.attackerText}>{msg.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  loadingText: { color: TrainingColors.textSecondary, marginTop: 14, fontSize: 14 },
  errorCard: {
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 24,
  },
  errorText: { color: TrainingColors.textPrimary, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  retryButton: {
    borderRadius: 12,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  retryText: { color: '#EFF6FF', fontSize: 13, fontWeight: '700' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 54,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: TrainingColors.accentDanger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: TrainingColors.textPrimary, fontSize: 15, fontWeight: '700' },
  headerSubtitle: { color: TrainingColors.accentTeal, fontSize: 10 },
  difficultyBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  difficultyText: {
    color: TrainingColors.accentAmber,
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,197,107,0.25)',
    backgroundColor: 'rgba(245,197,107,0.10)',
  },
  bannerText: { color: TrainingColors.accentAmber, fontSize: 11, fontWeight: '700' },
  inlineError: {
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 125, 125, 0.35)',
    backgroundColor: 'rgba(255, 125, 125, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inlineErrorText: {
    flex: 1,
    color: '#FFD0D0',
    fontSize: 12,
    lineHeight: 16,
  },
  messages: { flex: 1 },
  messageContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 18, gap: 8 },
  attackerRow: { alignItems: 'flex-start' },
  attackerBubble: {
    maxWidth: '83%',
    borderRadius: 16,
    borderBottomLeftRadius: 7,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  attackerText: { color: TrainingColors.textPrimary, fontSize: 14, lineHeight: 19 },
  linkCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,125,125,0.42)',
    backgroundColor: 'rgba(255,125,125,0.12)',
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkText: { color: TrainingColors.accentDanger, fontSize: 12, flex: 1, flexWrap: 'wrap' },
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    borderBottomRightRadius: 7,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  userText: { color: '#EFF6FF', fontSize: 14, lineHeight: 19 },
  systemRow: { alignItems: 'center', paddingVertical: 4 },
  systemText: { color: TrainingColors.textMuted, fontSize: 11, fontStyle: 'italic' },
  typingBubble: {
    borderRadius: 16,
    borderBottomLeftRadius: 7,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TrainingColors.textMuted,
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 18,
  },
  choices: { gap: 8 },
  choicesLabel: {
    color: TrainingColors.textMuted,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 10,
    fontWeight: '700',
  },
  choiceButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  choicePressed: { opacity: 0.85, borderColor: TrainingColors.accentTeal },
  choiceDisabled: { opacity: 0.55 },
  choiceText: { color: TrainingColors.textPrimary, fontSize: 13, fontWeight: '700', flex: 1 },
  evaluatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  evaluatingText: { color: TrainingColors.textSecondary, fontSize: 13 },
  waitingContainer: { alignItems: 'center', paddingVertical: 12 },
  waitingText: { color: TrainingColors.textMuted, fontSize: 12 },
});
