export type AttackType = 'phishing' | 'smishing' | 'impersonation';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type ScenarioOption = {
  id: string;
  text: string;
};

export type Scenario = {
  scenario_id: string;
  attack_type: AttackType;
  difficulty: DifficultyLevel;
  channel: string;
  attacker_message: string;
  options: ScenarioOption[];
  red_flags: string[];
};

export type AttackStats = {
  attempts: number;
  correct: number;
  accuracy: number;
};

export type SessionEvent = {
  id: string;
  timestamp: string;
  event_type: string;
  title: string;
  detail: string;
  tone: string;
};

export type SessionStats = {
  total_score: number;
  total_attempts: number;
  total_correct: number;
  accuracy: number;
  correct_streak: number;
  incorrect_streak: number;
  per_attack: Record<string, AttackStats>;
  recent_events: SessionEvent[];
};

export type Recommendation = {
  attack_type: AttackType;
  difficulty: DifficultyLevel;
  reason: string;
};

export type Evaluation = {
  is_correct: boolean;
  score_delta: number;
  explanation: string;
  session_stats: SessionStats;
  recommendation: Recommendation;
};

export type GenerateScenarioApiResponse = Scenario & {
  session_id: string;
};
