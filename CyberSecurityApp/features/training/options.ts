import type { AttackType, DifficultyLevel } from './types';

export const ATTACK_TYPE_OPTIONS: Array<{ id: AttackType; label: string; shortLabel: string }> = [
  { id: 'phishing', label: 'Email Phishing', shortLabel: 'Phishing' },
  { id: 'smishing', label: 'SMS Smishing', shortLabel: 'Smishing' },
  { id: 'impersonation', label: 'Voice/Chat Impersonation', shortLabel: 'Impersonation' },
];

export const DIFFICULTY_OPTIONS: Array<{ id: DifficultyLevel; label: string }> = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

export function getDifficultyLabel(level: DifficultyLevel): string {
  const match = DIFFICULTY_OPTIONS.find((item) => item.id === level);
  return match?.label ?? level;
}
