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

export type SessionSnapshotApiResponse = {
  session_id: string;
  session_stats: SessionStats;
  generated_scenarios: number;
  evaluated_scenarios: number;
  last_updated_at: string | null;
};

export type SessionEventsApiResponse = {
  session_id: string;
  total: number;
  limit: number;
  offset: number;
  events: SessionEvent[];
};

export type SessionTrendPointApiResponse = {
  timestamp: string;
  attack_type: AttackType;
  difficulty: DifficultyLevel;
  is_correct: boolean;
  score_delta: number;
  score_after: number;
  accuracy_after: number;
  attempt_index: number;
};

export type SessionTrendsApiResponse = {
  session_id: string;
  total: number;
  limit: number;
  offset: number;
  points: SessionTrendPointApiResponse[];
};

export type SessionTrendAggregateByDayApiResponse = {
  day: string;
  attempts: number;
  correct: number;
  accuracy: number;
  score_delta_total: number;
  cumulative_score_after: number;
};

export type SessionTrendAggregateByAttackApiResponse = {
  attack_type: AttackType;
  attempts: number;
  correct: number;
  accuracy: number;
  score_delta_total: number;
  average_score_delta: number;
};

export type SessionTrendAggregatesApiResponse = {
  session_id: string;
  total_attempts: number;
  by_day: SessionTrendAggregateByDayApiResponse[];
  by_attack: SessionTrendAggregateByAttackApiResponse[];
};

export type AssistantAskApiResponse = {
  answer: string;
  quick_tips: string[];
};

export type ScenarioCatalogItemApiResponse = {
  id: string;
  attack_type: AttackType;
  difficulty: DifficultyLevel;
  channel: string;
  attacker_message_preview: string;
  red_flags: string[];
};

export type ScenarioCatalogApiResponse = {
  items: ScenarioCatalogItemApiResponse[];
};
