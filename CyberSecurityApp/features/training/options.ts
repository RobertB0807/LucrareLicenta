import type { AttackType, DifficultyLevel } from './types';

export const ATTACK_TYPE_OPTIONS: Array<{ id: AttackType; label: string; shortLabel: string }> = [
  { id: 'phishing', label: 'Phishing prin email', shortLabel: 'Phishing' },
  { id: 'smishing', label: 'Smishing prin SMS', shortLabel: 'Smishing' },
  { id: 'impersonation', label: 'Impersonare voice/chat', shortLabel: 'Impersonare' },
];

export const DIFFICULTY_OPTIONS: Array<{
  id: DifficultyLevel;
  label: string;
  summary: string;
  detail: string;
}> = [
  {
    id: 'easy',
    label: 'Ușor',
    summary: 'Indicii evidente',
    detail: 'Mesaje directe, presiune vizibilă și semnale de alarmă ușor de identificat.',
  },
  {
    id: 'medium',
    label: 'Mediu',
    summary: 'Context credibil',
    detail: 'Pretexte plauzibile și indicii mai discrete care cer verificarea sursei.',
  },
  {
    id: 'hard',
    label: 'Greu',
    summary: 'Atac sofisticat',
    detail: 'Mesaje bine construite, context realist și diferențe subtile de procedură.',
  },
];

export function getDifficultyLabel(level: DifficultyLevel): string {
  const match = DIFFICULTY_OPTIONS.find((item) => item.id === level);
  return match?.label ?? level;
}
