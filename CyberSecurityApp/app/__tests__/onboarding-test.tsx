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
    id: 'email-urgency',
    attack_type: 'phishing' as const,
    channel: 'email',
    prompt: 'Întrebarea email',
    options: [
      { id: 'wrong-email', text: 'Răspuns email greșit' },
      { id: 'verify_official', text: 'Răspuns email corect' },
    ],
  },
  {
    id: 'delivery-sms',
    attack_type: 'smishing' as const,
    channel: 'sms',
    prompt: 'Întrebarea SMS',
    options: [
      { id: 'wrong-sms', text: 'Răspuns SMS greșit' },
      { id: 'report_sms', text: 'Răspuns SMS corect' },
    ],
  },
  {
    id: 'manager-payment',
    attack_type: 'impersonation' as const,
    channel: 'chat',
    prompt: 'Întrebarea impersonare',
    options: [
      { id: 'wrong-chat', text: 'Răspuns impersonare greșit' },
      { id: 'verify_identity', text: 'Răspuns impersonare corect' },
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

  test('submits preferences and all answers then opens the recommended scenario', async () => {
    render(<OnboardingScreen />);

    await screen.findByText('Care este experiența ta?');
    fireEvent.press(screen.getByText('Începător'));
    fireEvent.press(screen.getByText('Siguranță personală'));
    fireEvent.press(screen.getByText('Începe evaluarea'));

    fireEvent.press(screen.getByText('Răspuns email corect'));
    fireEvent.press(screen.getByText('Continuă'));
    fireEvent.press(screen.getByText('Răspuns SMS corect'));
    fireEvent.press(screen.getByText('Continuă'));
    fireEvent.press(screen.getByText('Răspuns impersonare corect'));
    fireEvent.press(screen.getByText('Finalizează'));

    await waitFor(() => {
      expect(mockCompleteOnboarding).toHaveBeenCalledWith({
        experience: 'beginner',
        learning_goal: 'personal_safety',
        answers: [
          { question_id: 'email-urgency', selected_option_id: 'verify_official' },
          { question_id: 'delivery-sms', selected_option_id: 'report_sms' },
          { question_id: 'manager-payment', selected_option_id: 'verify_identity' },
        ],
      });
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/chat/[scenarioId]',
        params: expect.objectContaining({
          attackType: 'smishing',
          difficulty: 'hard',
          generateNew: 'true',
        }),
      });
    });
  });
});
