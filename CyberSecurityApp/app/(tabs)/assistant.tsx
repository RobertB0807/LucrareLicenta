import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { TrainingColors } from '@/features/training/ui-theme';

type Msg = { id: string; role: 'user' | 'assistant'; text: string };

const suggestions = [
  'How do I spot a phishing email?',
  "What's the difference between phishing and smishing?",
  'Why are urgent messages dangerous?',
  'How can I verify a suspicious caller?',
];

export default function AssistantScreen() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 's1',
      role: 'assistant',
      text: "Hey 👋 I'm Sentinel, your AI defense coach. Ask me anything about phishing, smishing, vishing, or how to stay safe online.",
    },
  ]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);

  const send = (text: string) => {
    const value = text.trim();
    if (!value) return;

    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: 'user', text: value }]);
    setDraft('');
    setThinking(true);

    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: 'Great question. Look for urgency, mismatched domains, generic greetings, and unusual sender addresses. When unsure - never click. Open the official app or website directly.',
        },
      ]);
      setThinking(false);
    }, 1200);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="sparkles" size={18} color="#EFF6FF" />
        </View>
        <View>
          <Text style={styles.title}>Sentinel Assistant</Text>
          <Text style={styles.subtitle}>Your always-on cyber coach</Text>
        </View>
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
            <Text style={styles.suggestionsLabel}>Try asking</Text>
            {suggestions.map((s) => (
              <Pressable key={s} onPress={() => send(s)} style={styles.suggestionCard}>
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
            onSubmitEditing={() => send(draft)}
            placeholder="Ask about phishing, smishing..."
            placeholderTextColor={TrainingColors.textMuted}
            style={styles.input}
          />
          <Pressable
            onPress={() => send(draft)}
            style={[styles.sendButton, !draft.trim() && styles.sendDisabled]}
            disabled={!draft.trim()}>
            <Ionicons name="send" size={15} color="#EFF6FF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 50, paddingBottom: 10 },
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
  subtitle: { color: TrainingColors.textSecondary, fontSize: 12 },
  messages: { flex: 1 },
  messageContent: { paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
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
