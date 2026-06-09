import { Platform } from 'react-native';
import Constants from 'expo-constants';

import type {
  AssistantAskApiResponse,
  AttackType,
  DifficultyLevel,
  LearningProfileApiResponse,
  LearningPathApiResponse,
  LearningPathLessonCompletionApiResponse,
  Evaluation,
  GenerateScenarioApiResponse,
  ScenarioCatalogApiResponse,
  SessionEventsApiResponse,
  SessionSnapshotApiResponse,
  SessionTrendAggregatesApiResponse,
  SessionTrendsApiResponse,
  UserSessionsApiResponse,
} from './types';

// ── Auth token injection ───────────────────────────────────────────────────────
// The auth context calls setAuthTokenAccessor on mount so that all protected
// API calls automatically include the Bearer token header.
let _tokenAccessor: (() => string | null) | null = null;
let _authFailureHandler: ((failedToken: string | null) => void) | null = null;

export function setAuthTokenAccessor(accessor: () => string | null): void {
  _tokenAccessor = accessor;
}

export function setAuthFailureHandler(
  handler: ((failedToken: string | null) => void) | null
): void {
  _authFailureHandler = handler;
}

function getAuthHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleAuthFailure(failedToken: string | null): void {
  _authFailureHandler?.(failedToken);
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function getResponseError(response: Response, fallbackError: string): Promise<ApiRequestError> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    const detail = typeof payload.detail === 'string' ? payload.detail : fallbackError;
    return new ApiRequestError(detail, response.status);
  } catch {
    return new ApiRequestError(fallbackError, response.status);
  }
}

type GenerateScenarioPayload = {
  attack_type: AttackType;
  difficulty: DifficultyLevel;
  session_id?: string | null;
  template_id?: string;
};

type EvaluateScenarioPayload = {
  scenario_id: string;
  selected_option_id: string;
};

type AssistantAskPayload = {
  message: string;
  session_id?: string;
  attack_type?: AttackType;
  difficulty?: DifficultyLevel;
};

const DEFAULT_API_BASE_URL =
  Platform.select({
    android: 'http://10.0.2.2:8000',
    default: 'http://127.0.0.1:8000',
  }) ?? 'http://127.0.0.1:8000';

function getExpoLocalApiBaseUrl(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2
      ?.extra?.expoClient?.hostUri;

  if (!hostUri) {
    return null;
  }

  const withoutScheme = hostUri.includes('://') ? hostUri.split('://')[1] : hostUri;
  const host = withoutScheme.split(':')[0];

  if (!host) {
    return null;
  }

  return `http://${host}:8000`;
}

function getWebApiBaseUrl(): string | null {
  if (Platform.OS !== 'web') {
    return null;
  }

  const host = globalThis.location?.hostname;
  if (!host) {
    return null;
  }

  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://127.0.0.1:8000';
  }

  return null;
}

const API_BASE_URL_CANDIDATES = Array.from(
  new Set(
    [
      getWebApiBaseUrl(),
      process.env.EXPO_PUBLIC_API_BASE_URL?.trim(),
      getExpoLocalApiBaseUrl(),
      DEFAULT_API_BASE_URL,
    ].filter((url): url is string => Boolean(url))
  )
);

async function postJson<TResponse>(path: string, payload: unknown, fallbackError: string): Promise<TResponse> {
  let lastError: Error | null = null;
  const authToken = _tokenAccessor?.() ?? null;

  for (const baseUrl of API_BASE_URL_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(authToken) },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        handleAuthFailure(authToken);
        throw new ApiRequestError('Sesiune expirată. Autentifică-te din nou.', 401);
      }
      if (!response.ok) {
        throw await getResponseError(response, fallbackError);
      }

      return (await response.json()) as TResponse;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(fallbackError);
    }
  }

  throw lastError ?? new Error(fallbackError);
}

async function getJson<TResponse>(path: string, fallbackError: string): Promise<TResponse> {
  let lastError: Error | null = null;
  const authToken = _tokenAccessor?.() ?? null;

  for (const baseUrl of API_BASE_URL_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(authToken) },
      });

      if (response.status === 401) {
        handleAuthFailure(authToken);
        throw new ApiRequestError('Sesiune expirată. Autentifică-te din nou.', 401);
      }
      if (!response.ok) {
        throw await getResponseError(response, fallbackError);
      }

      return (await response.json()) as TResponse;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(fallbackError);
    }
  }

  throw lastError ?? new Error(fallbackError);
}

