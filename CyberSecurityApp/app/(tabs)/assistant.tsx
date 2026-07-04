import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { AppBackdrop } from '@/components/app-backdrop';
import { useAuth } from '@/features/auth/auth-context';
import { askAssistant } from '@/features/training/api';
import {
  ASSISTANT_MESSAGES_STORAGE_KEY,
  buildUserStorageKey,
} from '@/features/training/local-cache';
import type { AssistantAskApiResponse } from '@/features/training/types';
import { TrainingColors } from '@/features/training/ui-theme';
import { useTrainingSession } from '@/features/training/useTrainingSession';

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  source?: AssistantAskApiResponse['content_source'];
  model?: string | null;
  generationMs?: number | null;
  safetyStatus?: AssistantAskApiResponse['safety_status'];
};
const ASSISTANT_MESSAGES_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const ASSISTANT_MESSAGES_MAX_ITEMS = 40;

type PersistedAssistantMessages = {
  ownerUserId: string;
  messages: Msg[];
  updatedAt: number;
};

const defaultMessages: Msg[] = [
  {
    id: 's1',
    role: 'assistant',
    text: 'Salut 👋 Sunt Sentinel, coach-ul tău AI de apărare. Întreabă-mă orice despre phishing, smishing, vishing sau cum să rămâi în siguranță online.',
  },
];

const suggestions = [
  'Cum identific un email de phishing?',
  'Care este diferența dintre phishing și smishing?',
  'De ce sunt periculoase mesajele urgente?',
  'Cum verific un apelant suspect?',
];

