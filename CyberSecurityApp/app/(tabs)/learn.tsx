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
  useWindowDimensions,
} from 'react-native';

import { AppBackdrop } from '@/components/app-backdrop';
import { useAuth } from '@/features/auth/auth-context';
import {
  askAssistant,
  getLearningLesson,
  getLearningLessons,
  submitLearningLessonQuiz,
} from '@/features/training/api';
import {
  buildUserStorageKey,
  LEARN_SCREEN_STORAGE_KEY,
} from '@/features/training/local-cache';
import type {
  AssistantAskApiResponse,
  LearningLessonDetailApiResponse,
  LearningLessonCategoryApiResponse,
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

type LessonStage = 'content' | 'quiz' | 'result';

const LEARN_STATE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const LEARN_MESSAGES_MAX_ITEMS = 40;
const LEVEL_LABELS: Record<LearningLessonLevel, string> = {
  beginner: 'Începător',
  intermediate: 'Intermediar',
  advanced: 'Foarte avansat',
};
const LEVEL_ICONS: Record<LearningLessonLevel, keyof typeof Ionicons.glyphMap> = {
  beginner: 'leaf-outline',
  intermediate: 'shield-outline',
  advanced: 'ribbon-outline',
};
const STATUS_LABELS: Record<LearningLessonSummaryApiResponse['status'], string> = {
  locked: 'Blocat',
  available: 'Disponibil',
  in_progress: 'În lucru',
  completed: 'Finalizat',
};
const GOAL_LABELS: Record<string, string> = {
  personal_safety: 'siguranță personală',
  workplace: 'protecție la muncă',
  general_knowledge: 'cultură generală',
};

type CatalogMeta = {
  userLevel: LearningLessonLevel;
  learningGoal: string | null;
  recommendedLessonIds: string[];
  categories: LearningLessonCategoryApiResponse[];
};

export default function LearnScreen() {
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ lessonId?: string }>();
  const { refreshLearningPath } = useTrainingSession();
  const [lessons, setLessons] = useState<LearningLessonSummaryApiResponse[]>([]);
  const [activeCat, setActiveCat] = useState('Recomandate');
  const [catalogMeta, setCatalogMeta] = useState<CatalogMeta>({
    userLevel: 'beginner',
    learningGoal: null,
    recommendedLessonIds: [],
    categories: [],
  });
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
  const [lessonStage, setLessonStage] = useState<LessonStage>('content');
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [pendingOpenLessonId, setPendingOpenLessonId] = useState<string | null>(null);
  const currentUserId = user?.id ?? null;
  const isWide = width >= 760;
  const activeUserIdRef = useRef<string | null>(currentUserId);
  activeUserIdRef.current = currentUserId;

  const storageKey = useMemo(
    () => buildUserStorageKey(LEARN_SCREEN_STORAGE_KEY, user?.id),
    [user?.id]
  );
  const recommendedLessons = useMemo(
    () => lessons.filter((lesson) => lesson.recommended),
    [lessons]
  );
  const categories = useMemo(() => {
    const categoryNames =
      catalogMeta.categories.length > 0
        ? catalogMeta.categories.map((category) => category.name)
        : Array.from(new Set(lessons.map((lesson) => lesson.category)));
    return [
      ...(recommendedLessons.length > 0 ? ['Recomandate'] : []),
      'Toate',
      ...categoryNames,
    ];
  }, [catalogMeta.categories, lessons, recommendedLessons.length]);
  const filtered = useMemo(
    () => {
      if (activeCat === 'Recomandate') {
        return recommendedLessons.length > 0 ? recommendedLessons : lessons;
      }
      return activeCat === 'Toate'
        ? lessons
        : lessons.filter((lesson) => lesson.category === activeCat);
    },
    [activeCat, lessons, recommendedLessons]
  );
  const groupedFiltered = useMemo(
    () =>
      (['beginner', 'intermediate', 'advanced'] as LearningLessonLevel[])
        .map((level) => ({
          level,
          items: filtered.filter((lesson) => lesson.level === level),
        }))
        .filter((group) => group.items.length > 0),
    [filtered]
  );
  const lessonStats = useMemo(() => {
    const completed = lessons.filter((lesson) => lesson.status === 'completed').length;
    const inProgress = lessons.filter((lesson) => lesson.status === 'in_progress').length;
    const available = lessons.filter((lesson) => lesson.status !== 'locked').length;
    const xpAvailable = lessons.reduce((total, lesson) => total + lesson.xp_reward, 0);
    const progress = lessons.length > 0 ? Math.round((completed / lessons.length) * 100) : 0;
    return { completed, inProgress, available, xpAvailable, progress };
  }, [lessons]);
  const quizAnsweredCount = openLesson
    ? openLesson.questions.filter((question) => selectedAnswers[question.id]).length
    : 0;
  const quizQuestionCount = openLesson?.questions.length ?? 0;
  const canSubmitQuiz =
    Boolean(openLesson) &&
    !isSubmittingQuiz &&
    quizQuestionCount > 0 &&
    quizAnsweredCount === quizQuestionCount;

  useEffect(() => {
    if (lessons.length > 0 && !categories.includes(activeCat)) {
      setActiveCat(recommendedLessons.length > 0 ? 'Recomandate' : 'Toate');
    }
  }, [activeCat, categories, lessons.length, recommendedLessons.length]);

  const loadLessons = useCallback(async () => {
    const requestUserId = user?.id ?? null;
    if (!requestUserId) return;
    setIsLoadingLessons(true);
    setCatalogError(null);
    try {
      const response = await getLearningLessons();
      if (activeUserIdRef.current === requestUserId) {
        setLessons(response.items);
        setCatalogMeta({
          userLevel: response.user_level,
          learningGoal: response.learning_goal,
          recommendedLessonIds: response.recommended_lesson_ids,
          categories: response.categories,
        });
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
    setActiveCat('Recomandate');
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
        setLessonStage('content');
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
    setLessonStage('content');
    setIsAsking(false);
    setIsSubmittingQuiz(false);
  };

  const clearLocalCache = async () => {
    await AsyncStorage.removeItem(storageKey);
    closeLessonModal();
    setActiveCat(recommendedLessons.length > 0 ? 'Recomandate' : 'Toate');
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
      setLessonStage('result');
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
    setLessonStage('quiz');
  };

  return (
    <View style={styles.screen}>
      <AppBackdrop grid />
      <ScrollView contentContainerStyle={[styles.content, isWide && styles.contentWide]}>
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
            <Text style={styles.heroEyebrow}>TRASEU PERSONALIZAT</Text>
            <Text style={styles.heroText}>
              După onboarding, lecțiile sunt prioritizate pentru nivelul {LEVEL_LABELS[catalogMeta.userLevel].toLowerCase()}
              {catalogMeta.learningGoal
                ? ` și obiectivul de ${GOAL_LABELS[catalogMeta.learningGoal] ?? 'învățare'}`
                : ''}
              .
            </Text>
            <View style={styles.heroMetaRow}>
              <View style={styles.heroMetaPill}>
                <Ionicons
                  name={LEVEL_ICONS[catalogMeta.userLevel]}
                  size={12}
                  color={TrainingColors.accentTeal}
                />
                <Text style={styles.heroMetaText}>{LEVEL_LABELS[catalogMeta.userLevel]}</Text>
              </View>
              <View style={styles.heroMetaPill}>
                <Ionicons name="compass-outline" size={12} color={TrainingColors.accentBlue} />
                <Text style={styles.heroMetaText}>
                  {recommendedLessons.length} recomandări
                </Text>
              </View>
            </View>
          </View>
        </View>

        {lessons.length > 0 ? (
          <View style={styles.progressPanel}>
            <View style={styles.progressHeader}>
              <View>
                <Text style={styles.progressEyebrow}>PROGRES CURRICULUM</Text>
                <Text style={styles.progressTitle}>{lessonStats.progress}% finalizat</Text>
              </View>
              <View style={styles.progressBadge}>
                <Ionicons name="flash-outline" size={14} color={TrainingColors.accentAmber} />
                <Text style={styles.progressBadgeText}>{lessonStats.xpAvailable} XP</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${lessonStats.progress}%` }]} />
            </View>
            <View style={styles.metricsGrid}>
              <LearnMetric
                icon="checkmark-done-outline"
                label="Finalizate"
                value={`${lessonStats.completed}/${lessons.length}`}
              />
              <LearnMetric
                icon="time-outline"
                label="În lucru"
                value={`${lessonStats.inProgress}`}
              />
              <LearnMetric
                icon="lock-open-outline"
                label="Accesibile"
                value={`${lessonStats.available}`}
              />
            </View>
          </View>
        ) : null}

        {catalogMeta.categories.length > 0 ? (
          <View style={styles.categoryProgressSection}>
            <View style={styles.sectionHeadingRow}>
              <View>
                <Text style={styles.sectionEyebrow}>PROGRES PE CATEGORII</Text>
                <Text style={styles.catalogSectionTitle}>Unde mai ai de lucrat</Text>
              </View>
              <Text style={styles.sectionMeta}>{catalogMeta.categories.length} zone</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryProgressRail}>
              {catalogMeta.categories.map((category) => {
                const canOpenNext =
                  Boolean(category.next_lesson_id) &&
                  category.next_action_label !== 'Blocat momentan';
                return (
                  <Pressable
                    key={category.name}
                    disabled={!canOpenNext || openingLessonId !== null}
                    onPress={() => {
                      if (category.next_lesson_id) {
                        void openLessonById(category.next_lesson_id);
                      }
                    }}
                    style={[
                      styles.categoryProgressCard,
                      category.progress_percent === 100 && styles.categoryProgressCardDone,
                      !canOpenNext && styles.categoryProgressCardDisabled,
                    ]}>
                    <View style={styles.categoryProgressTop}>
                      <Text style={styles.categoryProgressName}>{category.name}</Text>
                      <Text style={styles.categoryProgressPercent}>{category.progress_percent}%</Text>
                    </View>
                    <View style={styles.categoryProgressTrack}>
                      <View
                        style={[
                          styles.categoryProgressFill,
                          { width: `${Math.min(100, category.progress_percent)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.categoryProgressMeta}>
                      {category.completed}/{category.total} finalizate · {category.available} accesibile
                    </Text>
                    {category.locked > 0 ? (
                      <Text style={styles.categoryProgressLocked}>
                        {category.locked} blocate până avansezi pe traseu
                      </Text>
                    ) : null}
                    <View style={styles.categoryNextRow}>
                      <Ionicons
                        name={
                          category.progress_percent === 100
                            ? 'checkmark-circle-outline'
                            : canOpenNext
                              ? 'arrow-forward-circle-outline'
                              : 'lock-closed-outline'
                        }
                        size={15}
                        color={
                          category.progress_percent === 100
                            ? TrainingColors.accentTeal
                            : canOpenNext
                              ? TrainingColors.accentBlue
                              : TrainingColors.textMuted
                        }
                      />
                      <Text style={styles.categoryNextText} numberOfLines={2}>
                        {category.progress_percent === 100
                          ? 'Categorie finalizată'
                          : category.next_lesson_title
                            ? `${category.next_action_label}: ${category.next_lesson_title}`
                            : 'Continuă traseul pentru deblocare'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {recommendedLessons.length > 0 ? (
          <View style={styles.recommendedSection}>
            <View style={styles.sectionHeadingRow}>
              <View>
                <Text style={styles.sectionEyebrow}>URMĂTORUL PAS</Text>
                <Text style={styles.catalogSectionTitle}>Recomandate pentru tine</Text>
              </View>
              <Text style={styles.sectionMeta}>
                {catalogMeta.recommendedLessonIds.length} lecții
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recommendedRail}>
              {recommendedLessons.map((lesson, index) => (
                <Pressable
                  key={lesson.id}
                  onPress={() => void openLessonById(lesson.id)}
                  style={styles.recommendedCard}>
                  <View style={styles.recommendedTopRow}>
                    <View style={styles.recommendedRank}>
                      <Text style={styles.recommendedRankText}>{index + 1}</Text>
                    </View>
                    <View style={styles.recommendedLevelPill}>
                      <Text style={styles.recommendedLevelText}>
                        {LEVEL_LABELS[lesson.level]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.recommendedTitle}>{lesson.title}</Text>
                  <Text style={styles.recommendedReason}>
                    {lesson.recommendation_reason ?? lesson.summary}
                  </Text>
                  <View style={styles.recommendedFooter}>
                    <Text style={styles.recommendedFooterText}>Prag {lesson.pass_score}%</Text>
                    <Text style={styles.recommendedFooterText}>{lesson.duration_minutes} min</Text>
                    <Ionicons name="arrow-forward" size={14} color={TrainingColors.accentTeal} />
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {lessons.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {categories.map((category) => {
              const active = category === activeCat;
              const categoryMeta = catalogMeta.categories.find((item) => item.name === category);
              return (
                <Pressable
                  key={category}
                  onPress={() => setActiveCat(category)}
                  style={[styles.filter, active && styles.filterActive]}>
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {category}
                  </Text>
                  {categoryMeta ? (
                    <Text style={[styles.filterCount, active && styles.filterTextActive]}>
                      {categoryMeta.completed}/{categoryMeta.total}
                    </Text>
                  ) : category === 'Recomandate' ? (
                    <Text style={[styles.filterCount, active && styles.filterTextActive]}>
                      {recommendedLessons.length}
                    </Text>
                  ) : null}
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

        <View style={styles.sectionHeadingRow}>
          <View>
            <Text style={styles.sectionEyebrow}>BIBLIOTECĂ</Text>
            <Text style={styles.catalogSectionTitle}>
              {activeCat === 'Recomandate' ? 'Lecții prioritare' : activeCat}
            </Text>
          </View>
          <Text style={styles.sectionMeta}>{filtered.length} lecții</Text>
        </View>

        <View style={styles.lessonGroups}>
          {groupedFiltered.map((group) => (
            <View key={group.level} style={styles.lessonGroup}>
              <View style={styles.levelGroupHeader}>
                <View style={styles.levelGroupIcon}>
                  <Ionicons
                    name={LEVEL_ICONS[group.level]}
                    size={15}
                    color={TrainingColors.accentTeal}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.levelGroupTitle}>{LEVEL_LABELS[group.level]}</Text>
                  <Text style={styles.levelGroupMeta}>
                    {group.level === 'beginner'
                      ? 'Bazele și deciziile ghidate'
                      : group.level === 'intermediate'
                        ? 'Semnale mai subtile și contexte realiste'
                        : 'Cazuri complexe, presiune și pretexte avansate'}
                  </Text>
                </View>
                <Text style={styles.sectionMeta}>{group.items.length}</Text>
              </View>
              <View style={[styles.lessonList, isWide && styles.lessonListWide]}>
                {group.items.map((lesson) => (
                  <LessonCard
                    key={lesson.id}
                    lesson={lesson}
                    compact={isWide}
                    opening={openingLessonId === lesson.id}
                    disabled={openingLessonId !== null}
                    onPress={() => void openLessonById(lesson.id)}
                  />
                ))}
              </View>
            </View>
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

            {openLesson ? (
              <View style={styles.modalStats}>
                <View style={styles.modalStat}>
                  <Ionicons name="reader-outline" size={15} color={TrainingColors.accentBlue} />
                  <Text style={styles.modalStatText}>{openLesson.sections.length} secțiuni</Text>
                </View>
                <View style={styles.modalStat}>
                  <Ionicons name="timer-outline" size={15} color={TrainingColors.accentBlue} />
                  <Text style={styles.modalStatText}>{openLesson.duration_minutes} min</Text>
                </View>
                <View style={styles.modalStat}>
                  <Ionicons name="checkmark-circle-outline" size={15} color={TrainingColors.accentBlue} />
                  <Text style={styles.modalStatText}>Prag {openLesson.pass_score}%</Text>
                </View>
              </View>
            ) : null}

            {openLesson ? (
              <View style={styles.lessonStageBar}>
                {[
                  { key: 'content' as const, label: 'Conținut', icon: 'reader-outline' as const },
                  { key: 'quiz' as const, label: 'Quiz', icon: 'help-circle-outline' as const },
                  { key: 'result' as const, label: 'Rezultat', icon: 'trophy-outline' as const },
                ].map((stage) => {
                  const active = lessonStage === stage.key;
                  const disabled = stage.key === 'result' && !quizResult;
                  return (
                    <Pressable
                      key={stage.key}
                      disabled={disabled}
                      onPress={() => setLessonStage(stage.key)}
                      style={[
                        styles.lessonStageButton,
                        active && styles.lessonStageButtonActive,
                        disabled && styles.lessonStageButtonDisabled,
                      ]}>
                      <Ionicons
                        name={stage.icon}
                        size={14}
                        color={active ? '#EFF6FF' : TrainingColors.textMuted}
                      />
                      <Text
                        style={[
                          styles.lessonStageText,
                          active && styles.lessonStageTextActive,
                        ]}>
                        {stage.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
              {openLesson && lessonStage === 'content' ? (
                <>
                  <View style={styles.lessonIntroCard}>
                    <View style={styles.lessonIntroTop}>
                      <View style={styles.lessonIntroIcon}>
                        <Ionicons name="school-outline" size={18} color={TrainingColors.accentTeal} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.lessonIntroEyebrow}>OBIECTIVUL LECȚIEI</Text>
                        <Text style={styles.lessonIntroText}>{openLesson.summary}</Text>
                      </View>
                    </View>
                    <View style={styles.lessonIntroMeta}>
                      <Text style={styles.lessonIntroMetaText}>
                        {openLesson.sections.length} secțiuni
                      </Text>
                      <Text style={styles.lessonIntroMetaText}>
                        Prag {openLesson.pass_score}%
                      </Text>
                      <Text style={styles.lessonIntroMetaText}>{openLesson.xp_reward} XP</Text>
                    </View>
                  </View>

                  {openLesson.sections.map((section) => (
                    <View key={section.id} style={styles.sectionCard}>
                      <View style={styles.sectionHeader}>
                        <View style={styles.sectionNumber}>
                          <Text style={styles.sectionNumberText}>{section.order_index}</Text>
                        </View>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                      </View>
                      <LessonBody body={section.body} />
                    </View>
                  ))}

                  <Pressable
                    onPress={() => setLessonStage('quiz')}
                    style={styles.startQuizButton}>
                    <Text style={styles.startQuizButtonText}>Începe quiz-ul</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
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
                </>
              ) : null}

              {openLesson && lessonStage === 'quiz' ? (
                <>
                  <View style={styles.quizHeader}>
                    <View>
                      <Text style={styles.quizEyebrow}>TESTUL LECȚIEI</Text>
                      <Text style={styles.quizTitle}>Prag de promovare: {openLesson.pass_score}%</Text>
                    </View>
                    {openLesson.best_score !== null && openLesson.best_score !== undefined ? (
                      <Text style={styles.bestScore}>Max {openLesson.best_score}%</Text>
                    ) : null}
                  </View>

                  <View style={styles.quizProgressCard}>
                    <View style={styles.quizProgressTop}>
                      <Text style={styles.quizProgressText}>
                        {quizAnsweredCount}/{quizQuestionCount} răspunsuri selectate
                      </Text>
                      <Text style={styles.quizProgressText}>{openLesson.xp_reward} XP</Text>
                    </View>
                    <View style={styles.quizProgressTrack}>
                      <View
                        style={[
                          styles.quizProgressFill,
                          {
                            width: `${
                              quizQuestionCount > 0
                                ? Math.round((quizAnsweredCount / quizQuestionCount) * 100)
                                : 0
                            }%`,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {openLesson.questions.map((question, questionIndex) => (
                    <QuizQuestionCard
                      key={question.id}
                      question={question}
                      questionIndex={questionIndex}
                      selectedOptionId={selectedAnswers[question.id]}
                      result={null}
                      disabled={false}
                      onSelect={(optionId) =>
                        setSelectedAnswers((current) => ({
                          ...current,
                          [question.id]: optionId,
                        }))
                      }
                    />
                  ))}

                  {lessonError ? <Text style={styles.errorText}>{lessonError}</Text> : null}

                  <Pressable
                    disabled={!canSubmitQuiz}
                    onPress={() => void submitQuiz()}
                    style={[
                      styles.quizButton,
                      !canSubmitQuiz && styles.buttonDisabled,
                    ]}>
                    {isSubmittingQuiz ? (
                      <ActivityIndicator size="small" color="#EFF6FF" />
                    ) : (
                      <Ionicons name="checkmark-done" size={17} color="#EFF6FF" />
                    )}
                    <Text style={styles.quizButtonText}>Trimite răspunsurile</Text>
                  </Pressable>
                </>
              ) : null}

              {openLesson && lessonStage === 'result' && quizResult ? (
                <>
                  <View
                    style={[
                      styles.resultHero,
                      quizResult.passed ? styles.resultHeroPassed : styles.resultHeroFailed,
                    ]}>
                    <View style={styles.resultScoreCircle}>
                      <Text style={styles.resultScoreText}>{quizResult.score}%</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.resultHeroTitle}>
                        {quizResult.passed ? 'Lecție promovată' : 'Mai ai puțin de repetat'}
                      </Text>
                      <Text style={styles.resultHeroText}>
                        Ai răspuns corect la {quizResult.correct_answers}/
                        {quizResult.total_questions}. Pragul este {quizResult.pass_score}%.
                      </Text>
                      <View style={styles.resultMetaRow}>
                        <Text style={styles.resultMetaPill}>
                          {quizResult.xp_awarded > 0 ? `+${quizResult.xp_awarded} XP` : 'XP deja acordat'}
                        </Text>
                        <Text style={styles.resultMetaPill}>
                          {quizResult.lesson_completed ? 'Progres actualizat' : 'În lucru'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.resultActions}>
                    <Pressable
                      onPress={() => router.push('/learning-path')}
                      style={styles.resultPrimaryAction}>
                      <Ionicons name="map-outline" size={15} color="#FFFFFF" />
                      <Text style={styles.resultPrimaryActionText}>Continuă traseul</Text>
                    </Pressable>
                    <Pressable onPress={resetQuiz} style={styles.resultSecondaryAction}>
                      <Ionicons name="refresh" size={15} color={TrainingColors.accentTeal} />
                      <Text style={styles.resultSecondaryActionText}>Reia quiz-ul</Text>
                    </Pressable>
                  </View>

                  <View style={styles.quizHeader}>
                    <View>
                      <Text style={styles.quizEyebrow}>FEEDBACK</Text>
                      <Text style={styles.quizTitle}>Răspunsurile tale</Text>
                    </View>
                  </View>

                  {openLesson.questions.map((question, questionIndex) => {
                const result = quizResult?.answers.find(
                  (answer) => answer.question_id === question.id
                );
                return (
                  <QuizQuestionCard
                    key={question.id}
                    question={question}
                    questionIndex={questionIndex}
                    selectedOptionId={selectedAnswers[question.id]}
                    result={result ?? null}
                    disabled
                    onSelect={() => undefined}
                  />
                );
              })}
                </>
              ) : null}

              {lessonError ? <Text style={styles.errorText}>{lessonError}</Text> : null}
            </ScrollView>

            <View style={[styles.modalComposer, lessonStage !== 'content' && styles.modalComposerHidden]}>
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

function LessonCard({
  lesson,
  compact,
  opening,
  disabled,
  onPress,
}: {
  lesson: LearningLessonSummaryApiResponse;
  compact: boolean;
  opening: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.lessonCard,
        compact && styles.lessonCardWide,
        lesson.recommended && styles.lessonCardRecommended,
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
          {lesson.recommended ? (
            <View style={styles.recommendedBadge}>
              <Ionicons name="sparkles" size={10} color={TrainingColors.accentTeal} />
              <Text style={styles.recommendedBadgeText}>Recomandată</Text>
            </View>
          ) : null}
          <View style={styles.lessonCategoryPill}>
            <Text style={styles.lessonCategory}>{lesson.category}</Text>
          </View>
          <View
            style={[
              styles.lessonStatusPill,
              lesson.status === 'completed' && styles.lessonStatusCompleted,
              lesson.status === 'locked' && styles.lessonStatusLocked,
            ]}>
            <Text style={styles.lessonStatusText}>{STATUS_LABELS[lesson.status]}</Text>
          </View>
        </View>
        <Text style={styles.lessonTitle}>{lesson.title}</Text>
        <Text style={styles.lessonSummary}>{lesson.summary}</Text>
        {lesson.recommended && lesson.recommendation_reason ? (
          <Text style={styles.lessonReason}>{lesson.recommendation_reason}</Text>
        ) : null}
        <View style={styles.lessonMetaRow}>
          <View style={styles.lessonMetaPill}>
            <Ionicons
              name={LEVEL_ICONS[lesson.level]}
              size={12}
              color={TrainingColors.textMuted}
            />
            <Text style={styles.lessonMetaPillText}>{LEVEL_LABELS[lesson.level]}</Text>
          </View>
          <View style={styles.lessonMetaPill}>
            <Ionicons name="timer-outline" size={12} color={TrainingColors.textMuted} />
            <Text style={styles.lessonMetaPillText}>{lesson.duration_minutes} min</Text>
          </View>
          <View style={styles.lessonMetaPill}>
            <Ionicons name="star-outline" size={12} color={TrainingColors.textMuted} />
            <Text style={styles.lessonMetaPillText}>{lesson.xp_reward} XP</Text>
          </View>
        </View>
        <Text style={styles.lessonProgress}>
          {lesson.passed
            ? `Promovat · scor maxim ${lesson.best_score}%`
            : lesson.attempts > 0
              ? `${lesson.attempts} încercări · scor maxim ${lesson.best_score}%`
              : `Test: prag ${lesson.pass_score}% · ${lesson.xp_reward} XP`}
        </Text>
      </View>
      {opening ? (
        <ActivityIndicator size="small" color={TrainingColors.accentTeal} />
      ) : (
        <Ionicons name="chevron-forward" size={16} color={TrainingColors.textMuted} />
      )}
    </Pressable>
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

function LearnMetric({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metricTile}>
      <Ionicons name={icon} size={15} color={TrainingColors.accentTeal} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function QuizQuestionCard({
  question,
  questionIndex,
  selectedOptionId,
  result,
  disabled,
  onSelect,
}: {
  question: LearningLessonDetailApiResponse['questions'][number];
  questionIndex: number;
  selectedOptionId?: string;
  result: LearningQuizSubmitApiResponse['answers'][number] | null;
  disabled: boolean;
  onSelect: (optionId: string) => void;
}) {
  return (
    <View style={styles.questionCard}>
      <View style={styles.questionTopRow}>
        <View style={styles.questionNumber}>
          <Text style={styles.questionNumberText}>{questionIndex + 1}</Text>
        </View>
        <Text style={styles.questionText}>{question.prompt}</Text>
      </View>
      {question.options.map((option) => {
        const selected = selectedOptionId === option.id;
        const correct = result?.correct_option_id === option.id;
        const wrongSelected = Boolean(result && selected && !result.is_correct);
        return (
          <Pressable
            key={option.id}
            disabled={disabled}
            onPress={() => onSelect(option.id)}
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
      {result ? <Text style={styles.explanationText}>{result.explanation}</Text> : null}
    </View>
  );
}

function LessonBody({ body }: { body: string }) {
  const blocks = body
    .split('\n')
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <View style={styles.lessonBody}>
      {blocks.map((block, index) => {
        if (block.startsWith('- ')) {
          return (
            <View key={`${block}-${index}`} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{block.slice(2)}</Text>
            </View>
          );
        }
        return (
          <Text key={`${block}-${index}`} style={styles.sectionBody}>
            {block}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 50, paddingBottom: 130, gap: 12 },
  contentWide: { width: '100%', maxWidth: 1040, alignSelf: 'center' },
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
  heroMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  heroMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.borderSubtle,
    backgroundColor: 'rgba(17,31,51,0.62)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  heroMetaText: { color: TrainingColors.textSecondary, fontSize: 11, fontWeight: '800' },
  progressPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelElevated,
    padding: 14,
    gap: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  progressEyebrow: {
    color: TrainingColors.textMuted,
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '800',
  },
  progressTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  progressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(246,199,110,0.36)',
    backgroundColor: 'rgba(246,199,110,0.11)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  progressBadgeText: { color: TrainingColors.accentAmber, fontSize: 12, fontWeight: '800' },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: TrainingColors.panelAlt,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: TrainingColors.accentTeal,
  },
  metricsGrid: { flexDirection: 'row', gap: 8 },
  metricTile: {
    flex: 1,
    minHeight: 70,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.borderSubtle,
    backgroundColor: 'rgba(5,10,19,0.3)',
    padding: 10,
    justifyContent: 'center',
  },
  metricValue: { color: TrainingColors.textPrimary, fontSize: 17, fontWeight: '900', marginTop: 5 },
  metricLabel: { color: TrainingColors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2 },
  categoryProgressSection: { gap: 9 },
  categoryProgressRail: { gap: 10, paddingRight: 4 },
  categoryProgressCard: {
    width: 246,
    minHeight: 164,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 13,
    gap: 9,
  },
  categoryProgressCardDone: {
    borderColor: 'rgba(77,228,178,0.34)',
    backgroundColor: 'rgba(69,224,177,0.07)',
  },
  categoryProgressCardDisabled: { opacity: 0.72 },
  categoryProgressTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  categoryProgressName: {
    flex: 1,
    color: TrainingColors.textPrimary,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  categoryProgressPercent: {
    color: TrainingColors.accentTeal,
    fontSize: 16,
    fontWeight: '900',
  },
  categoryProgressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: TrainingColors.panelAlt,
    overflow: 'hidden',
  },
  categoryProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: TrainingColors.accentTeal,
  },
  categoryProgressMeta: {
    color: TrainingColors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  categoryProgressLocked: {
    color: TrainingColors.accentAmber,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  categoryNextRow: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryNextText: {
    flex: 1,
    color: TrainingColors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  recommendedSection: { gap: 9 },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
  },
  sectionEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  catalogSectionTitle: {
    color: TrainingColors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  sectionMeta: { color: TrainingColors.textMuted, fontSize: 11, fontWeight: '800' },
  recommendedRail: { gap: 10, paddingRight: 4 },
  recommendedCard: {
    width: 274,
    minHeight: 172,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(77,228,178,0.32)',
    backgroundColor: TrainingColors.panelElevated,
    padding: 14,
    justifyContent: 'space-between',
    gap: 10,
  },
  recommendedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  recommendedRank: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: TrainingColors.successBg,
    borderWidth: 1,
    borderColor: 'rgba(77,228,178,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendedRankText: { color: TrainingColors.accentTeal, fontSize: 13, fontWeight: '900' },
  recommendedLevelPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.borderSubtle,
    backgroundColor: 'rgba(5,10,19,0.28)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  recommendedLevelText: { color: TrainingColors.textSecondary, fontSize: 10, fontWeight: '800' },
  recommendedTitle: { color: TrainingColors.textPrimary, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  recommendedReason: { color: TrainingColors.textSecondary, fontSize: 12, lineHeight: 17 },
  recommendedFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  recommendedFooterText: { color: TrainingColors.textMuted, fontSize: 10, fontWeight: '800' },
  filters: { gap: 8, paddingVertical: 4 },
  filter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  filterActive: {
    backgroundColor: TrainingColors.buttonPrimary,
    borderColor: TrainingColors.buttonPrimaryBorder,
  },
  filterText: { color: TrainingColors.textSecondary, fontSize: 12, fontWeight: '700' },
  filterCount: { color: TrainingColors.textMuted, fontSize: 10, fontWeight: '900' },
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
  lessonGroups: { gap: 16 },
  lessonGroup: { gap: 9 },
  levelGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 2,
  },
  levelGroupIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelGroupTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '900' },
  levelGroupMeta: { color: TrainingColors.textMuted, fontSize: 10, marginTop: 1 },
  lessonList: { gap: 10 },
  lessonListWide: { flexDirection: 'row', flexWrap: 'wrap' },
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
  lessonCardWide: { width: '48.5%' },
  lessonCardRecommended: { borderColor: 'rgba(77,228,178,0.34)' },
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
  recommendedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: TrainingColors.successBg,
    borderWidth: 1,
    borderColor: 'rgba(77,228,178,0.35)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recommendedBadgeText: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    fontWeight: '900',
  },
  lessonCategoryPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(104,169,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(104,169,255,0.24)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lessonCategory: {
    color: TrainingColors.accentBlue,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    fontWeight: '800',
  },
  lessonStatusPill: {
    borderRadius: 999,
    backgroundColor: TrainingColors.panelAlt,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lessonStatusCompleted: {
    backgroundColor: TrainingColors.successBg,
    borderColor: 'rgba(77,228,178,0.35)',
  },
  lessonStatusLocked: {
    backgroundColor: 'rgba(116,142,171,0.08)',
    borderColor: TrainingColors.borderSubtle,
  },
  lessonStatusText: { color: TrainingColors.textSecondary, fontSize: 9, fontWeight: '800' },
  lessonTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 2 },
  lessonSummary: { color: TrainingColors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  lessonReason: {
    color: TrainingColors.accentTeal,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
    fontWeight: '700',
  },
  lessonMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  lessonMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(17,31,51,0.72)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  lessonMetaPillText: { color: TrainingColors.textMuted, fontSize: 10, fontWeight: '700' },
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
  modalStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  modalStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modalStatText: { color: TrainingColors.textSecondary, fontSize: 11, fontWeight: '700' },
  lessonStageBar: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  lessonStageButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  lessonStageButtonActive: {
    borderColor: TrainingColors.buttonPrimaryBorder,
    backgroundColor: TrainingColors.buttonPrimary,
  },
  lessonStageButtonDisabled: { opacity: 0.42 },
  lessonStageText: { color: TrainingColors.textSecondary, fontSize: 11, fontWeight: '900' },
  lessonStageTextActive: { color: '#EFF6FF' },
  modalBody: { flex: 1, paddingHorizontal: 16 },
  modalBodyContent: { paddingVertical: 8, paddingBottom: 20, gap: 10 },
  lessonIntroCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(77,228,178,0.28)',
    backgroundColor: 'rgba(16,39,47,0.74)',
    padding: 14,
    gap: 12,
  },
  lessonIntroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  lessonIntroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77,228,178,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(77,228,178,0.24)',
  },
  lessonIntroEyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    letterSpacing: 1.1,
    fontWeight: '900',
  },
  lessonIntroText: {
    color: TrainingColors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  lessonIntroMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  lessonIntroMetaText: {
    color: TrainingColors.textSecondary,
    fontSize: 10,
    fontWeight: '800',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.borderSubtle,
    backgroundColor: 'rgba(5,10,19,0.24)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    padding: 14,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 },
  sectionNumber: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: TrainingColors.buttonSecondary,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionNumberText: { color: TrainingColors.accentTeal, fontSize: 12, fontWeight: '900' },
  sectionTitle: { color: TrainingColors.textPrimary, fontSize: 15, fontWeight: '900', flex: 1 },
  lessonBody: { gap: 8 },
  sectionBody: { color: TrainingColors.textSecondary, fontSize: 13, lineHeight: 20 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TrainingColors.accentTeal,
    marginTop: 7,
  },
  bulletText: { color: TrainingColors.textSecondary, fontSize: 13, lineHeight: 20, flex: 1 },
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
  quizProgressCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
    padding: 12,
    gap: 9,
  },
  quizProgressTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  quizProgressText: { color: TrainingColors.textSecondary, fontSize: 11, fontWeight: '800' },
  quizProgressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(116,142,171,0.16)',
    overflow: 'hidden',
  },
  quizProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: TrainingColors.accentBlue,
  },
  questionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
    padding: 12,
    gap: 8,
  },
  questionTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  questionNumber: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panelAlt,
  },
  questionNumberText: { color: TrainingColors.accentBlue, fontSize: 12, fontWeight: '900' },
  questionText: { color: TrainingColors.textPrimary, fontSize: 13, lineHeight: 18, fontWeight: '700', flex: 1 },
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
  startQuizButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  startQuizButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  resultHero: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultHeroPassed: {
    borderColor: 'rgba(77,228,178,0.34)',
    backgroundColor: TrainingColors.successBg,
  },
  resultHeroFailed: {
    borderColor: 'rgba(246,199,110,0.36)',
    backgroundColor: 'rgba(246,199,110,0.11)',
  },
  resultScoreCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: TrainingColors.accentTeal,
    backgroundColor: 'rgba(5,10,19,0.22)',
  },
  resultScoreText: { color: TrainingColors.textPrimary, fontSize: 20, fontWeight: '900' },
  resultHeroTitle: { color: TrainingColors.textPrimary, fontSize: 17, fontWeight: '900' },
  resultHeroText: { color: TrainingColors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  resultMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  resultMetaPill: {
    color: TrainingColors.textSecondary,
    fontSize: 10,
    fontWeight: '900',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TrainingColors.borderSubtle,
    backgroundColor: 'rgba(5,10,19,0.22)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  resultActions: { flexDirection: 'row', gap: 8 },
  resultPrimaryAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  resultPrimaryActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  resultSecondaryAction: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: TrainingColors.panelAlt,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  resultSecondaryActionText: { color: TrainingColors.accentTeal, fontSize: 12, fontWeight: '900' },
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
  modalComposerHidden: { display: 'none' },
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
