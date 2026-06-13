import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/features/auth/auth-context';
import {
  askAssistant,
  getLearningLesson,
  getLearningLessons,
  submitLearningLessonQuiz,
} from '@/features/training/api';
import {
  buildUserStorageKey,
  clearTrainingLocalCache,
  LEARN_SCREEN_STORAGE_KEY,
} from '@/features/training/local-cache';
import type {
  AssistantAskApiResponse,
  LearningLessonDetailApiResponse,
  LearningLessonLevel,
  LearningLessonSummaryApiResponse,
  LearningQuizSubmitApiResponse,
} from '@/features/training/types';
import { TrainingColors } from '@/features/training/ui-theme';
import { useTrainingSession } from '@/features/training/useTrainingSession';

type LessonMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  source?: AssistantAskApiResponse['content_source'];
  model?: string | null;
  generationMs?: number | null;
  safetyStatus?: AssistantAskApiResponse['safety_status'];
};

type PersistedLearnState = {
  ownerUserId: string;
  activeCat: string;
  openLessonId: string | null;
  lessonMessages: LessonMessage[];
  updatedAt: number;
};

const LEARN_STATE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const LEARN_MESSAGES_MAX_ITEMS = 40;
const LEVEL_LABELS: Record<LearningLessonLevel, string> = {
  beginner: 'Începător',
  intermediate: 'Intermediar',
  advanced: 'Avansat',
};

