import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ProfileScreen from '../profile';

const mockUpdateProfile = jest.fn();
const mockDeleteAccount = jest.fn();
const mockResetPassword = jest.fn();
const mockLogout = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'profile-user',
      email: 'profile@example.invalid',
      displayName: 'Profil Inițial',
    },
    updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
    deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
    resetPassword: (...args: unknown[]) => mockResetPassword(...args),
    logout: (...args: unknown[]) => mockLogout(...args),
  }),
}));

jest.mock('@/features/training/useTrainingSession', () => ({
  useTrainingSession: () => ({
    stats: { accuracy: 75 },
    adaptiveProfile: { overall_mastery: 68 },
    learningPath: { level: 3, xp: 240, longest_streak: 6 },
  }),
}));

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateProfile.mockResolvedValue(undefined);
    mockDeleteAccount.mockResolvedValue(undefined);
  });

  test('updates the display name', async () => {
    render(<ProfileScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Numele tău'), 'Profil Nou');
    fireEvent.press(screen.getByText('Salvează modificarea'));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith('Profil Nou');
      expect(screen.getByText('Numele afișat a fost actualizat.')).toBeTruthy();
    });
  });

  test('requires the explicit confirmation before deleting the account', async () => {
    render(<ProfileScreen />);

    fireEvent.press(screen.getByText('Șterge contul'));
    fireEvent.changeText(screen.getByPlaceholderText('STERGE'), 'STERGE');
    fireEvent.press(screen.getByText('Șterge definitiv'));

    await waitFor(() => {
      expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });
});
