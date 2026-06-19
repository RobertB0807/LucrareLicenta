import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import type { Evaluation, GenerateScenarioApiResponse } from '../types';
import { TrainingSessionProvider, useTrainingSession } from '../useTrainingSession';
import {
  evaluateScenario,
  generateScenario,
  getLearningPath,
  getLearningProfile,
  getScenarioCatalog,
} from '../api';

const mockAuthState = {
  isAuthenticated: true,
  user: {
    id: 'user-test',
    email: 'test@example.invalid',
    displayName: 'Test User',
  },
};

jest.mock('../../auth/auth-context', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return {
    ...actual,
    completeLearningPathLesson: jest.fn(),
    evaluateScenario: jest.fn(),
    generateScenario: jest.fn(),
    getLearningPath: jest.fn(),
    getLearningProfile: jest.fn(),
    getScenario: jest.fn(),
    getScenarioCatalog: jest.fn(),
    getSessionSnapshot: jest.fn(),
  };
});

const mockGenerateScenario = jest.mocked(generateScenario);
const mockEvaluateScenario = jest.mocked(evaluateScenario);
const mockGetLearningPath = jest.mocked(getLearningPath);
const mockGetLearningProfile = jest.mocked(getLearningProfile);
const mockGetScenarioCatalog = jest.mocked(getScenarioCatalog);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

const generatedScenario: GenerateScenarioApiResponse = {
  scenario_id: '11111111-1111-4111-8111-111111111111',
  session_id: '22222222-2222-4222-8222-222222222222',
  attack_type: 'phishing',
  difficulty: 'easy',
  channel: 'email',
  attacker_message: 'Mesaj de test.',
  options: [
    { id: 'report', text: 'Raportez mesajul' },
    { id: 'ignore', text: 'Ignor mesajul' },
    { id: 'engage', text: 'Răspund expeditorului' },
  ],
  red_flags: ['Domeniu suspect'],
};

const evaluation: Evaluation = {
  is_correct: true,
  score_delta: 10,
  explanation: 'Ai verificat corect sursa.',
  recommendation: {
    attack_type: 'smishing',
    difficulty: 'medium',
    reason: 'Continuă cu un canal diferit.',
  },
  session_stats: {
    total_score: 10,
    total_attempts: 1,
    total_correct: 1,
    accuracy: 100,
    correct_streak: 1,
    incorrect_streak: 0,
    per_attack: {},
    recent_events: [],
  },
};

function SessionProbe() {
  const {
    scenario,
    evaluation: activeEvaluation,
    isLoading,
    startSimulation,
    evaluateWithOptionId,
    runRecommendedScenario,
  } = useTrainingSession();

  return (
    <View>
      <Text testID="scenario-id">{scenario?.scenario_id ?? 'none'}</Text>
      <Text testID="evaluation-state">{activeEvaluation ? 'evaluated' : 'pending'}</Text>
      <Text testID="loading-state">{isLoading ? 'loading' : 'idle'}</Text>
      <Pressable
        testID="generate"
        onPress={() => void startSimulation('phishing', 'easy')}>
        <Text>Generate</Text>
      </Pressable>
      <Pressable
        testID="evaluate"
        onPress={() => void evaluateWithOptionId('report')}>
        <Text>Evaluate</Text>
      </Pressable>
      <Pressable
        testID="recommended"
        onPress={() => void runRecommendedScenario()}>
        <Text>Recommended</Text>
      </Pressable>
    </View>
  );
}

describe('TrainingSessionProvider critical flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetScenarioCatalog.mockResolvedValue({ items: [] });
    mockGetLearningProfile.mockResolvedValue({
      user_id: 'user-test',
    } as Awaited<ReturnType<typeof getLearningProfile>>);
    mockGetLearningPath.mockResolvedValue({
      user_id: 'user-test',
    } as Awaited<ReturnType<typeof getLearningPath>>);
  });

  test('ignores duplicate generation presses while the first request is pending', async () => {
    const generation = deferred<GenerateScenarioApiResponse>();
    mockGenerateScenario.mockReturnValue(generation.promise);

    render(
      <TrainingSessionProvider>
        <SessionProbe />
      </TrainingSessionProvider>
    );

    fireEvent.press(screen.getByTestId('generate'));
    fireEvent.press(screen.getByTestId('generate'));

    expect(mockGenerateScenario).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('loading-state')).toHaveTextContent('loading');

    generation.resolve(generatedScenario);

    await waitFor(() => {
      expect(screen.getByTestId('scenario-id')).toHaveTextContent(generatedScenario.scenario_id);
      expect(screen.getByTestId('loading-state')).toHaveTextContent('idle');
    });
  });

  test('evaluates once and starts one fresh recommended scenario', async () => {
    mockGenerateScenario
      .mockResolvedValueOnce(generatedScenario)
      .mockResolvedValueOnce({
        ...generatedScenario,
        scenario_id: '33333333-3333-4333-8333-333333333333',
        attack_type: 'smishing',
        difficulty: 'medium',
        channel: 'sms',
      });
    const evaluationRequest = deferred<Evaluation>();
    mockEvaluateScenario.mockReturnValue(evaluationRequest.promise);

    render(
      <TrainingSessionProvider>
        <SessionProbe />
      </TrainingSessionProvider>
    );

    fireEvent.press(screen.getByTestId('generate'));
    await waitFor(() =>
      expect(screen.getByTestId('scenario-id')).toHaveTextContent(generatedScenario.scenario_id)
    );

    fireEvent.press(screen.getByTestId('evaluate'));
    fireEvent.press(screen.getByTestId('evaluate'));
    expect(mockEvaluateScenario).toHaveBeenCalledTimes(1);

    evaluationRequest.resolve(evaluation);
    await waitFor(() =>
      expect(screen.getByTestId('evaluation-state')).toHaveTextContent('evaluated')
    );

    fireEvent.press(screen.getByTestId('recommended'));
    fireEvent.press(screen.getByTestId('recommended'));

    await waitFor(() => expect(mockGenerateScenario).toHaveBeenCalledTimes(2));
    expect(mockGenerateScenario).toHaveBeenLastCalledWith({
      attack_type: 'smishing',
      difficulty: 'medium',
      session_id: generatedScenario.session_id,
      template_id: undefined,
    });
  });
});
