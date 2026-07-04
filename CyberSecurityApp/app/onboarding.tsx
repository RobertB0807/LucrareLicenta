import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { AppBackdrop } from '@/components/app-backdrop';
import {
  apiGetOnboarding,
  type LearningGoal,
  type OnboardingExperience,
  type OnboardingQuestion,
} from '@/features/auth/auth-api';
import { useAuth } from '@/features/auth/auth-context';
import { TrainingColors } from '@/features/training/ui-theme';

const EXPERIENCE_OPTIONS: {
  id: OnboardingExperience;
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'beginner',
    title: 'Începător',
    detail: 'Sunt nou în domeniu sau vreau să pornesc de la bază.',
    icon: 'leaf-outline',
  },
  {
    id: 'intermediate',
    title: 'Intermediar',
    detail: 'Cunosc câteva noțiuni și vreau să exersez aplicat.',
    icon: 'shield-outline',
  },
  {
    id: 'advanced',
    title: 'Foarte avansat',
    detail: 'Am experiență și vreau situații complexe.',
    icon: 'ribbon-outline',
  },
];

const GOAL_OPTIONS: {
  id: LearningGoal;
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    id: 'personal_safety',
    title: 'Siguranță personală',
    detail: 'Protejez conturile, plățile și datele personale.',
    icon: 'person-outline',
  },
  {
    id: 'workplace',
    title: 'Protecție la serviciu',
    detail: 'Recunosc fraudele și impersonarea profesională.',
    icon: 'briefcase-outline',
  },
  {
    id: 'general_knowledge',
    title: 'Cunoștințe generale',
    detail: 'Îmi dezvolt o bază completă de securitate.',
    icon: 'school-outline',
  },
];

