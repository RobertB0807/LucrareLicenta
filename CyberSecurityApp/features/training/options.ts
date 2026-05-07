import type { AttackType, DifficultyLevel } from './types';

export const ATTACK_TYPE_OPTIONS: Array<{ id: AttackType; label: string; shortLabel: string }> = [
  { id: 'phishing', label: 'Phishing prin email', shortLabel: 'Phishing' },
  { id: 'smishing', label: 'Smishing prin SMS', shortLabel: 'Smishing' },
  { id: 'impersonation', label: 'Impersonare voice/chat', shortLabel: 'Impersonare' },
];

export const DIFFICULTY_OPTIONS: Array<{ id: DifficultyLevel; label: string }> = [
  { id: 'easy', label: 'Ușor' },
  { id: 'medium', label: 'Mediu' },
  { id: 'hard', label: 'Greu' },
];

export function getDifficultyLabel(level: DifficultyLevel): string {
  const match = DIFFICULTY_OPTIONS.find((item) => item.id === level);
  return match?.label ?? level;
}
