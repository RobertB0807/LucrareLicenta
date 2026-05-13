import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { askAssistant } from '@/features/training/api';
import { clearTrainingLocalCache, LEARN_SCREEN_STORAGE_KEY } from '@/features/training/local-cache';
import type { AttackType, DifficultyLevel } from '@/features/training/types';
import { TrainingColors } from '@/features/training/ui-theme';

type Lesson = {
  id: string;
  category: 'Phishing' | 'Smishing' | 'Vishing' | 'Escrocherii web' | 'Siguranța contului' | 'Fundamente';
  title: string;
  summary: string;
  minutes: number;
  level: 'Începător' | 'Intermediar' | 'Avansat';
};

type LessonMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type ActiveCategory = 'Toate' | 'Fundamente' | 'Phishing' | 'Smishing' | 'Vishing' | 'Escrocherii web' | 'Siguranța contului';

type PersistedLearnState = {
  activeCat: ActiveCategory;
  openLessonId: string | null;
  lessonMessages: LessonMessage[];
  updatedAt: number;
};

const lessons: Lesson[] = [
  {
    id: 'phishing-101',
    category: 'Fundamente',
    title: 'Phishing 101: cum gândesc atacatorii',
    summary: 'Înțelege psihologia din spatele phishing-ului: urgență, autoritate și curiozitate.',
    minutes: 4,
    level: 'Începător',
  },
  {
    id: 'email-red-flags',
    category: 'Phishing',
    title: 'Cum observi red flags în email',
    summary: 'Domenii asemănătoare, nume de expeditor nepotrivite, CTA-uri urgente și atașamente malițioase.',
    minutes: 5,
    level: 'Începător',
  },
  {
    id: 'smishing-deep-dive',
    category: 'Smishing',
    title: 'Escrocherii SMS și alerte false de livrare',
    summary: 'De ce mesajele par mai credibile și cum exploatează atacatorii acest bias.',
    minutes: 4,
    level: 'Începător',
  },
  {
    id: 'vishing-callbacks',
    category: 'Vishing',
    title: 'Fraude vocale și apeluri deepfake',
    summary: 'De la impostori la voci clonate cu AI, verifică înainte să ai încredere.',
    minutes: 6,
    level: 'Intermediar',
  },
  {
    id: 'fake-websites',
    category: 'Escrocherii web',
    title: 'Pagini false de login și typosquatting',
    summary: 'Analizează URL-urile ca un profesionist: homoglife, subdomenii și trucuri cu certificate.',
    minutes: 5,
    level: 'Intermediar',
  },
  {
    id: 'mfa-passwords',
    category: 'Siguranța contului',
    title: 'MFA, passkeys și igiena parolelor',
    summary: 'De ce codurile SMS nu sunt suficiente și cum passkey-urile combat phishing-ul.',
    minutes: 5,
    level: 'Intermediar',
  },
  {
    id: 'social-engineering-advanced',
    category: 'Fundamente',
    title: 'Social engineering avansat',
    summary: 'Pretexting, spear-phishing și compromiterea emailului de business (BEC).',
    minutes: 7,
    level: 'Avansat',
  },
];

const categories = ['Toate', 'Fundamente', 'Phishing', 'Smishing', 'Vishing', 'Escrocherii web', 'Siguranța contului'] as const;
const LEARN_STATE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const LEARN_MESSAGES_MAX_ITEMS = 40;

function mapLessonCategoryToAttackType(
  category: Lesson['category']
): AttackType | undefined {
  if (category === 'Phishing') return 'phishing';
  if (category === 'Smishing') return 'smishing';
  if (category === 'Vishing') return 'impersonation';
  return undefined;
}

function mapLessonLevelToDifficulty(level: Lesson['level']): DifficultyLevel {
  if (level === 'Avansat') return 'hard';
  if (level === 'Intermediar') return 'medium';
  return 'easy';
}

