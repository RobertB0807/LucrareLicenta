export const TrainingColors = {
  pageBase: '#050A13',
  pageRaised: '#08111F',
  panel: '#0D1828',
  panelAlt: '#111F33',
  panelSoft: '#172941',
  panelElevated: '#13243A',
  border: '#233A59',
  borderStrong: '#3B608C',
  borderSubtle: 'rgba(126, 164, 204, 0.14)',
  textPrimary: '#F2F7FF',
  textSecondary: '#AAC1DA',
  textMuted: '#748EAB',
  accentBlue: '#68A9FF',
  accentTeal: '#4DE4B2',
  accentAmber: '#F6C76E',
  accentDanger: '#FF858D',
  successBg: 'rgba(77, 228, 178, 0.12)',
  failBg: 'rgba(255, 133, 141, 0.13)',
  buttonPrimary: '#3279E6',
  buttonPrimaryPressed: '#2868C9',
  buttonPrimaryBorder: '#6DAAFF',
  buttonSecondary: '#142945',
  overlay: 'rgba(3, 8, 16, 0.72)',
};

export const TrainingRadii = {
  small: 10,
  medium: 14,
  large: 20,
  xlarge: 26,
  pill: 999,
};

export const TrainingShadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 22,
    elevation: 7,
  },
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 12,
  },
};

export function getAccuracyFillColor(accuracy: number): string {
  if (accuracy >= 75) {
    return '#45E0B1';
  }
  if (accuracy >= 45) {
    return '#F5C56B';
  }
  return '#FF7D7D';
}
