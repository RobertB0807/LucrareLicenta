import { act, fireEvent, render, screen } from '@testing-library/react-native';

import FeedbackScreen from '../[scenarioId]';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  Redirect: () => null,
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => ({ sessionId: 'session-test' }),
}));

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'user-test',
      email: 'test@example.invalid',
      displayName: 'Test User',
    },
  }),
}));

jest.mock('@/features/training/useTrainingSession', () => ({
  useTrainingSession: () => ({
    evaluation: {
      is_correct: true,
      score_delta: 10,
      explanation: 'Răspuns corect.',
      recommendation: {
        attack_type: 'smishing',
        difficulty: 'medium',
        reason: 'Continuă cu un scenariu SMS.',
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
    },
    scenario: {
      scenario_id: '11111111-1111-4111-8111-111111111111',
      attack_type: 'phishing',
      difficulty: 'easy',
      channel: 'email',
      attacker_message: 'Mesaj',
      options: [],
      red_flags: ['Domeniu suspect'],
    },
    stats: {
      totalScore: 10,
      totalAttempts: 1,
      accuracy: 100,
      correctStreak: 1,
      incorrectStreak: 0,
    },
    sessionId: 'session-test',
  }),
}));

describe('FeedbackScreen recommended scenario action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('navigates only once when the recommended action is pressed repeatedly', async () => {
    render(<FeedbackScreen />);
    await act(async () => undefined);

    const button = screen.getByText('Continuă cu scenariul recomandat');
    fireEvent.press(button);
    fireEvent.press(button);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/chat/[scenarioId]',
      params: expect.objectContaining({
        generateNew: 'true',
        attackType: 'smishing',
        difficulty: 'medium',
        sessionId: 'session-test',
      }),
    });
  });
});