export default function OnboardingScreen() {
  const { token, user, completeOnboarding } = useAuth();
  const { width } = useWindowDimensions();
  const isCompact = width < 370;
  const [questions, setQuestions] = useState<OnboardingQuestion[]>([]);
  const [experience, setExperience] = useState<OnboardingExperience | null>(null);
  const [learningGoal, setLearningGoal] = useState<LearningGoal | null>(null);
  const [phase, setPhase] = useState<'preferences' | 'assessment'>('preferences');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token) {
        return;
      }
      try {
        const response = await apiGetOnboarding(token);
        if (cancelled) {
          return;
        }
        if (response.completed) {
          router.replace('/(tabs)/dashboard');
          return;
        }
        setQuestions(response.questions);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Nu am putut încărca profilarea inițială.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const currentQuestion = questions[questionIndex];
  const selectedOptionId = currentQuestion ? answers[currentQuestion.id] : undefined;
  const totalSteps = questions.length + 1;
  const currentStep = phase === 'preferences' ? 1 : questionIndex + 2;
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
  const canStartAssessment = Boolean(experience && learningGoal && questions.length);

  const greeting = useMemo(() => {
    const firstName = user?.displayName.trim().split(/\s+/)[0];
    return firstName ? `Bun venit, ${firstName}` : 'Bun venit';
  }, [user?.displayName]);

  const continueAssessment = async () => {
    if (!currentQuestion || !selectedOptionId || !experience || !learningGoal) {
      return;
    }
    if (questionIndex < questions.length - 1) {
      setQuestionIndex((current) => current + 1);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await completeOnboarding({
        experience,
        learning_goal: learningGoal,
        answers: questions.map((question) => ({
          question_id: question.id,
          selected_option_id: answers[question.id],
        })),
      });
      router.replace('/(tabs)/dashboard');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Nu am putut finaliza profilarea inițială.'
      );
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator size="large" color={TrainingColors.accentTeal} />
        <Text style={styles.stateText}>Pregătim profilarea inițială...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AppBackdrop grid />
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <View style={styles.brandIcon}>
          <Ionicons name="shield-checkmark" size={21} color="#FFFFFF" />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>PROFILARE INIȚIALĂ</Text>
          <Text style={styles.headerTitle}>{greeting}</Text>
        </View>
        <Text style={styles.stepText}>{currentStep}/{totalSteps}</Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, isCompact && styles.contentCompact]}>
        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={TrainingColors.accentDanger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {phase === 'preferences' ? (
          <>
            <View style={styles.introCard}>
              <Ionicons name="compass-outline" size={28} color={TrainingColors.accentTeal} />
              <Text style={styles.introTitle}>Construim traseul potrivit pentru tine</Text>
              <Text style={styles.introText}>
                Răspunsurile tale setează nivelul, lecțiile recomandate și scenariile disponibile.
              </Text>
            </View>

            <OptionSection
              title="Care este experiența ta?"
              options={EXPERIENCE_OPTIONS}
              selectedId={experience}
              onSelect={(id) => setExperience(id as OnboardingExperience)}
            />
            <OptionSection
              title="Care este obiectivul principal?"
              options={GOAL_OPTIONS}
              selectedId={learningGoal}
              onSelect={(id) => setLearningGoal(id as LearningGoal)}
            />

            <Pressable
              disabled={!canStartAssessment}
              onPress={() => setPhase('assessment')}
              style={({ pressed }) => [
                styles.primaryButton,
                !canStartAssessment && styles.disabledButton,
                pressed && canStartAssessment && styles.pressed,
              ]}>
              <Text style={styles.primaryButtonText}>Continuă profilarea</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </Pressable>
          </>
        ) : currentQuestion ? (
          <>
            <View style={styles.questionMeta}>
              <View style={styles.channelPill}>
                <Ionicons
                  name={
                    currentQuestion.channel === 'email'
                      ? 'mail-outline'
                      : currentQuestion.channel === 'sms'
                        ? 'chatbubble-outline'
                        : 'people-outline'
                  }
                  size={15}
                  color={TrainingColors.accentTeal}
                />
                <Text style={styles.channelText}>{currentQuestion.channel.toUpperCase()}</Text>
              </View>
              <Text style={styles.questionCounter}>
                Întrebarea {questionIndex + 1} din {questions.length}
              </Text>
            </View>

            <View style={styles.questionCard}>
              <Text style={styles.questionPrompt}>{currentQuestion.prompt}</Text>
            </View>

            <View style={styles.answerList}>
              {currentQuestion.options.map((option, index) => {
                const selected = selectedOptionId === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() =>
                      setAnswers((current) => ({
                        ...current,
                        [currentQuestion.id]: option.id,
                      }))
                    }
                    style={({ pressed }) => [
                      styles.answerCard,
                      selected && styles.answerCardSelected,
                      pressed && styles.pressed,
                    ]}>
                    <View style={[styles.answerIndex, selected && styles.answerIndexSelected]}>
                      <Text style={[styles.answerIndexText, selected && styles.answerIndexTextSelected]}>
                        {index + 1}
                      </Text>
                    </View>
                    <Text style={[styles.answerText, selected && styles.answerTextSelected]}>
                      {option.text}
                    </Text>
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={21}
                      color={selected ? TrainingColors.accentTeal : TrainingColors.textMuted}
                    />
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.navigationRow, isCompact && styles.navigationRowCompact]}>
              <Pressable
                disabled={isSubmitting}
                onPress={() => {
                  if (questionIndex === 0) {
                    setPhase('preferences');
                  } else {
                    setQuestionIndex((current) => current - 1);
                  }
                }}
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
                <Ionicons name="arrow-back" size={17} color={TrainingColors.textSecondary} />
                <Text style={styles.backButtonText}>Înapoi</Text>
              </Pressable>
              <Pressable
                disabled={!selectedOptionId || isSubmitting}
                onPress={() => void continueAssessment()}
                style={({ pressed }) => [
                  styles.nextButton,
                  (!selectedOptionId || isSubmitting) && styles.disabledButton,
                  pressed && selectedOptionId && !isSubmitting && styles.pressed,
                ]}>
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>
                      {questionIndex === questions.length - 1
                        ? 'Vezi traseul'
                        : 'Continuă'}
                    </Text>
                    <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
                  </>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.introCard}>
            <Text style={styles.introTitle}>Profilarea nu este disponibilă</Text>
            <Text style={styles.introText}>Reîncarcă aplicația și încearcă din nou.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function OptionSection({
  title,
  options,
  selectedId,
  onSelect,
}: {
  title: string;
  options: { id: string; title: string; detail: string; icon: keyof typeof Ionicons.glyphMap }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {options.map((option) => {
        const selected = selectedId === option.id;
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            style={({ pressed }) => [
              styles.optionCard,
              selected && styles.optionCardSelected,
              pressed && styles.pressed,
            ]}>
            <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
              <Ionicons
                name={option.icon}
                size={20}
                color={selected ? '#FFFFFF' : TrainingColors.accentTeal}
              />
            </View>
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>
                {option.title}
              </Text>
              <Text style={styles.optionDetail}>{option.detail}</Text>
            </View>
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={21}
              color={selected ? TrainingColors.accentTeal : TrainingColors.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TrainingColors.pageBase },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: TrainingColors.pageBase,
  },
  stateText: { color: TrainingColors.textSecondary, fontSize: 13 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: TrainingColors.panel,
  },
  headerCompact: { paddingHorizontal: 14, paddingTop: 44, paddingBottom: 12 },
  brandIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
  },
  headerText: { flex: 1, minWidth: 0, marginLeft: 11 },
  eyebrow: {
    color: TrainingColors.accentTeal,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerTitle: { color: TrainingColors.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 2 },
  stepText: { color: TrainingColors.textSecondary, fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 4, backgroundColor: TrainingColors.panelSoft },
  progressFill: { height: '100%', backgroundColor: TrainingColors.accentTeal },
  content: { padding: 20, paddingBottom: 50, gap: 16 },
  contentCompact: { paddingHorizontal: 14, paddingTop: 16, gap: 12 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 125, 125, 0.35)',
    backgroundColor: TrainingColors.failBg,
  },
  errorText: { flex: 1, color: TrainingColors.accentDanger, fontSize: 12 },
  introCard: {
    alignItems: 'center',
    gap: 8,
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(69, 224, 177, 0.3)',
    backgroundColor: 'rgba(69, 224, 177, 0.07)',
  },
  introTitle: { color: TrainingColors.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  introText: { color: TrainingColors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  section: { gap: 9 },
  sectionTitle: { color: TrainingColors.textPrimary, fontSize: 14, fontWeight: '800' },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
  },
  optionCardSelected: {
    borderColor: 'rgba(69, 224, 177, 0.65)',
    backgroundColor: 'rgba(69, 224, 177, 0.09)',
  },
  optionIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: TrainingColors.panelSoft,
  },
  optionIconSelected: { backgroundColor: TrainingColors.buttonPrimary },
  optionText: { flex: 1, minWidth: 0 },
  optionTitle: { color: TrainingColors.textPrimary, fontSize: 13, fontWeight: '700' },
  optionTitleSelected: { color: TrainingColors.accentTeal },
  optionDetail: { color: TrainingColors.textSecondary, fontSize: 10, lineHeight: 14, marginTop: 2 },
  primaryButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 15,
    backgroundColor: TrainingColors.buttonPrimary,
    borderWidth: 1,
    borderColor: TrainingColors.buttonPrimaryBorder,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  questionMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  channelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: TrainingColors.successBg,
  },
  channelText: { color: TrainingColors.accentTeal, fontSize: 10, fontWeight: '800' },
  questionCounter: { color: TrainingColors.textSecondary, fontSize: 11 },
  questionCard: {
    padding: 19,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: TrainingColors.borderStrong,
    backgroundColor: TrainingColors.panel,
  },
  questionPrompt: { color: TrainingColors.textPrimary, fontSize: 17, fontWeight: '700', lineHeight: 25 },
  answerList: { gap: 10 },
  answerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    padding: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
  },
  answerCardSelected: {
    borderColor: 'rgba(69, 224, 177, 0.65)',
    backgroundColor: 'rgba(69, 224, 177, 0.09)',
  },
  answerIndex: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TrainingColors.panelSoft,
  },
  answerIndexSelected: { backgroundColor: TrainingColors.accentTeal },
  answerIndexText: { color: TrainingColors.textSecondary, fontSize: 12, fontWeight: '800' },
  answerIndexTextSelected: { color: TrainingColors.pageBase },
  answerText: { flex: 1, minWidth: 0, color: TrainingColors.textSecondary, fontSize: 12, lineHeight: 17 },
  answerTextSelected: { color: TrainingColors.textPrimary, fontWeight: '600' },
  navigationRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  navigationRowCompact: { gap: 8 },
  backButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TrainingColors.border,
    backgroundColor: TrainingColors.panel,
  },
  backButtonText: { color: TrainingColors.textSecondary, fontSize: 13, fontWeight: '700' },
  nextButton: {
    flex: 1.5,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 14,
    backgroundColor: TrainingColors.buttonPrimary,
  },
  disabledButton: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
});