export async function generateScenario(
  payload: GenerateScenarioPayload
): Promise<GenerateScenarioApiResponse> {
  return postJson<GenerateScenarioApiResponse>(
    '/scenario/generate',
    payload,
    'Nu am putut genera scenariul.'
  );
}

export async function getScenario(scenarioId: string): Promise<GenerateScenarioApiResponse> {
  return getJson<GenerateScenarioApiResponse>(
    `/scenario/${encodeURIComponent(scenarioId)}`,
    'Nu am putut restaura scenariul.'
  );
}

export async function evaluateScenario(payload: EvaluateScenarioPayload): Promise<Evaluation> {
  return postJson<Evaluation>('/scenario/evaluate', payload, 'Nu am putut evalua raspunsul.');
}

export async function getSessionSnapshot(sessionId: string): Promise<SessionSnapshotApiResponse> {
  return getJson<SessionSnapshotApiResponse>(
    `/session/${encodeURIComponent(sessionId)}`,
    'Nu am putut incarca sumarul sesiunii.'
  );
}

export async function getUserSessions(
  options: { limit?: number; offset?: number } = {}
): Promise<UserSessionsApiResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 20),
    offset: String(options.offset ?? 0),
  });
  return getJson<UserSessionsApiResponse>(
    `/sessions?${params.toString()}`,
    'Nu am putut încărca istoricul sesiunilor.'
  );
}

export async function getSessionEvents(
  sessionId: string,
  options: { limit?: number; offset?: number; since?: string; until?: string } = {}
): Promise<SessionEventsApiResponse> {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (options.since) {
    params.set('since', options.since);
  }
  if (options.until) {
    params.set('until', options.until);
  }
  return getJson<SessionEventsApiResponse>(
    `/session/${encodeURIComponent(sessionId)}/events?${params.toString()}`,
    'Nu am putut incarca evenimentele sesiunii.'
  );
}

export async function getSessionTrends(
  sessionId: string,
  options: { limit?: number; offset?: number; attackType?: AttackType; since?: string; until?: string } = {}
): Promise<SessionTrendsApiResponse> {
  const limit = options.limit ?? 30;
  const offset = options.offset ?? 0;
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (options.attackType) {
    params.set('attack_type', options.attackType);
  }
  if (options.since) {
    params.set('since', options.since);
  }
  if (options.until) {
    params.set('until', options.until);
  }
  return getJson<SessionTrendsApiResponse>(
    `/session/${encodeURIComponent(sessionId)}/trends?${params.toString()}`,
    'Nu am putut incarca trendurile sesiunii.'
  );
}

export async function getSessionTrendAggregates(
  sessionId: string,
  options: { attackType?: AttackType; since?: string; until?: string } = {}
): Promise<SessionTrendAggregatesApiResponse> {
  const params = new URLSearchParams();
  if (options.attackType) {
    params.set('attack_type', options.attackType);
  }
  if (options.since) {
    params.set('since', options.since);
  }
  if (options.until) {
    params.set('until', options.until);
  }

  const query = params.toString();
  const path = `/session/${encodeURIComponent(sessionId)}/trends/aggregate${query ? `?${query}` : ''}`;
  return getJson<SessionTrendAggregatesApiResponse>(
    path,
    'Nu am putut incarca sumarul agregat al trendurilor.'
  );
}

export async function getScenarioCatalog(): Promise<ScenarioCatalogApiResponse> {
  return getJson<ScenarioCatalogApiResponse>(
    '/scenario/catalog',
    'Nu am putut incarca catalogul de scenarii.'
  );
}

export async function askAssistant(payload: AssistantAskPayload): Promise<AssistantAskApiResponse> {
  return postJson<AssistantAskApiResponse>(
    '/assistant/ask',
    payload,
    'Nu am putut obtine raspunsul asistentului.'
  );
}

export async function getLearningProfile(): Promise<LearningProfileApiResponse> {
  return getJson<LearningProfileApiResponse>(
    '/learning/profile',
    'Nu am putut incarca profilul adaptiv.'
  );
}

export async function getLearningPath(): Promise<LearningPathApiResponse> {
  return getJson<LearningPathApiResponse>(
    '/learning/path',
    'Nu am putut încărca traseul de învățare.'
  );
}

export async function completeLearningPathLesson(
  lessonId: string
): Promise<LearningPathLessonCompletionApiResponse> {
  return postJson<LearningPathLessonCompletionApiResponse>(
    `/learning/path/lessons/${encodeURIComponent(lessonId)}/complete`,
    {},
    'Nu am putut finaliza lecția.'
  );
}
