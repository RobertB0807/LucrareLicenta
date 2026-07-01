import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import OnboardingScreen from '../onboarding';
import { apiGetOnboarding } from '@/features/auth/auth-api';

const mockCompleteOnboarding = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

jest.mock('@/features/auth/auth-api', () => {
  const actual = jest.requireActual('@/features/auth/auth-api');
  return {
    ...actual,
    apiGetOnboarding: jest.fn(),
  };
});

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: {
      id: 'new-user',
      email: 'new@example.invalid',
      displayName: 'Utilizator Nou',
      onboardingCompleted: false,
    },
    completeOnboarding: (...args: unknown[]) => mockCompleteOnboarding(...args),
  }),
}));

const mockApiGetOnboarding = jest.mocked(apiGetOnboarding);

const questions = [
  {
    id: 'knowledge-confidence',
    attack_type: 'phishing' as const,
    channel: 'profil',
    prompt: 'Experiență securitate',
    options: [
      { id: 'new_to_security', text: 'Sunt nou' },
      { id: 'confident', text: 'Am cunoștințe bune' },
    ],
  },
  {
    id: 'real-world-exposure',
    attack_type: 'smishing' as const,
    channel: 'profil',
    prompt: 'Expunere practică',
    options: [
      { id: 'never', text: 'Aproape niciodată' },
      { id: 'often', text: 'Fac asta des' },
    ],
  },
  {
    id: 'training-pace',
    attack_type: 'impersonation' as const,
    channel: 'profil',
    prompt: 'Ritm antrenament',
    options: [
      { id: 'guided', text: 'Pași ghidați' },
      { id: 'challenge', text: 'Provocări mai grele' },
    ],
  },
];

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGetOnboarding.mockResolvedValue({
      completed: false,
      experience: null,
      learning_goal: null,
      assessment_score: null,
      assessment_level: null,
      questions,
    });
    mockCompleteOnboarding.mockResolvedValue({
      onboarding_completed: true,
      experience: 'beginner',
      learning_goal: 'personal_safety',
      score: 3,
      total_questions: 3,
      assessment_level: 'advanced',
      recommendation: {
        attack_type: 'smishing',
        difficulty: 'hard',
        reason: 'Test',
      },
    });
  });

  test('submits preferences and all answers then opens the dashboard learning path', async () => {
    render(<OnboardingScreen />);

    await screen.findByText('Care este experiența ta?');
    fireEvent.press(screen.getByText('Începător'));
    fireEvent.press(screen.getByText('Siguranță personală'));
    fireEvent.press(screen.getByText('Continuă profilarea'));

    fireEvent.press(screen.getByText('Am cunoștințe bune'));
    fireEvent.press(screen.getByText('Continuă'));
    fireEvent.press(screen.getByText('Fac asta des'));
    fireEvent.press(screen.getByText('Continuă'));
    fireEvent.press(screen.getByText('Provocări mai grele'));
    fireEvent.press(screen.getByText('Vezi traseul'));

    await waitFor(() => {
      expect(mockCompleteOnboarding).toHaveBeenCalledWith({
        experience: 'beginner',
        learning_goal: 'personal_safety',
        answers: [
          { question_id: 'knowledge-confidence', selected_option_id: 'confident' },
          { question_id: 'real-world-exposure', selected_option_id: 'often' },
          { question_id: 'training-pace', selected_option_id: 'challenge' },
        ],
      });
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/dashboard');
    });
  });
});
