import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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

type PersistedChatProgress = {
  messages: Msg[];
  scriptDone: boolean;
  scenarioId: string | null;
  updatedAt: number;
};

async function cleanupChatProgressStorage(currentKey: string, chatProgressPrefix: string): Promise<void> {
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
      if (typeof parsed.updatedAt !== 'number' || now - parsed.updatedAt > CHAT_PROGRESS_TTL_MS) {
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

export default function ChatScenarioScreen() {
  const { scenarioId, attackType, difficulty, sessionId: routeSessionId } = useLocalSearchParams<{
    scenarioId: string;
    attackType?: string;
    difficulty?: string;
    sessionId?: string;
  }>();

  const { user } = useAuth();
  const {
    scenario,
    isLoading,
    error,
    startSimulation,
    evaluateWithOptionId,
    evaluation,
    sessionId,
  } = useTrainingSession();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [scriptDone, setScriptDone] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [isChatStateHydrated, setIsChatStateHydrated] = useState(false);
  const [hasRestoredChatState, setHasRestoredChatState] = useState(false);
  const [restoredScenarioId, setRestoredScenarioId] = useState<string | null>(null);
  const hasGeneratedRef = useRef(false);
  const feedbackNavigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const chatProgressPrefix = useMemo(
    () => buildUserChatProgressPrefix(user?.id),
    [user?.id]
  );
  const chatStorageKey = useMemo(
    () =>
      `${chatProgressPrefix}:${String(scenarioId ?? 'unknown')}:${String(attackType ?? 'phishing')}:${String(difficulty ?? 'easy')}:${String(routeSessionId ?? 'new')}`,
    [attackType, chatProgressPrefix, difficulty, routeSessionId, scenarioId]
  );
  const feedbackStorageKey = useMemo(
    () => buildUserStorageKey(FEEDBACK_CONTEXT_STORAGE_KEY, user?.id),
    [user?.id]
  );

  useEffect(() => {
    let cancelled = false;

    const hydrateChatProgress = async () => {
      try {
        await cleanupChatProgressStorage(chatStorageKey, chatProgressPrefix);

        const raw = await AsyncStorage.getItem(chatStorageKey);
        if (!raw || cancelled) {
          return;
        }

        const parsed = JSON.parse(raw) as PersistedChatProgress;
        if (Array.isArray(parsed.messages)) {
          setMessages(parsed.messages);
        }
        setScriptDone(Boolean(parsed.scriptDone));
        setRestoredScenarioId(parsed.scenarioId ?? null);
        setHasRestoredChatState(true);
      } catch {
        setHasRestoredChatState(false);
        setRestoredScenarioId(null);
      } finally {
        if (!cancelled) {
          setIsChatStateHydrated(true);
        }
      }
    };

    void hydrateChatProgress();
    return () => {
      cancelled = true;
    };
  }, [chatProgressPrefix, chatStorageKey]);

  useEffect(() => {
    if (!isChatStateHydrated) {
      return;
    }

    const stateToPersist: PersistedChatProgress = {
      messages,
      scriptDone,
      scenarioId: scenario?.scenario_id ?? null,
      updatedAt: Date.now(),
    };
    void AsyncStorage.setItem(chatStorageKey, JSON.stringify(stateToPersist)).then(() =>
      cleanupChatProgressStorage(chatStorageKey, chatProgressPrefix)
    );
  }, [chatProgressPrefix, chatStorageKey, isChatStateHydrated, messages, scenario?.scenario_id, scriptDone]);

  // Generate scenario on mount
  useEffect(() => {
    if (!isChatStateHydrated) return;
    if (hasGeneratedRef.current) return;
    if (hasRestoredChatState && restoredScenarioId && scenario?.scenario_id === restoredScenarioId) {
      hasGeneratedRef.current = true;
      return;
    }
    hasGeneratedRef.current = true;

    const at = (attackType as AttackType) || 'phishing';
    const diff = (difficulty as DifficultyLevel) || 'easy';
    startSimulation(at, diff, routeSessionId ?? null);
  }, [
    attackType,
    difficulty,
    hasRestoredChatState,
    isChatStateHydrated,
    restoredScenarioId,
    routeSessionId,
    scenario?.scenario_id,
    startSimulation,
  ]);

  // When scenario arrives from backend, animate the attacker messages
  useEffect(() => {
    if (!scenario || messages.length > 0) return;

    const bubbleTexts = splitIntoBubbles(scenario.attacker_message);
    const attackerMessages: Msg[] = [];

    for (let i = 0; i < bubbleTexts.length; i++) {
      const text = bubbleTexts[i];
      const urlData = extractUrl(text);

      if (urlData) {
        attackerMessages.push({
          id: `atk-${i}`,
          from: 'attacker',
          kind: 'link',
          text: urlData.cleanText,
          url: urlData.url,
        });
      } else {
        attackerMessages.push({
          id: `atk-${i}`,
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
          setMessages((m) => [...m, msg]);
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
  }, [messages.length, scenario]);

  // After evaluation completes, navigate to feedback
  useEffect(() => {
    if (evaluation && evaluating) {
      void AsyncStorage.setItem(
        feedbackStorageKey,
        JSON.stringify({
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
      ).finally(() => {
        if (feedbackNavigationTimeoutRef.current) {
          clearTimeout(feedbackNavigationTimeoutRef.current);
        }

        feedbackNavigationTimeoutRef.current = setTimeout(() => {
          feedbackNavigationTimeoutRef.current = null;
          router.push({
            pathname: '/feedback/[scenarioId]',
            params: {
              scenarioId: scenario?.scenario_id ?? 'unknown',
              sessionId: sessionId ?? undefined,
            },
          });
        }, 600);
      });
    }
    return () => {
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
    routeSessionId,
    scenario?.attack_type,
    scenario?.difficulty,
    scenario?.red_flags,
    scenario?.scenario_id,
    feedbackStorageKey,
    sessionId,
  ]);

  const onChoice = async (optionId: string, label: string) => {
    // Add user message
    setMessages((m) => [...m, { id: `u-${Date.now()}`, from: 'user', kind: 'text', text: label }]);
    setEvaluating(true);

    // Evaluate via backend using the direct method
    const success = await evaluateWithOptionId(optionId);
    if (!success) {
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
        <ActivityIndicator size="large" color={TrainingColors.accentTeal} />
        <Text style={styles.loadingText}>Se generează scenariul...</Text>
      </View>
    );
  }

  // Error state
  if (error && !scenario) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={32} color={TrainingColors.accentDanger} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => {
              hasGeneratedRef.current = false;
              const at = (attackType as AttackType) || 'phishing';
              const diff = (difficulty as DifficultyLevel) || 'easy';
              startSimulation(at, diff, routeSessionId ?? null);
            }}>
            <Text style={styles.retryText}>Încearcă din nou</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/(tabs)/scenarios')} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={18} color={TrainingColors.textPrimary} />
        </Pressable>
        <View style={styles.avatar}>
          <Ionicons name={channelConfig.icon} size={18} color="#FDECEC" />
        </View>
        <View style={{ flex: 1 }}>
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
                onPress={() => onChoice(option.id, option.text)}
                style={({ pressed }) => [styles.choiceButton, pressed && styles.choicePressed]}>
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
    </View>
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
  messageContent: { paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
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
  linkText: { color: TrainingColors.accentDanger, fontSize: 12 },
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
