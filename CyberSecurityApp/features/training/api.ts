import { Platform } from 'react-native';
import Constants from 'expo-constants';

import type {
  AttackType,
  DifficultyLevel,
  Evaluation,
  GenerateScenarioApiResponse,
  SessionEventsApiResponse,
  SessionSnapshotApiResponse,
} from './types';

type GenerateScenarioPayload = {
  attack_type: AttackType;
  difficulty: DifficultyLevel;
  session_id?: string | null;
};

type EvaluateScenarioPayload = {
  scenario_id: string;
  selected_option_id: string;
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

const API_BASE_URL_CANDIDATES = Array.from(
  new Set(
    [
      process.env.EXPO_PUBLIC_API_BASE_URL?.trim(),
      getExpoLocalApiBaseUrl(),
      DEFAULT_API_BASE_URL,
    ].filter((url): url is string => Boolean(url))
  )
);

async function postJson<TResponse>(path: string, payload: unknown, fallbackError: string): Promise<TResponse> {
  let lastError: Error | null = null;

  for (const baseUrl of API_BASE_URL_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(fallbackError);
      }

      return (await response.json()) as TResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(fallbackError);
    }
  }

  throw lastError ?? new Error(fallbackError);
}

async function getJson<TResponse>(path: string, fallbackError: string): Promise<TResponse> {
  let lastError: Error | null = null;

  for (const baseUrl of API_BASE_URL_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(fallbackError);
      }

      return (await response.json()) as TResponse;
    } catch (error) {
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

export async function evaluateScenario(payload: EvaluateScenarioPayload): Promise<Evaluation> {
  return postJson<Evaluation>('/scenario/evaluate', payload, 'Nu am putut evalua raspunsul.');
}

export async function getSessionSnapshot(sessionId: string): Promise<SessionSnapshotApiResponse> {
  return getJson<SessionSnapshotApiResponse>(
    `/session/${encodeURIComponent(sessionId)}`,
    'Nu am putut incarca sumarul sesiunii.'
  );
}

export async function getSessionEvents(
  sessionId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<SessionEventsApiResponse> {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  return getJson<SessionEventsApiResponse>(
    `/session/${encodeURIComponent(sessionId)}/events?limit=${limit}&offset=${offset}`,
    'Nu am putut incarca evenimentele sesiunii.'
  );
}