export default function LearnScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ lessonId?: string }>();
  const { refreshLearningPath } = useTrainingSession();
  const [lessons, setLessons] = useState<LearningLessonSummaryApiResponse[]>([]);
  const [activeCat, setActiveCat] = useState('Toate');
  const [openLesson, setOpenLesson] = useState<LearningLessonDetailApiResponse | null>(null);
  const [isLoadingLessons, setIsLoadingLessons] = useState(true);
  const [openingLessonId, setOpeningLessonId] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [lessonMessages, setLessonMessages] = useState<LessonMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<LearningQuizSubmitApiResponse | null>(null);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [pendingOpenLessonId, setPendingOpenLessonId] = useState<string | null>(null);
  const currentUserId = user?.id ?? null;
  const activeUserIdRef = useRef<string | null>(currentUserId);
  activeUserIdRef.current = currentUserId;

  const storageKey = useMemo(
    () => buildUserStorageKey(LEARN_SCREEN_STORAGE_KEY, user?.id),
    [user?.id]
  );
  const categories = useMemo(
    () => ['Toate', ...Array.from(new Set(lessons.map((lesson) => lesson.category)))],
    [lessons]
  );
  const filtered = useMemo(
    () =>
      activeCat === 'Toate'
        ? lessons
        : lessons.filter((lesson) => lesson.category === activeCat),
    [activeCat, lessons]
  );

  useEffect(() => {
    if (lessons.length > 0 && !categories.includes(activeCat)) {
      setActiveCat('Toate');
    }
  }, [activeCat, categories, lessons.length]);

  const loadLessons = useCallback(async () => {
    const requestUserId = user?.id ?? null;
    if (!requestUserId) return;
    setIsLoadingLessons(true);
    setCatalogError(null);
    try {
      const response = await getLearningLessons();
      if (activeUserIdRef.current === requestUserId) {
        setLessons(response.items);
      }
    } catch {
      if (activeUserIdRef.current === requestUserId) {
        setCatalogError('Nu am putut încărca lecțiile din backend.');
      }
    } finally {
      if (activeUserIdRef.current === requestUserId) {
        setIsLoadingLessons(false);
      }
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadLessons();
    }, [loadLessons])
  );

  useEffect(() => {
    let cancelled = false;
    const hydrationUserId = user?.id ?? null;
    setActiveCat('Toate');
    setOpenLesson(null);
    setLessonMessages([]);
    setPendingOpenLessonId(null);
    setHydratedUserId(null);
    setIsHydrated(false);

    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as PersistedLearnState;
        if (
          parsed.ownerUserId !== hydrationUserId ||
          typeof parsed.updatedAt !== 'number' ||
          Date.now() - parsed.updatedAt > LEARN_STATE_TTL_MS
        ) {
          await AsyncStorage.removeItem(storageKey);
          return;
        }
        if (typeof parsed.activeCat === 'string' && parsed.activeCat) {
          setActiveCat(parsed.activeCat);
        }
        if (Array.isArray(parsed.lessonMessages)) {
          setLessonMessages(parsed.lessonMessages.slice(-LEARN_MESSAGES_MAX_ITEMS));
        }
        if (typeof parsed.openLessonId === 'string' && parsed.openLessonId) {
          setPendingOpenLessonId(parsed.openLessonId);
        }
      } catch {
        // Local continuity is best effort.
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
    if (!isHydrated || !user || hydratedUserId !== user.id) return;
    const state: PersistedLearnState = {
      ownerUserId: user.id,
      activeCat,
      openLessonId: openLesson?.id ?? pendingOpenLessonId,
      lessonMessages: lessonMessages.slice(-LEARN_MESSAGES_MAX_ITEMS),
      updatedAt: Date.now(),
    };
    void AsyncStorage.setItem(storageKey, JSON.stringify(state));
  }, [
    activeCat,
    hydratedUserId,
    isHydrated,
    lessonMessages,
    openLesson?.id,
    pendingOpenLessonId,
    storageKey,
    user,
  ]);

  const openLessonById = useCallback(
    async (lessonId: string, preserveMessages = false) => {
      const summary = lessons.find((lesson) => lesson.id === lessonId);
      if (summary?.status === 'locked') {
        Alert.alert('Lecție blocată', 'Finalizează cerințele modulului anterior.');
        return;
      }
      const requestUserId = user?.id ?? null;
      if (!requestUserId || openingLessonId) return;
      setOpeningLessonId(lessonId);
      setLessonError(null);
      try {
        const detail = await getLearningLesson(lessonId);
        if (activeUserIdRef.current !== requestUserId) return;
        setOpenLesson(detail);
        setPendingOpenLessonId(null);
        setSelectedAnswers({});
        setQuizResult(null);
        setInput('');
        if (!preserveMessages || lessonMessages.length === 0) {
          setLessonMessages([
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              text: `Lecția „${detail.title}”: ${detail.summary}\n\nParcurge conținutul, completează testul și întreabă-mă dacă ai nevoie de explicații.`,
            },
          ]);
        }
      } catch {
        if (activeUserIdRef.current === requestUserId) {
          setPendingOpenLessonId(null);
          Alert.alert('Lecție indisponibilă', 'Nu am putut încărca această lecție.');
        }
      } finally {
        if (activeUserIdRef.current === requestUserId) {
          setOpeningLessonId(null);
        }
      }
    },
    [lessonMessages.length, lessons, openingLessonId, user?.id]
  );

  useEffect(() => {
    const routeLessonId = typeof params.lessonId === 'string' ? params.lessonId : null;
    const targetLessonId = routeLessonId ?? pendingOpenLessonId;
    if (!targetLessonId || lessons.length === 0 || openingLessonId || openLesson) return;
    if (routeLessonId) router.setParams({ lessonId: '' });
    void openLessonById(targetLessonId, targetLessonId === pendingOpenLessonId);
  }, [
    lessons.length,
    openLesson,
    openLessonById,
    openingLessonId,
    params.lessonId,
    pendingOpenLessonId,
  ]);

  const closeLessonModal = () => {
    setOpenLesson(null);
    setPendingOpenLessonId(null);
    setInput('');
    setLessonMessages([]);
    setLessonError(null);
    setSelectedAnswers({});
    setQuizResult(null);
    setIsAsking(false);
    setIsSubmittingQuiz(false);
  };

  const clearLocalCache = async () => {
    await clearTrainingLocalCache(user?.id);
    closeLessonModal();
    setActiveCat('Toate');
    Alert.alert('Cache șters', 'Datele locale pentru lecții au fost resetate.');
  };

  const sendFollowUp = async () => {
    const value = input.trim();
    const requestUserId = user?.id ?? null;
    if (!value || !openLesson || isAsking || !requestUserId) return;
    setLessonMessages((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: 'user', text: value },
    ]);
    setInput('');
    setLessonError(null);
    setIsAsking(true);

    try {
      const data = await askAssistant({
        message: value,
        history: lessonMessages.slice(-8).map((message) => ({
          role: message.role,
          content: message.text.slice(0, 600),
        })),
        attack_type: openLesson.attack_type ?? undefined,
        difficulty: openLesson.difficulty,
        context_title: openLesson.title,
        context_summary: openLesson.summary,
      });
      if (activeUserIdRef.current !== requestUserId) return;
      const tips = data.quick_tips.map((tip, index) => `${index + 1}. ${tip}`).join('\n');
      setLessonMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: tips ? `${data.answer}\n\n${tips}` : data.answer,
          source: data.content_source,
          model: data.llm_model,
          generationMs: data.generation_ms,
          safetyStatus: data.safety_status,
        },
      ]);
    } catch {
      if (activeUserIdRef.current === requestUserId) {
        setLessonError('Nu am putut contacta asistentul. Încearcă din nou.');
      }
    } finally {
      if (activeUserIdRef.current === requestUserId) setIsAsking(false);
    }
  };

  const submitQuiz = async () => {
    if (
      !openLesson ||
      isSubmittingQuiz ||
      Object.keys(selectedAnswers).length !== openLesson.questions.length
    ) {
      return;
    }
    setIsSubmittingQuiz(true);
    setLessonError(null);
    try {
      const result = await submitLearningLessonQuiz(
        openLesson.id,
        openLesson.questions.map((question) => ({
          question_id: question.id,
          selected_option_id: selectedAnswers[question.id],
        }))
      );
      setQuizResult(result);
      setOpenLesson((current) =>
        current
          ? {
              ...current,
              attempts: current.attempts + 1,
              best_score: Math.max(current.best_score ?? 0, result.score),
              passed: current.passed || result.passed,
              status: result.passed ? 'completed' : 'in_progress',
            }
          : current
      );
      await Promise.all([loadLessons(), refreshLearningPath()]);
    } catch {
      setLessonError('Nu am putut evalua testul. Verifică răspunsurile și încearcă din nou.');
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  const resetQuiz = () => {
    setSelectedAnswers({});
    setQuizResult(null);
    setLessonError(null);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="book-outline" size={18} color="#EFF6FF" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Învață</Text>
              <Text style={styles.subtitle}>Lecții și evaluări salvate în progresul tău</Text>
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
          <View style={styles.flex}>
            <Text style={styles.heroEyebrow}>ÎNVĂȚARE EVALUATĂ</Text>
            <Text style={styles.heroText}>
              Parcurge lecția și promovează testul pentru a câștiga XP și a debloca traseul.
            </Text>
          </View>
        </View>

        {lessons.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {categories.map((category) => {
              const active = category === activeCat;
              return (
                <Pressable
                  key={category}
                  onPress={() => setActiveCat(category)}
                  style={[styles.filter, active && styles.filterActive]}>
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {category}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {isLoadingLessons && lessons.length === 0 ? (
          <StateCard icon="hourglass-outline" text="Se încarcă lecțiile..." loading />
        ) : null}
        {catalogError && lessons.length === 0 ? (
          <StateCard
            icon="cloud-offline-outline"
            text={catalogError}
            actionLabel="Reîncearcă"
            onAction={() => void loadLessons()}
          />
        ) : null}

        <View style={styles.lessonList}>
          {filtered.map((lesson) => (
            <Pressable
              key={lesson.id}
              disabled={openingLessonId !== null}
              onPress={() => void openLessonById(lesson.id)}
              style={[
                styles.lessonCard,
                lesson.status === 'locked' && styles.lessonCardLocked,
              ]}>
              <View style={styles.lessonIcon}>
                <Ionicons
                  name={
                    lesson.status === 'completed'
                      ? 'checkmark-circle'
                      : lesson.status === 'locked'
                        ? 'lock-closed'
                        : 'school-outline'
                  }
                  size={19}
                  color={
                    lesson.status === 'completed'
                      ? TrainingColors.accentTeal
                      : lesson.status === 'locked'
                        ? TrainingColors.textMuted
                        : TrainingColors.accentBlue
                  }
                />
              </View>
              <View style={styles.flex}>
                <View style={styles.lessonHead}>
                  <Text style={styles.lessonCategory}>{lesson.category}</Text>
                  <Text style={styles.lessonMeta}>
                    {lesson.duration_minutes} min · {LEVEL_LABELS[lesson.level]}
                  </Text>
                </View>
                <Text style={styles.lessonTitle}>{lesson.title}</Text>
                <Text style={styles.lessonSummary}>{lesson.summary}</Text>
                <Text style={styles.lessonProgress}>
                  {lesson.passed
                    ? `Promovat · scor maxim ${lesson.best_score}%`
                    : lesson.attempts > 0
                      ? `${lesson.attempts} încercări · scor maxim ${lesson.best_score}%`
                      : `Test: prag ${lesson.pass_score}% · ${lesson.xp_reward} XP`}
                </Text>
              </View>
              {openingLessonId === lesson.id ? (
                <ActivityIndicator size="small" color={TrainingColors.accentTeal} />
              ) : (
                <Ionicons name="chevron-forward" size={16} color={TrainingColors.textMuted} />
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={openLesson !== null}
        transparent
        animationType="slide"
        onRequestClose={closeLessonModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.flex}>
                <Text style={styles.modalCategory}>
                  {openLesson?.category} · {openLesson ? LEVEL_LABELS[openLesson.level] : ''}
                </Text>
                <Text style={styles.modalTitle}>{openLesson?.title}</Text>
              </View>
              <Pressable onPress={closeLessonModal} style={styles.modalClose}>
                <Ionicons name="close" size={18} color={TrainingColors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
              {openLesson?.sections.map((section) => (
                <View key={section.id} style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionBody}>{section.body}</Text>
                </View>
              ))}

              <View style={styles.quizHeader}>
                <View>
                  <Text style={styles.quizEyebrow}>TESTUL LECȚIEI</Text>
                  <Text style={styles.quizTitle}>Prag de promovare: {openLesson?.pass_score}%</Text>
                </View>
                {openLesson?.best_score !== null && openLesson?.best_score !== undefined ? (
                  <Text style={styles.bestScore}>Max {openLesson.best_score}%</Text>
                ) : null}
              </View>

              {openLesson?.questions.map((question, questionIndex) => {
                const result = quizResult?.answers.find(
                  (answer) => answer.question_id === question.id
                );
                return (
                  <View key={question.id} style={styles.questionCard}>
                    <Text style={styles.questionText}>
                      {questionIndex + 1}. {question.prompt}
                    </Text>
                    {question.options.map((option) => {
                      const selected = selectedAnswers[question.id] === option.id;
                      const correct = result?.correct_option_id === option.id;
                      const wrongSelected = Boolean(result && selected && !result.is_correct);
                      return (
                        <Pressable
                          key={option.id}
                          disabled={quizResult !== null}
                          onPress={() =>
                            setSelectedAnswers((current) => ({
                              ...current,
                              [question.id]: option.id,
                            }))
                          }
                          style={[
                            styles.option,
                            selected && styles.optionSelected,
                            correct && styles.optionCorrect,
                            wrongSelected && styles.optionWrong,
                          ]}>
                          <Ionicons
                            name={
                              correct
                                ? 'checkmark-circle'
                                : wrongSelected
                                  ? 'close-circle'
                                  : selected
                                    ? 'radio-button-on'
                                    : 'radio-button-off'
                            }
                            size={18}
                            color={
                              correct
                                ? TrainingColors.accentTeal
                                : wrongSelected
                                  ? TrainingColors.accentDanger
                                  : selected
                                    ? TrainingColors.accentBlue
                                    : TrainingColors.textMuted
                            }
                          />
                          <Text style={styles.optionText}>{option.text}</Text>
                        </Pressable>
                      );
                    })}
                    {result ? (
                      <Text style={styles.explanationText}>{result.explanation}</Text>
                    ) : null}
                  </View>
                );
              })}

              {quizResult ? (
                <View
                  style={[
                    styles.resultCard,
                    quizResult.passed ? styles.resultPassed : styles.resultFailed,
                  ]}>
                  <Ionicons
                    name={quizResult.passed ? 'trophy-outline' : 'refresh-circle-outline'}
                    size={26}
                    color={
                      quizResult.passed
                        ? TrainingColors.accentTeal
                        : TrainingColors.accentAmber
                    }
                  />
                  <View style={styles.flex}>
                    <Text style={styles.resultTitle}>
                      {quizResult.passed ? 'Test promovat' : 'Mai încearcă'}
                    </Text>
                    <Text style={styles.resultText}>
                      Scor {quizResult.score}% · {quizResult.correct_answers}/
                      {quizResult.total_questions} răspunsuri corecte
                      {quizResult.xp_awarded > 0 ? ` · +${quizResult.xp_awarded} XP` : ''}
                    </Text>
                  </View>
                </View>
              ) : null}

              <Pressable
                disabled={
                  isSubmittingQuiz ||
                  (!quizResult &&
                    Object.keys(selectedAnswers).length !== openLesson?.questions.length)
                }
                onPress={() => (quizResult ? resetQuiz() : void submitQuiz())}
                style={[
                  styles.quizButton,
                  isSubmittingQuiz && styles.buttonDisabled,
                  !quizResult &&
                    Object.keys(selectedAnswers).length !== openLesson?.questions.length &&
                    styles.buttonDisabled,
                ]}>
                {isSubmittingQuiz ? (
                  <ActivityIndicator size="small" color="#EFF6FF" />
                ) : (
                  <Ionicons
                    name={quizResult ? 'refresh' : 'checkmark-done'}
                    size={17}
                    color="#EFF6FF"
                  />
                )}
                <Text style={styles.quizButtonText}>
                  {quizResult ? 'Reia testul' : 'Trimite răspunsurile'}
                </Text>
              </Pressable>

              <View style={styles.tutorHeader}>
                <Ionicons name="sparkles" size={16} color={TrainingColors.accentTeal} />
                <Text style={styles.tutorTitle}>Întreabă tutorul AI</Text>
              </View>
              {lessonMessages.map((message) =>
                message.role === 'assistant' ? (
                  <View key={message.id} style={styles.botRow}>
                    <View style={styles.botIcon}>
                      <Ionicons name="sparkles" size={13} color={TrainingColors.accentTeal} />
                    </View>
                    <View style={styles.botBubble}>
                      <Text style={styles.botText}>{message.text}</Text>
                      {message.source ? (
                        <Text style={styles.botSourceText}>
                          {message.source === 'ollama'
                            ? `Răspuns AI${message.model ? ` · ${message.model}` : ''}${
                                message.generationMs !== null &&
                                message.generationMs !== undefined
                                  ? ` · ${message.generationMs} ms`
                                  : ''
                              }`
                            : message.safetyStatus === 'refused'
                              ? 'Protecție de siguranță'
                              : 'Ghidare offline verificată'}
                        </Text>
                      ) : null}
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
              {isAsking ? <ActivityIndicator color={TrainingColors.accentTeal} /> : null}
              {lessonError ? <Text style={styles.errorText}>{lessonError}</Text> : null}
            </ScrollView>

            <View style={styles.modalComposer}>
              <TextInput
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => void sendFollowUp()}
                placeholder="Pune o întrebare despre lecție..."
                placeholderTextColor={TrainingColors.textMuted}
                style={styles.modalInput}
              />
              <Pressable
                onPress={() => void sendFollowUp()}
                style={[styles.modalSend, (!input.trim() || isAsking) && styles.buttonDisabled]}
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

function StateCard({
  icon,
  text,
  loading,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.stateCard}>
      {loading ? (
        <ActivityIndicator color={TrainingColors.accentTeal} />
      ) : (
        <Ionicons name={icon} size={24} color={TrainingColors.accentDanger} />
      )}
      <Text style={styles.stateText}>{text}</Text>
      {actionLabel && onAction ? (
        <Pressable style={styles.retryButton} onPress={onAction}>
          <Text style={styles.retryText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 50, paddingBottom: 130, gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  headerText: { flexShrink: 1 },
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
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  heroText: { color: TrainingColors.textPrimary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  filters: { gap: 8, paddingVertical: 4 },
  filter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  filterActive: {
    backgroundColor: TrainingColors.buttonPrimary,
    borderColor: TrainingColors.buttonPrimaryBorder,
  },
  filterText: { color: TrainingColors.textSecondary, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#EEF6FF' },
  stateCard: {
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 9,
  },
  stateText: { color: TrainingColors.textSecondary, textAlign: 'center' },
  retryButton: {
    backgroundColor: TrainingColors.buttonPrimary,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  retryText: { color: '#EFF6FF', fontWeight: '700' },
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
  lessonCardLocked: { opacity: 0.55 },
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
  lessonCategory: {
    color: TrainingColors.textMuted,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  lessonMeta: { color: TrainingColors.textMuted, fontSize: 10 },
  lessonTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 2 },
  lessonSummary: { color: TrainingColors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  lessonProgress: { color: TrainingColors.accentTeal, fontSize: 10, marginTop: 5, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(7,13,24,0.78)', justifyContent: 'flex-end' },
  modalCard: {
    height: '92%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  modalCategory: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
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
  modalBody: { flex: 1, paddingHorizontal: 16 },
  modalBodyContent: { paddingVertical: 8, paddingBottom: 20, gap: 10 },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    padding: 13,
  },
  sectionTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '800' },
  sectionBody: { color: TrainingColors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 5 },
  quizHeader: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  quizEyebrow: { color: TrainingColors.accentBlue, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  quizTitle: { color: TrainingColors.textPrimary, fontSize: 15, fontWeight: '800', marginTop: 2 },
  bestScore: { color: TrainingColors.accentTeal, fontSize: 12, fontWeight: '800' },
  questionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 12,
    gap: 8,
  },
  questionText: { color: TrainingColors.textPrimary, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  optionSelected: { borderColor: TrainingColors.accentBlue },
  optionCorrect: { borderColor: TrainingColors.accentTeal, backgroundColor: TrainingColors.successBg },
  optionWrong: { borderColor: TrainingColors.accentDanger, backgroundColor: TrainingColors.failBg },
  optionText: { color: TrainingColors.textPrimary, fontSize: 12, lineHeight: 17, flex: 1 },
  explanationText: { color: TrainingColors.textSecondary, fontSize: 11, lineHeight: 16 },
  resultCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultPassed: { borderColor: TrainingColors.accentTeal, backgroundColor: TrainingColors.successBg },
  resultFailed: { borderColor: TrainingColors.accentAmber, backgroundColor: 'rgba(245,197,107,0.12)' },
  resultTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '800' },
  resultText: { color: TrainingColors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 2 },
  quizButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  quizButtonText: { color: '#EFF6FF', fontSize: 13, fontWeight: '800' },
  buttonDisabled: { opacity: 0.5 },
  tutorHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  tutorTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '800' },
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
  botSourceText: {
    color: TrainingColors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 7,
    textTransform: 'uppercase',
  },
  userRow: { alignItems: 'flex-end' },
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
  errorText: { color: TrainingColors.accentDanger, fontSize: 12 },
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
});
