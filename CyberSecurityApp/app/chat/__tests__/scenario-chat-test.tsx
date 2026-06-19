import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import type { Scenario } from '@/features/training/types';
import ChatScenarioScreen from '../[scenarioId]';

const mockStartSimulation = jest.fn();
const mockRestoreScenario = jest.fn();
const mockEvaluateWithOptionId = jest.fn();
const routeParams = {
  scenarioId: 'catalog-phishing-easy',
  templateId: 'catalog-phishing-easy',
  attackType: 'phishing',
  difficulty: 'easy',
  sessionId: 'session-test',
};
let mockActiveScenario: Scenario | null = null;

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => routeParams,
}));

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: {
      id: 'user-test',
      email: 'test@example.invalid',
      displayName: 'Test User',
    },
  }),
}));

jest.mock('@/features/training/useTrainingSession', () => ({
  useTrainingSession: () => ({
    scenario: mockActiveScenario,
    isLoading: false,
    error: null,
    startSimulation: mockStartSimulation,
    restoreScenario: mockRestoreScenario,
    evaluateWithOptionId: mockEvaluateWithOptionId,
    evaluation: null,
    sessionId: 'session-test',
  }),
}));

describe('ChatScenarioScreen generation flow', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockActiveScenario = null;
    mockStartSimulation.mockResolvedValue(undefined);
    mockRestoreScenario.mockResolvedValue(false);
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('starts the selected scenario and renders the generated attacker message', async () => {
    const view = render(<ChatScenarioScreen />);

    await waitFor(() => {
      expect(mockStartSimulation).toHaveBeenCalledWith(
        'phishing',
        'easy',
        'session-test',
        'catalog-phishing-easy'
      );
    });

    mockActiveScenario = {
      scenario_id: '11111111-1111-4111-8111-111111111111',
      attack_type: 'phishing',
      difficulty: 'easy',
      channel: 'email',
      attacker_message: 'Contul tău necesită verificare imediată.',
      options: [
        { id: 'report', text: 'Raportez mesajul' },
        { id: 'ignore', text: 'Ignor mesajul' },
        { id: 'engage', text: 'Răspund expeditorului' },
      ],
      red_flags: ['Presiune artificială'],
    };
    view.rerender(<ChatScenarioScreen />);

    await act(async () => {
      jest.runAllTimers();
    });

    expect(screen.getByText('Contul tău necesită verificare imediată.')).toBeTruthy();
    expect(screen.getByText('Cum răspunzi?')).toBeTruthy();
  });
});
