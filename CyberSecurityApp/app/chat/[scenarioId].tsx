import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { TrainingColors } from '@/features/training/ui-theme';

type Msg =
  | { id: string; from: 'attacker'; kind: 'text'; text: string }
  | { id: string; from: 'attacker'; kind: 'link'; text: string; url: string }
  | { id: string; from: 'user'; kind: 'text'; text: string };

const initialScript: Msg[] = [
  {
    id: 'm1',
    from: 'attacker',
    kind: 'text',
    text: "Hi! This is Mark from SecureBank Fraud Prevention. We've detected an unusual $842.00 charge on your account.",
  },
  {
    id: 'm2',
    from: 'attacker',
    kind: 'text',
    text: "We need to verify your identity within the next 10 minutes or we'll have to freeze your account for safety. ⏱️",
  },
  {
    id: 'm3',
    from: 'attacker',
    kind: 'link',
    text: 'Please confirm your details here:',
    url: 'secur3-bank-verify.com/login',
  },
];

const choices = [
  { id: 'c1', label: 'Click the link and log in', verdict: 'wrong' as const },
  { id: 'c2', label: 'Ask for their employee ID', verdict: 'neutral' as const },
  { id: 'c3', label: 'Hang up & call my bank directly', verdict: 'right' as const },
];

export default function ChatScenarioScreen() {
  const { scenarioId } = useLocalSearchParams<{ scenarioId: string }>();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(true);
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    let i = 0;

    const run = () => {
      if (cancelled) return;
      if (i >= initialScript.length) {
        setTyping(false);
        setDone(true);
        return;
      }
      setTyping(true);
      const delay = 1100 + Math.random() * 700;
      setTimeout(() => {
        if (cancelled) return;
        setMessages((m) => [...m, initialScript[i]]);
        i += 1;
        setTyping(false);
        setTimeout(run, 450);
      }, delay);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const onChoice = (verdict: 'right' | 'wrong' | 'neutral', label: string) => {
    setMessages((m) => [...m, { id: `u-${Date.now()}`, from: 'user', kind: 'text', text: label }]);
    setTimeout(() => {
      router.push({
        pathname: '/feedback/[scenarioId]',
        params: { scenarioId: scenarioId ?? 'unknown', verdict },
      });
    }, 800);
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [...m, { id: `u-${Date.now()}`, from: 'user', kind: 'text', text }]);
    setDraft('');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.push('/(tabs)/scenarios')} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={18} color={TrainingColors.textPrimary} />
        </Pressable>
        <View style={styles.avatar}>
          <Ionicons name="warning" size={18} color="#FDECEC" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>SecureBank Support</Text>
          <Text style={styles.headerSubtitle}>online · simulation</Text>
        </View>
        <View style={styles.headerButton}>
          <Ionicons name="ellipsis-vertical" size={16} color={TrainingColors.textPrimary} />
        </View>
      </View>

      <View style={styles.banner}>
        <Ionicons name="sparkles" size={13} color={TrainingColors.accentAmber} />
        <Text style={styles.bannerText}>AI Simulation · responses are not real</Text>
      </View>

      <ScrollView style={styles.messages} contentContainerStyle={styles.messageContent}>
        {messages.map((m) => (
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
        {done ? (
          <View style={styles.choices}>
            <Text style={styles.choicesLabel}>How do you respond?</Text>
            {choices.map((choice) => (
              <Pressable key={choice.id} onPress={() => onChoice(choice.verdict, choice.label)} style={styles.choiceButton}>
                <Text style={styles.choiceText}>{choice.label}</Text>
                <Ionicons name="send" size={13} color={TrainingColors.accentTeal} />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={send}
              placeholder="Type a reply..."
              placeholderTextColor={TrainingColors.textMuted}
              style={styles.input}
            />
            <Pressable onPress={send} style={styles.sendButton}>
              <Ionicons name="send" size={15} color="#EFF6FF" />
            </Pressable>
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
  choiceText: { color: TrainingColors.textPrimary, fontSize: 13, fontWeight: '700', flex: 1 },
  inputRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
});
