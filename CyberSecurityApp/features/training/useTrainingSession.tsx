import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { evaluateScenario, generateScenario } from './api';
import { ATTACK_TYPE_OPTIONS } from './options';
import type {
  AttackStats,
  AttackType,
  DifficultyLevel,
  Evaluation,
  Scenario,
  SessionStats,
} from './types';

type TrainingSessionContextValue = {
  scenario: Scenario | null;
  evaluation: Evaluation | null;
  sessionId: string | null;
  selectedOptionId: string | null;
  attackType: AttackType;
  difficulty: DifficultyLevel;
  isLoading: boolean;
  error: string | null;
  activityLog: Array<{
    id: string;
    title: string;
    detail: string;
    tone: 'neutral' | 'good' | 'warning';
  }>;
  stats: {
    totalScore: number;
    totalAttempts: number;
    accuracy: number;
    correctStreak: number;
    incorrectStreak: number;
  };
  perAttackStats: Array<{
    id: AttackType;
    label: string;
    value?: AttackStats;
  }>;
  setSelectedOptionId: (optionId: string | null) => void;
  setAttackType: (attackType: AttackType) => void;
  setDifficulty: (difficulty: DifficultyLevel) => void;
  startSimulation: (
    nextAttackType?: AttackType,
    nextDifficulty?: DifficultyLevel
  ) => Promise<void>;
  evaluateAnswer: () => Promise<void>;
  runCurrentSelection: () => Promise<void>;
  runRecommendedScenario: () => Promise<void>;
  resetSession: () => void;
};

const TrainingSessionContext = createContext<TrainingSessionContextValue | null>(null);

export function TrainingSessionProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [attackType, setAttackType] = useState<AttackType>('phishing');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('easy');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<
    Array<{
      id: string;
      title: string;
      detail: string;
      tone: 'neutral' | 'good' | 'warning';
    }>
  >([]);

  const pushActivity = useCallback(
    (entry: { title: string; detail: string; tone: 'neutral' | 'good' | 'warning' }) => {
      setActivityLog((current) => [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          ...entry,
        },
        ...current,
      ].slice(0, 8));
    },
    []
  );

  const stats = useMemo(
    () => ({
      totalScore: sessionStats?.total_score ?? 0,
      totalAttempts: sessionStats?.total_attempts ?? 0,
      accuracy: sessionStats?.accuracy ?? 0,
      correctStreak: sessionStats?.correct_streak ?? 0,
      incorrectStreak: sessionStats?.incorrect_streak ?? 0,
    }),
    [sessionStats]
  );

  const perAttackStats = useMemo(
    () =>
      ATTACK_TYPE_OPTIONS.map((option) => ({
        id: option.id,
        label: option.shortLabel,
        value: sessionStats?.per_attack?.[option.id] as AttackStats | undefined,
      })),
    [sessionStats]
  );

  const startSimulation = async (
    nextAttackType: AttackType = attackType,
    nextDifficulty: DifficultyLevel = difficulty
  ) => {
    setIsLoading(true);
    setError(null);
    setEvaluation(null);
    setSelectedOptionId(null);

    try {
      const data = await generateScenario({
        attack_type: nextAttackType,
        difficulty: nextDifficulty,
        session_id: sessionId,
      });

      setScenario(data);
      setSessionId(data.session_id);
      setAttackType(nextAttackType);
      setDifficulty(nextDifficulty);
      pushActivity({
        title: 'Scenario generated',
        detail: `${nextAttackType} on ${nextDifficulty} difficulty is now active.`,
        tone: 'neutral',
      });
    } catch {
      setError(
        'Conexiune esuata cu backend-ul. Verifica daca FastAPI ruleaza pe portul 8000 si endpoint-ul este accesibil.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const evaluateAnswer = async () => {
    if (!scenario || !selectedOptionId || evaluation) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await evaluateScenario({
        scenario_id: scenario.scenario_id,
        selected_option_id: selectedOptionId,
      });

      setEvaluation(data);
      setSessionStats(data.session_stats);
      pushActivity({
        title: data.is_correct ? 'Answer marked correct' : 'Answer marked incorrect',
        detail: `${data.score_delta >= 0 ? '+' : ''}${data.score_delta} points applied to the live score.`,
        tone: data.is_correct ? 'good' : 'warning',
      });
    } catch {
      setError('Eroare la evaluare. Incearca din nou.');
    } finally {
      setIsLoading(false);
    }
  };

  const runCurrentSelection = async () => {
    await startSimulation();
  };

  const runRecommendedScenario = async () => {
    const recommendation = evaluation?.recommendation;
    if (!recommendation) {
      await startSimulation();
      return;
    }

    await startSimulation(recommendation.attack_type, recommendation.difficulty);
  };

  const resetSession = () => {
    setScenario(null);
    setEvaluation(null);
    setSessionId(null);
    setSessionStats(null);
    setSelectedOptionId(null);
    setError(null);
    setAttackType('phishing');
    setDifficulty('easy');
    setActivityLog([]);
  };

  const value = {
    scenario,
    evaluation,
    sessionId,
    selectedOptionId,
    attackType,
    difficulty,
    isLoading,
    error,
    activityLog,
    stats,
    perAttackStats,
    setSelectedOptionId,
    setAttackType,
    setDifficulty,
    startSimulation,
    evaluateAnswer,
    runCurrentSelection,
    runRecommendedScenario,
    resetSession,
  };

  return <TrainingSessionContext.Provider value={value}>{children}</TrainingSessionContext.Provider>;
}

export function useTrainingSession() {
  const context = useContext(TrainingSessionContext);

  if (!context) {
    throw new Error('useTrainingSession must be used inside TrainingSessionProvider.');
  }

  return context;
}
