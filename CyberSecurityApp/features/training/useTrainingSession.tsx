import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { evaluateScenario, generateScenario, getScenarioCatalog, getSessionSnapshot } from './api';
import { ATTACK_TYPE_OPTIONS } from './options';
import { useAuth } from '../auth/auth-context';
import type {
  AttackStats,
  AttackType,
  DifficultyLevel,
  Evaluation,
  ScenarioCatalogItemApiResponse,
  SessionEvent,
  Scenario,
  SessionStats,
} from './types';

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  tone: 'neutral' | 'good' | 'warning';
  timeLabel?: string;
};

const TRAINING_SESSION_STORAGE_KEY = 'training-session-state-v1';

type PersistedTrainingSessionState = {
  sessionId: string | null;
  sessionStats: SessionStats | null;
  attackType: AttackType;
  difficulty: DifficultyLevel;
  evaluation: Evaluation | null;
  scenario: Scenario | null;
  selectedOptionId: string | null;
  activityLog: ActivityItem[];
};

function formatEventTime(isoTimestamp: string): string {
  const parsedDate = new Date(isoTimestamp);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'just now';
  }

  return parsedDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toActivityTone(value: string): 'neutral' | 'good' | 'warning' {
  if (value === 'good' || value === 'warning') {
    return value;
  }
  return 'neutral';
}

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
    timeLabel?: string;
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
  scenarioCatalog: ScenarioCatalogItemApiResponse[];
  isLoadingCatalog: boolean;
  catalogError: string | null;
  refreshScenarioCatalog: () => Promise<void>;
  setSelectedOptionId: (optionId: string | null) => void;
  setAttackType: (attackType: AttackType) => void;
  setDifficulty: (difficulty: DifficultyLevel) => void;
  startSimulation: (
    nextAttackType?: AttackType,
    nextDifficulty?: DifficultyLevel,
    nextSessionId?: string | null
  ) => Promise<void>;
  evaluateAnswer: () => Promise<void>;
  evaluateWithOptionId: (optionId: string) => Promise<void>;
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
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [scenarioCatalog, setScenarioCatalog] = useState<ScenarioCatalogItemApiResponse[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const { isAuthenticated, user } = useAuth();

  // Per-user storage key so each account gets its own training state.
  const userStorageKey = user
    ? `${TRAINING_SESSION_STORAGE_KEY}:${user.id}`
    : TRAINING_SESSION_STORAGE_KEY;

  const pushActivity = useCallback(
    (entry: { title: string; detail: string; tone: 'neutral' | 'good' | 'warning' }) => {
      setActivityLog((current) => [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          timeLabel: formatEventTime(new Date().toISOString()),
          ...entry,
        },
        ...current,
      ].slice(0, 8));
    },
    []
  );

  const applyServerEvents = useCallback((events: SessionEvent[] | undefined) => {
    if (!events?.length) {
      return;
    }

    setActivityLog(
      events.slice(0, 8).map((event) => ({
        id: event.id,
        title: event.title,
        detail: event.detail,
        tone: toActivityTone(event.tone),
        timeLabel: formatEventTime(event.timestamp),
      }))
    );
  }, []);

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

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      // Don't hydrate until we know who the user is.
      if (!user) {
        setIsHydrated(true);
        return;
      }

      try {
        const raw = await AsyncStorage.getItem(userStorageKey);
        if (!raw || cancelled) {
          return;
        }
        const parsed = JSON.parse(raw) as PersistedTrainingSessionState;

        if (
          parsed.attackType &&
          parsed.difficulty &&
          (parsed.sessionId === null || typeof parsed.sessionId === 'string')
        ) {
          setSessionId(parsed.sessionId);
          setSessionStats(parsed.sessionStats ?? null);
          setAttackType(parsed.attackType);
          setDifficulty(parsed.difficulty);
          setEvaluation(parsed.evaluation ?? null);
          setScenario(parsed.scenario ?? null);
          setSelectedOptionId(
            parsed.selectedOptionId === null || typeof parsed.selectedOptionId === 'string'
              ? parsed.selectedOptionId
              : null
          );
          setActivityLog(Array.isArray(parsed.activityLog) ? parsed.activityLog.slice(0, 8) : []);
        }
      } catch {
        // Ignore corrupt local cache and continue with defaults.
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    };

    // Reset in-memory state when user changes before hydrating new data.
    setScenario(null);
    setEvaluation(null);
    setSessionId(null);
    setSessionStats(null);
    setSelectedOptionId(null);
    setError(null);
    setAttackType('phishing');
    setDifficulty('easy');
    setActivityLog([]);
    setIsHydrated(false);

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [userStorageKey, user]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const stateToPersist: PersistedTrainingSessionState = {
      sessionId,
      sessionStats,
      attackType,
      difficulty,
      evaluation,
      scenario,
      selectedOptionId,
      activityLog: activityLog.slice(0, 8),
    };

    void AsyncStorage.setItem(userStorageKey, JSON.stringify(stateToPersist));
  }, [
    activityLog,
    attackType,
    difficulty,
    evaluation,
    isHydrated,
    scenario,
    selectedOptionId,
    sessionId,
    sessionStats,
    userStorageKey,
  ]);

  const refreshScenarioCatalog = useCallback(async () => {
    setIsLoadingCatalog(true);
    setCatalogError(null);
    try {
      const data = await getScenarioCatalog();
      setScenarioCatalog(data.items);
    } catch {
      setCatalogError('Nu am putut încărca catalogul de scenarii.');
      setScenarioCatalog([]);
    } finally {
      setIsLoadingCatalog(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    void refreshScenarioCatalog();
  }, [isAuthenticated, refreshScenarioCatalog]);

  useEffect(() => {
    let cancelled = false;

    const syncSessionFromBackend = async () => {
      if (!isHydrated || !sessionId || !isAuthenticated) {
        return;
      }

      try {
        const snapshot = await getSessionSnapshot(sessionId);
        if (cancelled) {
          return;
        }

        setSessionStats(snapshot.session_stats);
        applyServerEvents(snapshot.session_stats.recent_events);
      } catch {
        // Keep locally available state when backend snapshot cannot be fetched.
      }
    };

    void syncSessionFromBackend();
    return () => {
      cancelled = true;
    };
  }, [applyServerEvents, isAuthenticated, isHydrated, sessionId]);

  const startSimulation = async (
    nextAttackType: AttackType = attackType,
    nextDifficulty: DifficultyLevel = difficulty,
    nextSessionId?: string | null
  ) => {
    setIsLoading(true);
    setError(null);
    setEvaluation(null);
    setSelectedOptionId(null);

    const activeSessionId = nextSessionId ?? sessionId;

    try {
      const data = await generateScenario({
        attack_type: nextAttackType,
        difficulty: nextDifficulty,
        session_id: activeSessionId,
      });

      setScenario(data);
      setSessionId(data.session_id);
      setAttackType(nextAttackType);
      setDifficulty(nextDifficulty);
      pushActivity({
        title: 'Scenariu generat',
        detail: `Scenariul ${nextAttackType} la dificultatea ${nextDifficulty} este acum activ.`,
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
      if (data.session_stats.recent_events?.length) {
        applyServerEvents(data.session_stats.recent_events);
      } else {
        pushActivity({
          title: data.is_correct ? 'Răspuns corect' : 'Răspuns incorect',
          detail: `${data.score_delta >= 0 ? '+' : ''}${data.score_delta} puncte aplicate scorului curent.`,
          tone: data.is_correct ? 'good' : 'warning',
        });
      }
    } catch {
      setError('Eroare la evaluare. Incearca din nou.');
    } finally {
      setIsLoading(false);
    }
  };

  const evaluateWithOptionId = async (optionId: string) => {
    if (!scenario || evaluation) {
      return;
    }

    setSelectedOptionId(optionId);
    setIsLoading(true);
    setError(null);

    try {
      const data = await evaluateScenario({
        scenario_id: scenario.scenario_id,
        selected_option_id: optionId,
      });

      setEvaluation(data);
      setSessionStats(data.session_stats);
      if (data.session_stats.recent_events?.length) {
        applyServerEvents(data.session_stats.recent_events);
      } else {
        pushActivity({
          title: data.is_correct ? 'Răspuns corect' : 'Răspuns incorect',
          detail: `${data.score_delta >= 0 ? '+' : ''}${data.score_delta} puncte aplicate scorului curent.`,
          tone: data.is_correct ? 'good' : 'warning',
        });
      }
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
    scenarioCatalog,
    isLoadingCatalog,
    catalogError,
    refreshScenarioCatalog,
    setSelectedOptionId,
    setAttackType,
    setDifficulty,
    startSimulation,
    evaluateAnswer,
    evaluateWithOptionId,
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
