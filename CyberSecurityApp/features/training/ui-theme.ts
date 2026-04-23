export const TrainingColors = {
  pageBase: '#070D18',
  panel: '#101A2B',
  panelAlt: '#121F36',
  panelSoft: '#152742',
  border: '#2A3F66',
  borderStrong: '#3A5A90',
  textPrimary: '#E8F2FF',
  textSecondary: '#9FBCD9',
  textMuted: '#7F9AC0',
  accentBlue: '#58A6FF',
  accentTeal: '#45E0B1',
  accentAmber: '#F5C56B',
  accentDanger: '#FF7D7D',
  successBg: 'rgba(69, 224, 177, 0.15)',
  failBg: 'rgba(255, 125, 125, 0.16)',
  buttonPrimary: '#2F6FD8',
  buttonPrimaryBorder: '#68A4FF',
  buttonSecondary: '#162947',
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
