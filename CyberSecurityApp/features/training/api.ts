import { Platform } from 'react-native';

import type {
  AttackType,
  DifficultyLevel,
  Evaluation,
  GenerateScenarioApiResponse,
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

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  Platform.select({
    android: 'http://10.0.2.2:8000',
    default: 'http://127.0.0.1:8000',
  }) ??
  'http://127.0.0.1:8000';

export async function generateScenario(
  payload: GenerateScenarioPayload
): Promise<GenerateScenarioApiResponse> {
  const response = await fetch(`${API_BASE_URL}/scenario/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Nu am putut genera scenariul.');
  }

  return (await response.json()) as GenerateScenarioApiResponse;
}

export async function evaluateScenario(payload: EvaluateScenarioPayload): Promise<Evaluation> {
  const response = await fetch(`${API_BASE_URL}/scenario/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Nu am putut evalua raspunsul.');
  }

  return (await response.json()) as Evaluation;
}