export default function LearnScreen() {
  const [activeCat, setActiveCat] = useState<ActiveCategory>('Toate');
  const [openLesson, setOpenLesson] = useState<Lesson | null>(null);
  const [input, setInput] = useState('');
  const [lessonMessages, setLessonMessages] = useState<LessonMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const filtered = useMemo(
    () => (activeCat === 'Toate' ? lessons : lessons.filter((l) => l.category === activeCat)),
    [activeCat]
  );

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(LEARN_SCREEN_STORAGE_KEY);
        if (!raw || cancelled) {
          return;
        }

        const parsed = JSON.parse(raw) as PersistedLearnState;
        if (typeof parsed.updatedAt !== 'number' || Date.now() - parsed.updatedAt > LEARN_STATE_TTL_MS) {
          await AsyncStorage.removeItem(LEARN_SCREEN_STORAGE_KEY);
          return;
        }

        if (parsed.activeCat && categories.includes(parsed.activeCat)) {
          setActiveCat(parsed.activeCat);
        }

        if (Array.isArray(parsed.lessonMessages) && parsed.lessonMessages.length > 0) {
          setLessonMessages(parsed.lessonMessages.slice(-LEARN_MESSAGES_MAX_ITEMS));
        }

        if (typeof parsed.openLessonId === 'string' && parsed.openLessonId) {
          const matchedLesson = lessons.find((lesson) => lesson.id === parsed.openLessonId);
          if (matchedLesson) {
            setOpenLesson(matchedLesson);
          }
        }
      } catch {
        // Ignore local cache read errors.
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    const stateToPersist: PersistedLearnState = {
      activeCat,
      openLessonId: openLesson?.id ?? null,
      lessonMessages: lessonMessages.slice(-LEARN_MESSAGES_MAX_ITEMS),
      updatedAt: Date.now(),
    };
    void AsyncStorage.setItem(LEARN_SCREEN_STORAGE_KEY, JSON.stringify(stateToPersist));
  }, [activeCat, isHydrated, lessonMessages, openLesson?.id]);

  const clearLocalCache = async () => {
    await clearTrainingLocalCache();
    setActiveCat('Toate');
    setOpenLesson(null);
    setInput('');
    setLessonMessages([]);
    setIsAsking(false);
    setLessonError(null);
  };

  const openLessonModal = (lesson: Lesson) => {
    setOpenLesson(lesson);
    setInput('');
    setLessonError(null);
    setIsAsking(false);
    setLessonMessages([
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: `Lecția „${lesson.title}”: ${lesson.summary}\n\nÎntreabă-mă orice și îți explic pas cu pas.`,
      },
    ]);
  };

  const closeLessonModal = () => {
    setOpenLesson(null);
    setInput('');
    setLessonMessages([]);
    setLessonError(null);
    setIsAsking(false);
  };

  const sendFollowUp = async () => {
    const value = input.trim();
    if (!value || !openLesson || isAsking) {
      return;
    }

    setLessonMessages((current) => [...current, { id: `u-${Date.now()}`, role: 'user', text: value }]);
    setInput('');
    setLessonError(null);
    setIsAsking(true);

    try {
      const data = await askAssistant({
        message: value,
        attack_type: mapLessonCategoryToAttackType(openLesson.category),
        difficulty: mapLessonLevelToDifficulty(openLesson.level),
      });

      const tipsText = data.quick_tips.map((tip, index) => `${index + 1}. ${tip}`).join('\n');
      const assistantText = tipsText ? `${data.answer}\n\n${tipsText}` : data.answer;
      setLessonMessages((current) => [
        ...current,
        { id: `a-${Date.now()}`, role: 'assistant', text: assistantText },
      ]);
    } catch {
      setLessonError('Nu am putut contacta asistentul. Încearcă din nou.');
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="book-outline" size={18} color="#EFF6FF" />
            </View>
            <View>
              <Text style={styles.title}>Învață</Text>
              <Text style={styles.subtitle}>Stăpânește arta apărării cibernetice</Text>
            </View>
          </View>
          <Pressable onPress={() => void clearLocalCache()} style={styles.clearCacheButton}>
            <Ionicons name="trash-outline" size={14} color={TrainingColors.textSecondary} />
            <Text style={styles.clearCacheText}>Șterge cache</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="sparkles" size={16} color={TrainingColors.accentTeal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>Tutor AI</Text>
            <Text style={styles.heroText}>
              Deschide orice lecție și primești instant o explicație personalizată cu red flags și metode de apărare.
            </Text>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {categories.map((cat) => {
            const active = cat === activeCat;
            return (
              <Pressable key={cat} onPress={() => setActiveCat(cat)} style={[styles.filter, active && styles.filterActive]}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{cat}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.lessonList}>
          {filtered.map((lesson) => (
            <Pressable key={lesson.id} onPress={() => openLessonModal(lesson)} style={styles.lessonCard}>
              <View style={styles.lessonIcon}>
                <Ionicons name="school-outline" size={18} color={TrainingColors.accentTeal} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.lessonHead}>
                  <Text style={styles.lessonCategory}>{lesson.category}</Text>
                  <Text style={styles.lessonMeta}>
                    {lesson.minutes} min · {lesson.level}
                  </Text>
                </View>
                <Text style={styles.lessonTitle}>{lesson.title}</Text>
                <Text style={styles.lessonSummary}>{lesson.summary}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={TrainingColors.textMuted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal visible={openLesson !== null} transparent animationType="slide" onRequestClose={closeLessonModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalCategory}>
                  {openLesson?.category} · {openLesson?.level}
                </Text>
                <Text style={styles.modalTitle}>{openLesson?.title}</Text>
              </View>
              <Pressable onPress={closeLessonModal} style={styles.modalClose}>
                <Ionicons name="close" size={18} color={TrainingColors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              {lessonMessages.map((message) =>
                message.role === 'assistant' ? (
                  <View key={message.id} style={styles.botRow}>
                    <View style={styles.botIcon}>
                      <Ionicons name="sparkles" size={13} color={TrainingColors.accentTeal} />
                    </View>
                    <View style={styles.botBubble}>
                      <Text style={styles.botText}>{message.text}</Text>
                    </View>
                  </View>
                ) : (
                  <View key={message.id} style={styles.userRow}>
                    <View style={styles.userBubble}>
                      <Text style={styles.userText}>{message.text}</Text>
                    </View>
                  </View>
                )
              )}

              {isAsking ? (
                <View style={styles.botRow}>
                  <View style={styles.botIcon}>
                    <Ionicons name="sparkles" size={13} color={TrainingColors.accentTeal} />
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

              {lessonError ? <Text style={styles.modalErrorText}>{lessonError}</Text> : null}
            </ScrollView>

            <View style={styles.modalComposer}>
              <TextInput
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => void sendFollowUp()}
                placeholder="Pune o întrebare de follow-up..."
                placeholderTextColor={TrainingColors.textMuted}
                style={styles.modalInput}
              />
              <Pressable
                onPress={() => void sendFollowUp()}
                style={[styles.modalSend, (!input.trim() || isAsking) && styles.modalSendDisabled]}
                disabled={!input.trim() || isAsking}>
                <Ionicons name="send" size={14} color="#EFF6FF" />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  content: { paddingHorizontal: 20, paddingTop: 50, paddingBottom: 130, gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
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
  hero: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
  },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(69,224,177,0.12)',
  },
  heroEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  heroText: { color: TrainingColors.textPrimary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  filters: { gap: 8, paddingTop: 4, paddingBottom: 2 },
  filter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  filterActive: { backgroundColor: TrainingColors.buttonPrimary, borderColor: TrainingColors.buttonPrimaryBorder },
  filterText: { color: TrainingColors.textSecondary, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#EEF6FF' },
  lessonList: { gap: 10 },
  lessonCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  lessonIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  lessonCategory: { color: TrainingColors.textMuted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.9 },
  lessonMeta: { color: TrainingColors.textMuted, fontSize: 10 },
  lessonTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 2 },
  lessonSummary: { color: TrainingColors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(7,13,24,0.75)', justifyContent: 'flex-end' },
  modalCard: {
    height: '86%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingTop: 16,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  modalCategory: { color: TrainingColors.accentTeal, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },
  modalTitle: { color: TrainingColors.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 2 },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: { flex: 1, paddingHorizontal: 16, paddingVertical: 8 },
  botRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  botIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(69,224,177,0.12)',
  },
  botBubble: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    padding: 11,
  },
  botText: { color: TrainingColors.textPrimary, fontSize: 13, lineHeight: 18 },
  userRow: { alignItems: 'flex-end', marginTop: 8 },
  userBubble: {
    maxWidth: '84%',
    borderRadius: 14,
    borderTopRightRadius: 6,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  userText: { color: '#EFF6FF', fontSize: 13, lineHeight: 18 },
  thinkingBubble: {
    borderRadius: 14,
    borderTopLeftRadius: 6,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TrainingColors.textMuted,
  },
  modalErrorText: { color: TrainingColors.accentDanger, fontSize: 12, marginTop: 10 },
  modalComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: TrainingColors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 22,
  },
  modalInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    borderRadius: 12,
    backgroundColor: TrainingColors.panelAlt,
    color: TrainingColors.textPrimary,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 13,
  },
  modalSend: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
  },
  modalSendDisabled: { opacity: 0.5 },
});
