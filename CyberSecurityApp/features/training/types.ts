export type AttackType = 'phishing' | 'smishing' | 'impersonation';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type ScenarioOption = {
  id: string;
  text: string;
};

export type Scenario = {
  scenario_id: string;
  template_id?: string | null;
  content_source?: 'ollama' | 'rule_based';
  llm_model?: string | null;
  generation_ms?: number | null;
  fallback_reason?: string | null;
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

export type LearningProfileArea = {
  attack_type: AttackType;
  difficulty: DifficultyLevel;
  attempts: number;
  correct: number;
  accuracy: number;
  mastery_score: number;
  last_attempt_at: string | null;
};

export type LearningProfileAttack = {
  attack_type: AttackType;
  attempts: number;
  correct: number;
  accuracy: number;
  mastery_score: number;
  weakest_difficulty: DifficultyLevel | null;
};

export type LearningProfileDifficulty = {
  difficulty: DifficultyLevel;
  attempts: number;
  correct: number;
  accuracy: number;
  mastery_score: number;
};

export type ReviewQueueItemStatus = 'due_now' | 'due_soon' | 'scheduled';

export type ReviewQueueItem = {
  attack_type: AttackType;
  difficulty: DifficultyLevel;
  attempts: number;
  correct: number;
  accuracy: number;
  mastery_score: number;
  last_attempt_at: string | null;
  due_at: string;
  status: ReviewQueueItemStatus;
  priority: number;
};

export type ReviewSummary = {
  due_now: number;
  due_soon: number;
  scheduled: number;
  next_due_at: string | null;
};

export type LearningProfile = {
  user_id: string;
  overall_mastery: number;
  coverage: number;
  by_attack: LearningProfileAttack[];
  by_difficulty: LearningProfileDifficulty[];
  weak_areas: LearningProfileArea[];
  review_queue: ReviewQueueItem[];
  review_summary: ReviewSummary;
  recommended_next: Recommendation;
  last_updated_at: string | null;
};

export type Evaluation = {
  is_correct: boolean;
  score_delta: number;
  explanation: string;
  session_stats: SessionStats;
  recommendation: Recommendation;
  was_already_evaluated?: boolean;
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

export type UserSessionSummaryApiResponse = {
  session_id: string;
  total_score: number;
  total_attempts: number;
  total_correct: number;
  accuracy: number;
  generated_scenarios: number;
  evaluated_scenarios: number;
  latest_attack_type: AttackType | null;
  latest_difficulty: DifficultyLevel | null;
  pending_scenario_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type UserSessionsApiResponse = {
  total: number;
  limit: number;
  offset: number;
  items: UserSessionSummaryApiResponse[];
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

export type LearningProfileApiResponse = LearningProfile;

export type LearningPathStepType = 'lesson' | 'scenario';
export type LearningPathStepStatus = 'locked' | 'available' | 'in_progress' | 'completed';
export type LearningPathModuleStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export type LearningPathStep = {
  id: string;
  step_type: LearningPathStepType;
  title: string;
  description: string;
  status: LearningPathStepStatus;
  progress_current: number;
  progress_required: number;
  lesson_id: string | null;
  attack_type: AttackType | null;
  difficulty: DifficultyLevel | null;
  mastery_current: number | null;
  minimum_mastery: number | null;
};

export type LearningPathModule = {
  id: string;
  title: string;
  description: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  status: LearningPathModuleStatus;
  progress_percent: number;
  completed_steps: number;
  total_steps: number;
  steps: LearningPathStep[];
};

export type LearningPathGoal = {
  id: string;
  title: string;
  detail: string;
  current: number;
  target: number;
  completed: boolean;
};

export type LearningPathBadge = {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
};

export type LearningPathNextAction = {
  module_id: string;
  step_id: string;
  step_type: LearningPathStepType;
  title: string;
  lesson_id: string | null;
  attack_type: AttackType | null;
  difficulty: DifficultyLevel | null;
};

export type LearningPathApiResponse = {
  user_id: string;
  xp: number;
  level: number;
  level_progress: number;
  level_target: number;
  current_streak: number;
  longest_streak: number;
  completed_modules: number;
  total_modules: number;
  overall_progress: number;
  daily_goal: LearningPathGoal;
  weekly_goal: LearningPathGoal;
  badges: LearningPathBadge[];
  modules: LearningPathModule[];
  next_action: LearningPathNextAction | null;
};

export type LearningPathLessonCompletionApiResponse = {
  lesson_id: string;
  was_already_completed: boolean;
  path: LearningPathApiResponse;
};