export default function AssistantScreen() {
  const { user } = useAuth();
  const { sessionId, scenario, attackType, difficulty } = useTrainingSession();
  const { width } = useWindowDimensions();
  const isCompact = width < 370;
  const [messages, setMessages] = useState<Msg[]>(defaultMessages);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const currentUserId = user?.id ?? null;
  const activeUserIdRef = useRef<string | null>(currentUserId);
  activeUserIdRef.current = currentUserId;
  const storageKey = useMemo(
    () => buildUserStorageKey(ASSISTANT_MESSAGES_STORAGE_KEY, user?.id),
    [user?.id]
  );

  useEffect(() => {
    let cancelled = false;
    const hydrationUserId = user?.id ?? null;

    setMessages(defaultMessages);
    setDraft('');
    setThinking(false);
    setHydratedUserId(null);
    setIsHydrated(false);

    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw || cancelled) {
          return;
        }

        const parsed = JSON.parse(raw) as PersistedAssistantMessages;
        if (parsed.ownerUserId !== hydrationUserId) {
          await AsyncStorage.removeItem(storageKey);
          return;
        }

        if (
          typeof parsed.updatedAt === 'number' &&
          Date.now() - parsed.updatedAt <= ASSISTANT_MESSAGES_TTL_MS &&
          Array.isArray(parsed.messages) &&
          parsed.messages.length > 0
        ) {
          setMessages(parsed.messages.slice(-ASSISTANT_MESSAGES_MAX_ITEMS));
          return;
        }

        await AsyncStorage.removeItem(storageKey);
      } catch {
        // Ignore local cache read errors.
      } finally {
        if (!cancelled) {
          setHydratedUserId(hydrationUserId);
          setIsHydrated(true);
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [storageKey, user?.id]);

  useEffect(() => {
    if (!isHydrated || !user || hydratedUserId !== user.id) {
      return;
    }

    const stateToPersist: PersistedAssistantMessages = {
      ownerUserId: user.id,
      messages: messages.slice(-ASSISTANT_MESSAGES_MAX_ITEMS),
      updatedAt: Date.now(),
    };
    void AsyncStorage.setItem(storageKey, JSON.stringify(stateToPersist));
  }, [hydratedUserId, isHydrated, messages, storageKey, user]);

  const clearLocalCache = async () => {
    await AsyncStorage.removeItem(storageKey);
    setMessages(defaultMessages);
    setDraft('');
    setThinking(false);
    Alert.alert('Cache șters', 'Datele locale ale asistentului au fost resetate.');
  };

  const send = async (text: string) => {
    const value = text.trim();
    const requestUserId = user?.id ?? null;
    if (!value || thinking || !requestUserId) return;

    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: 'user', text: value }]);
    setDraft('');
    setThinking(true);

    try {
      const history = messages.slice(-8).map((message) => ({
        role: message.role,
        content: message.text.slice(0, 600),
      }));
      const data = await askAssistant({
        message: value,
        history,
        session_id: sessionId ?? undefined,
        scenario_id: scenario?.scenario_id,
        attack_type: scenario?.attack_type ?? attackType,
        difficulty: scenario?.difficulty ?? difficulty,
      });
      if (activeUserIdRef.current !== requestUserId) {
        return;
      }
      const tipsText = data.quick_tips.map((tip, index) => `${index + 1}. ${tip}`).join('\n');
      const assistantText = tipsText ? `${data.answer}\n\n${tipsText}` : data.answer;
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: assistantText,
          source: data.content_source,
          model: data.llm_model,
          generationMs: data.generation_ms,
          safetyStatus: data.safety_status,
        },
      ]);
    } catch {
      if (activeUserIdRef.current === requestUserId) {
        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: 'Nu am putut contacta asistentul acum. Verifică backend-ul și încearcă din nou.',
          },
        ]);
      }
    } finally {
      if (activeUserIdRef.current === requestUserId) {
        setThinking(false);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 92 : 0}>
      <AppBackdrop grid />
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="sparkles" size={18} color="#EFF6FF" />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.title, isCompact && styles.titleCompact]}>Asistent Sentinel</Text>
            <Text style={styles.subtitle}>Coach-ul tău cyber mereu activ</Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel="Șterge cache asistent"
          onPress={() => void clearLocalCache()}
          style={styles.clearCacheButton}>
          <Ionicons name="trash-outline" size={14} color={TrainingColors.textSecondary} />
          <Text style={styles.clearCacheText}>{isCompact ? 'Cache' : 'Șterge cache'}</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.messages} contentContainerStyle={styles.messageContent}>
        {messages.map((m) =>
          m.role === 'assistant' ? (
            <View key={m.id} style={styles.assistantRow}>
              <View style={styles.assistantIcon}>
                <Ionicons name="sparkles" size={14} color="#EFF6FF" />
              </View>
              <View style={styles.assistantBubble}>
                <Text style={styles.assistantText}>{m.text}</Text>
                {m.source ? (
                  <Text style={styles.sourceText}>
                    {m.source === 'ollama'
                      ? `Răspuns AI${m.model ? ` · ${m.model}` : ''}${
                          m.generationMs !== null && m.generationMs !== undefined
                            ? ` · ${m.generationMs} ms`
                            : ''
                        }`
                      : m.safetyStatus === 'refused'
                        ? 'Protecție de siguranță'
                        : 'Ghidare offline verificată'}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View key={m.id} style={styles.userRow}>
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{m.text}</Text>
              </View>
            </View>
          )
        )}

        {thinking ? (
          <View style={styles.assistantRow}>
            <View style={styles.assistantIcon}>
              <Ionicons name="sparkles" size={14} color="#EFF6FF" />
            </View>
            <View style={styles.thinkingBubble}>
              <View style={styles.typingRow}>
                <View style={[styles.typingDot, { opacity: 0.45 }]} />
                <View style={[styles.typingDot, { opacity: 0.7 }]} />
                <View style={styles.typingDot} />
              </View>
            </View>
          </View>
        ) : null}

        {messages.length <= 1 ? (
          <View style={styles.suggestions}>
            <Text style={styles.suggestionsLabel}>Încearcă să întrebi</Text>
            {suggestions.map((s) => (
              <Pressable key={s} onPress={() => void send(s)} style={styles.suggestionCard}>
                <Text style={styles.suggestionText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.composer}>
        <View style={styles.inputWrap}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => void send(draft)}
              placeholder="Întreabă despre phishing, smishing..."
              placeholderTextColor={TrainingColors.textMuted}
              style={styles.input}
            />
            <Pressable
              onPress={() => void send(draft)}
              style={[styles.sendButton, (!draft.trim() || thinking) && styles.sendDisabled]}
              disabled={!draft.trim() || thinking}>
              <Ionicons name="send" size={15} color="#EFF6FF" />
            </Pressable>
          </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 10,
  },
  headerCompact: { paddingHorizontal: 14, gap: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  headerText: { flex: 1, minWidth: 0 },
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
  title: { color: TrainingColors.textPrimary, fontSize: 23, fontWeight: '800' },
  titleCompact: { fontSize: 20 },
  subtitle: { color: TrainingColors.textSecondary, fontSize: 12 },
  clearCacheButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  clearCacheText: { color: TrainingColors.textSecondary, fontSize: 11, fontWeight: '700' },
  messages: { flex: 1 },
  messageContent: { paddingHorizontal: 20, paddingBottom: 18, gap: 10 },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  assistantIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: TrainingColors.buttonPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantBubble: {
    maxWidth: '84%',
    borderRadius: 16,
    borderTopLeftRadius: 6,
    backgroundColor: TrainingColors.panel,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  assistantText: { color: TrainingColors.textPrimary, fontSize: 14, lineHeight: 19 },
  sourceText: {
    color: TrainingColors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '84%',
    borderRadius: 16,
    borderTopRightRadius: 6,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  userText: { color: '#EFF6FF', fontSize: 14, lineHeight: 19 },
  thinkingBubble: {
    borderRadius: 16,
    borderTopLeftRadius: 6,
    backgroundColor: TrainingColors.panel,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TrainingColors.textMuted,
  },
  suggestions: { marginTop: 8, gap: 8 },
  suggestionsLabel: {
    color: TrainingColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 10,
    fontWeight: '700',
  },
  suggestionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  suggestionText: { color: TrainingColors.textPrimary, fontSize: 13 },
  composer: {
    borderTopWidth: 1,
    borderTopColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 94,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    borderRadius: 16,
    backgroundColor: TrainingColors.panelAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  input: { flex: 1, color: TrainingColors.textPrimary, fontSize: 14, paddingVertical: 6 },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.5 },
});
