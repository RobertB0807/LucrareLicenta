import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  ApiRequestError,
  completeLearningPathLesson,
  evaluateScenario,
  generateScenario,
  getLearningPath,
  getLearningProfile,
  getScenario,
  getScenarioCatalog,
  getSessionSnapshot,
} from './api';
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
  LearningProfile,
  LearningPathApiResponse,
} from './types';

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  tone: 'neutral' | 'good' | 'warning';
  timeLabel?: string;
};

const TRAINING_SESSION_STORAGE_KEY = 'training-session-state-v1';
const AUTH_REQUIRED_ERROR = 'Trebuie să te autentifici pentru această acțiune.';

type PersistedTrainingSessionState = {
  ownerUserId: string;
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
  adaptiveProfile: LearningProfile | null;
  isLoadingAdaptiveProfile: boolean;
  adaptiveProfileError: string | null;
  refreshAdaptiveProfile: () => Promise<void>;
  learningPath: LearningPathApiResponse | null;
  isLoadingLearningPath: boolean;
  learningPathError: string | null;
  refreshLearningPath: () => Promise<void>;
  refreshActiveSession: () => Promise<void>;
  completePathLesson: (lessonId: string) => Promise<boolean>;
  setSelectedOptionId: (optionId: string | null) => void;
  setAttackType: (attackType: AttackType) => void;
  setDifficulty: (difficulty: DifficultyLevel) => void;
  startSimulation: (
    nextAttackType?: AttackType,
    nextDifficulty?: DifficultyLevel,
    nextSessionId?: string | null,
    templateId?: string
  ) => Promise<void>;
  activateSession: (
    nextSessionId: string,
    nextAttackType?: AttackType | null,
    nextDifficulty?: DifficultyLevel | null
  ) => Promise<boolean>;
  restoreScenario: (scenarioId: string) => Promise<boolean>;
  evaluateAnswer: () => Promise<void>;
  evaluateWithOptionId: (optionId: string) => Promise<boolean>;
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
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [scenarioCatalog, setScenarioCatalog] = useState<ScenarioCatalogItemApiResponse[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [adaptiveProfile, setAdaptiveProfile] = useState<LearningProfile | null>(null);
  const [isLoadingAdaptiveProfile, setIsLoadingAdaptiveProfile] = useState(false);
  const [adaptiveProfileError, setAdaptiveProfileError] = useState<string | null>(null);
  const [learningPath, setLearningPath] = useState<LearningPathApiResponse | null>(null);
  const [isLoadingLearningPath, setIsLoadingLearningPath] = useState(false);
  const [learningPathError, setLearningPathError] = useState<string | null>(null);
  const { isAuthenticated, user } = useAuth();
  const currentUserId = user?.id ?? null;
  const activeUserIdRef = useRef<string | null>(currentUserId);
  const adaptiveProfileRequestRef = useRef(0);
  const learningPathRequestRef = useRef(0);
  const activeSessionRequestRef = useRef(0);
  const scenarioOperationInFlightRef = useRef(false);
  const evaluationInFlightRef = useRef(false);
  const scenarioOperationRequestRef = useRef(0);
  const evaluationRequestRef = useRef(0);
  activeUserIdRef.current = currentUserId;

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
    const hydrationUserId = user?.id ?? null;

    const hydrate = async () => {
      // Don't hydrate until we know who the user is.
      if (!hydrationUserId) {
        return;
      }

      try {
        const raw = await AsyncStorage.getItem(userStorageKey);
        if (!raw || cancelled) {
          return;
        }
        const parsed = JSON.parse(raw) as PersistedTrainingSessionState;

        if (parsed.ownerUserId !== hydrationUserId) {
          await AsyncStorage.removeItem(userStorageKey);
          return;
        }

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
          setHydratedUserId(hydrationUserId);
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
    setHydratedUserId(null);
    setIsHydrated(false);

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [userStorageKey, user]);

  useEffect(() => {
    if (!isHydrated || !user || hydratedUserId !== user.id) {
      return;
    }

    const stateToPersist: PersistedTrainingSessionState = {
      ownerUserId: user.id,
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
    hydratedUserId,
    isHydrated,
    scenario,
    selectedOptionId,
    sessionId,
    sessionStats,
    user,
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

  const refreshAdaptiveProfile = useCallback(async () => {
    const requestUserId = user?.id ?? null;
    const requestId = adaptiveProfileRequestRef.current + 1;
    adaptiveProfileRequestRef.current = requestId;
    if (!isAuthenticated || !requestUserId) {
      setAdaptiveProfile(null);
      setAdaptiveProfileError(null);
      setIsLoadingAdaptiveProfile(false);
      return;
    }

    setIsLoadingAdaptiveProfile(true);
    setAdaptiveProfileError(null);

    try {
      const data = await getLearningProfile();
      if (
        adaptiveProfileRequestRef.current !== requestId ||
        activeUserIdRef.current !== requestUserId ||
        data.user_id !== requestUserId
      ) {
        return;
      }
      setAdaptiveProfile(data);
    } catch {
      if (
        adaptiveProfileRequestRef.current !== requestId ||
        activeUserIdRef.current !== requestUserId
      ) {
        return;
      }
      setAdaptiveProfile(null);
      setAdaptiveProfileError('Nu am putut încărca profilul adaptiv.');
    } finally {
      if (
        adaptiveProfileRequestRef.current === requestId &&
        activeUserIdRef.current === requestUserId
      ) {
        setIsLoadingAdaptiveProfile(false);
      }
    }
  }, [isAuthenticated, user?.id]);

  const refreshLearningPath = useCallback(async () => {
    const requestUserId = user?.id ?? null;
    const requestId = learningPathRequestRef.current + 1;
    learningPathRequestRef.current = requestId;
    if (!isAuthenticated || !requestUserId) {
      setLearningPath(null);
      setLearningPathError(null);
      setIsLoadingLearningPath(false);
      return;
    }

    setIsLoadingLearningPath(true);
    setLearningPathError(null);
    try {
      const data = await getLearningPath();
      if (
        learningPathRequestRef.current === requestId &&
        activeUserIdRef.current === requestUserId &&
        data.user_id === requestUserId
      ) {
        setLearningPath(data);
      }
    } catch {
      if (
        learningPathRequestRef.current === requestId &&
        activeUserIdRef.current === requestUserId
      ) {
        setLearningPathError('Nu am putut încărca traseul de învățare.');
      }
    } finally {
      if (
        learningPathRequestRef.current === requestId &&
        activeUserIdRef.current === requestUserId
      ) {
        setIsLoadingLearningPath(false);
      }
    }
  }, [isAuthenticated, user?.id]);

  const completePathLesson = useCallback(
    async (lessonId: string): Promise<boolean> => {
      const requestUserId = user?.id ?? null;
      const requestId = learningPathRequestRef.current + 1;
      learningPathRequestRef.current = requestId;
      if (!isAuthenticated || !requestUserId) {
        setLearningPathError(AUTH_REQUIRED_ERROR);
        return false;
      }
      setIsLoadingLearningPath(true);
      setLearningPathError(null);
      try {
        const response = await completeLearningPathLesson(lessonId);
        if (
          learningPathRequestRef.current === requestId &&
          activeUserIdRef.current === requestUserId &&
          response.path.user_id === requestUserId
        ) {
          setLearningPath(response.path);
        }
        return (
          learningPathRequestRef.current === requestId &&
          activeUserIdRef.current === requestUserId
        );
      } catch {
        if (
          learningPathRequestRef.current === requestId &&
          activeUserIdRef.current === requestUserId
        ) {
          setLearningPathError('Nu am putut finaliza lecția.');
        }
        return false;
      } finally {
        if (
          learningPathRequestRef.current === requestId &&
          activeUserIdRef.current === requestUserId
        ) {
          setIsLoadingLearningPath(false);
        }
      }
    },
    [isAuthenticated, user?.id]
  );

  const refreshActiveSession = useCallback(async () => {
    const requestUserId = user?.id ?? null;
    const requestSessionId = sessionId;
    const requestId = activeSessionRequestRef.current + 1;
    activeSessionRequestRef.current = requestId;

    if (
      !isHydrated ||
      hydratedUserId !== requestUserId ||
      !requestSessionId ||
      !isAuthenticated ||
      !requestUserId
    ) {
      return;
    }

    try {
      const snapshot = await getSessionSnapshot(requestSessionId);
      if (
        activeSessionRequestRef.current !== requestId ||
        activeUserIdRef.current !== requestUserId ||
        snapshot.session_id !== requestSessionId
      ) {
        return;
      }

      setSessionStats(snapshot.session_stats);
      if (snapshot.session_stats.recent_events.length) {
        applyServerEvents(snapshot.session_stats.recent_events);
      } else {
        setActivityLog([]);
      }
    } catch {
      // Keep the latest local state when the persisted snapshot is temporarily unavailable.
    }
  }, [
    applyServerEvents,
    hydratedUserId,
    isAuthenticated,
    isHydrated,
    sessionId,
    user?.id,
  ]);

  useEffect(() => {
    adaptiveProfileRequestRef.current += 1;
    learningPathRequestRef.current += 1;
    activeSessionRequestRef.current += 1;
    scenarioOperationRequestRef.current += 1;
    evaluationRequestRef.current += 1;
    scenarioOperationInFlightRef.current = false;
    evaluationInFlightRef.current = false;
    setIsLoading(false);
    setAdaptiveProfile(null);
    setAdaptiveProfileError(null);
    setIsLoadingAdaptiveProfile(false);
    setLearningPath(null);
    setLearningPathError(null);
    setIsLoadingLearningPath(false);
  }, [user?.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    void refreshScenarioCatalog();
  }, [isAuthenticated, refreshScenarioCatalog]);

  useEffect(() => {
    void refreshAdaptiveProfile();
  }, [refreshAdaptiveProfile]);

  useEffect(() => {
    void refreshLearningPath();
  }, [refreshLearningPath]);

  useEffect(() => {
    void refreshActiveSession();
  }, [refreshActiveSession]);

  const startSimulation = useCallback(
    async (
      nextAttackType: AttackType = attackType,
      nextDifficulty: DifficultyLevel = difficulty,
      nextSessionId?: string | null,
      templateId?: string
    ) => {
      const requestUserId = user?.id ?? null;
      if (!isAuthenticated || !requestUserId) {
        setError(AUTH_REQUIRED_ERROR);
        return;
      }
      if (scenarioOperationInFlightRef.current) {
        return;
      }

      scenarioOperationInFlightRef.current = true;
      const requestId = scenarioOperationRequestRef.current + 1;
      scenarioOperationRequestRef.current = requestId;
      setIsLoading(true);
      setError(null);
      setScenario(null);
      setEvaluation(null);
      setSelectedOptionId(null);

      const activeSessionId = nextSessionId ?? sessionId;

      try {
        const data = await generateScenario({
          attack_type: nextAttackType,
          difficulty: nextDifficulty,
          session_id: activeSessionId,
          template_id: templateId,
        });

        if (
          scenarioOperationRequestRef.current !== requestId ||
          activeUserIdRef.current !== requestUserId
        ) {
          return;
        }
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
        if (
          scenarioOperationRequestRef.current === requestId &&
          activeUserIdRef.current === requestUserId
        ) {
          setError('Nu am putut genera scenariul. Verifică conexiunea și încearcă din nou.');
        }
      } finally {
        if (scenarioOperationRequestRef.current === requestId) {
          scenarioOperationInFlightRef.current = false;
        }
        if (
          scenarioOperationRequestRef.current === requestId &&
          activeUserIdRef.current === requestUserId
        ) {
          setIsLoading(false);
        }
      }
    },
    [attackType, difficulty, isAuthenticated, pushActivity, sessionId, user?.id]
  );

  const activateSession = useCallback(
    async (
      nextSessionId: string,
      nextAttackType?: AttackType | null,
      nextDifficulty?: DifficultyLevel | null
    ): Promise<boolean> => {
      const requestUserId = user?.id ?? null;
      if (!isAuthenticated || !requestUserId) {
        setError(AUTH_REQUIRED_ERROR);
        return false;
      }
      if (scenarioOperationInFlightRef.current) {
        return false;
      }

      scenarioOperationInFlightRef.current = true;
      const requestId = scenarioOperationRequestRef.current + 1;
      scenarioOperationRequestRef.current = requestId;
      setIsLoading(true);
      setError(null);

      try {
        const snapshot = await getSessionSnapshot(nextSessionId);
        if (
          scenarioOperationRequestRef.current !== requestId ||
          activeUserIdRef.current !== requestUserId
        ) {
          return false;
        }
        setSessionId(snapshot.session_id);
        setSessionStats(snapshot.session_stats);
        setScenario(null);
        setEvaluation(null);
        setSelectedOptionId(null);
        if (nextAttackType) {
          setAttackType(nextAttackType);
        }
        if (nextDifficulty) {
          setDifficulty(nextDifficulty);
        }
        applyServerEvents(snapshot.session_stats.recent_events);
        return true;
      } catch {
        if (
          scenarioOperationRequestRef.current === requestId &&
          activeUserIdRef.current === requestUserId
        ) {
          setError('Nu am putut activa sesiunea selectată.');
        }
        return false;
      } finally {
        if (scenarioOperationRequestRef.current === requestId) {
          scenarioOperationInFlightRef.current = false;
        }
        if (
          scenarioOperationRequestRef.current === requestId &&
          activeUserIdRef.current === requestUserId
        ) {
          setIsLoading(false);
        }
      }
    },
    [applyServerEvents, isAuthenticated, user?.id]
  );

  const restoreScenario = useCallback(
    async (scenarioId: string): Promise<boolean> => {
      const requestUserId = user?.id ?? null;
      if (!isAuthenticated || !requestUserId) {
        setError(AUTH_REQUIRED_ERROR);
        return false;
      }
      if (scenarioOperationInFlightRef.current) {
        return false;
      }

      scenarioOperationInFlightRef.current = true;
      const requestId = scenarioOperationRequestRef.current + 1;
      scenarioOperationRequestRef.current = requestId;
      setIsLoading(true);
      setError(null);

      try {
        const data = await getScenario(scenarioId);
        if (
          scenarioOperationRequestRef.current !== requestId ||
          activeUserIdRef.current !== requestUserId
        ) {
          return false;
        }
        setScenario(data);
        setSessionId(data.session_id);
        setAttackType(data.attack_type);
        setDifficulty(data.difficulty);
        setEvaluation(null);
        setSelectedOptionId(null);
        return true;
      } catch {
        return false;
      } finally {
        if (scenarioOperationRequestRef.current === requestId) {
          scenarioOperationInFlightRef.current = false;
        }
        if (
          scenarioOperationRequestRef.current === requestId &&
          activeUserIdRef.current === requestUserId
        ) {
          setIsLoading(false);
        }
      }
    },
    [isAuthenticated, user?.id]
  );

  const evaluateAnswer = async () => {
    if (!scenario || !selectedOptionId || evaluation || evaluationInFlightRef.current) {
      return;
    }
    const requestUserId = user?.id ?? null;
    if (!isAuthenticated || !requestUserId) {
      setError(AUTH_REQUIRED_ERROR);
      return;
    }

    evaluationInFlightRef.current = true;
    const requestId = evaluationRequestRef.current + 1;
    evaluationRequestRef.current = requestId;
    setIsLoading(true);
    setError(null);

    try {
      const data = await evaluateScenario({
        scenario_id: scenario.scenario_id,
        selected_option_id: selectedOptionId,
      });

      if (
        evaluationRequestRef.current !== requestId ||
        activeUserIdRef.current !== requestUserId
      ) {
        return;
      }
      setEvaluation(data);
      setSessionStats(data.session_stats);
      void refreshAdaptiveProfile();
      void refreshLearningPath();
      if (data.session_stats.recent_events?.length) {
        applyServerEvents(data.session_stats.recent_events);
      } else {
        pushActivity({
          title: data.is_correct ? 'Răspuns corect' : 'Răspuns incorect',
          detail: `${data.score_delta >= 0 ? '+' : ''}${data.score_delta} puncte aplicate scorului curent.`,
          tone: data.is_correct ? 'good' : 'warning',
        });
      }
    } catch (error) {
      if (
        evaluationRequestRef.current === requestId &&
        activeUserIdRef.current === requestUserId
      ) {
        setError(
          error instanceof ApiRequestError && error.status === 409
            ? 'Acest scenariu a fost deja evaluat cu un alt răspuns.'
            : 'Eroare la evaluare. Încearcă din nou.'
        );
      }
    } finally {
      if (evaluationRequestRef.current === requestId) {
        evaluationInFlightRef.current = false;
      }
      if (
        evaluationRequestRef.current === requestId &&
        activeUserIdRef.current === requestUserId
      ) {
        setIsLoading(false);
      }
    }
  };

  const evaluateWithOptionId = async (optionId: string): Promise<boolean> => {
    if (!scenario || evaluation || evaluationInFlightRef.current) {
      return false;
    }
    const requestUserId = user?.id ?? null;
    if (!isAuthenticated || !requestUserId) {
      setError(AUTH_REQUIRED_ERROR);
      return false;
    }

    evaluationInFlightRef.current = true;
    const requestId = evaluationRequestRef.current + 1;
    evaluationRequestRef.current = requestId;
    setSelectedOptionId(optionId);
    setIsLoading(true);
    setError(null);

    try {
      const data = await evaluateScenario({
        scenario_id: scenario.scenario_id,
        selected_option_id: optionId,
      });

      if (
        evaluationRequestRef.current !== requestId ||
        activeUserIdRef.current !== requestUserId
      ) {
        return false;
      }
      setEvaluation(data);
      setSessionStats(data.session_stats);
      void refreshAdaptiveProfile();
      void refreshLearningPath();
      if (data.session_stats.recent_events?.length) {
        applyServerEvents(data.session_stats.recent_events);
      } else {
        pushActivity({
          title: data.is_correct ? 'Răspuns corect' : 'Răspuns incorect',
          detail: `${data.score_delta >= 0 ? '+' : ''}${data.score_delta} puncte aplicate scorului curent.`,
          tone: data.is_correct ? 'good' : 'warning',
        });
      }
      return true;
    } catch (error) {
      if (
        evaluationRequestRef.current === requestId &&
        activeUserIdRef.current === requestUserId
      ) {
        setError(
          error instanceof ApiRequestError && error.status === 409
            ? 'Acest scenariu a fost deja evaluat cu un alt răspuns.'
            : 'Eroare la evaluare. Încearcă din nou.'
        );
      }
      return false;
    } finally {
      if (evaluationRequestRef.current === requestId) {
        evaluationInFlightRef.current = false;
      }
      if (
        evaluationRequestRef.current === requestId &&
        activeUserIdRef.current === requestUserId
      ) {
        setIsLoading(false);
      }
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
    scenarioOperationRequestRef.current += 1;
    evaluationRequestRef.current += 1;
    scenarioOperationInFlightRef.current = false;
    evaluationInFlightRef.current = false;
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
    adaptiveProfile,
    isLoadingAdaptiveProfile,
    adaptiveProfileError,
    refreshAdaptiveProfile,
    learningPath,
    isLoadingLearningPath,
    learningPathError,
    refreshLearningPath,
    refreshActiveSession,
    completePathLesson,
    setSelectedOptionId,
    setAttackType,
    setDifficulty,
    startSimulation,
    activateSession,
    restoreScenario,
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
