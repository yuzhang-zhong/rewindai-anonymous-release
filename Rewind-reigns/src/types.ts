export type ResourceKey = "faith" | "people" | "military" | "wealth";
export type Direction = "left" | "right" | "up" | "down";
export type Language = "en" | "zh";
export type ModelProvider = "openai" | "gemini" | "anthropic" | "deepseek";
export type StudyGroup = "blank" | "contrast" | "experiment" | "anonymous";

export type RewindAIContract = {
  protocol: string;
  version: string;
  source_module?: string;
  target_module?: string;
  created_at?: string;
  privacy_level?: string;
  trace_return?: {
    protocol: string;
    version: string;
    source_module?: string;
    target_module?: string;
  };
};

export type CardGenerationGuidance = {
  version?: string;
  card_count?: number;
  graph_pressure_card_quota?: number;
  relationship_roles?: string[];
  relationship_tensions?: string[];
  decision_policy_incidents?: string[];
  pressure_mechanics?: string[];
  target_meters?: ResourceKey[];
  risk_distribution?: Array<"low" | "medium" | "high">;
  trace_summary?: string;
  counterfactual_reflection_goal?: string;
  clone_imitation_protocol?: string;
  counterfactual_outcome_report_goal?: string;
  unchosen_option_prompt?: string;
  assisted_replay_goal?: string;
  reflection_loop_steps?: string[];
  safety_rules?: string[];
  rules?: string[];
};

export type Outcome = {
  chance: number;
  label: string;
  labelZh?: string;
  effects: Partial<Record<ResourceKey, number>>;
};

export type GameOption = {
  direction: Direction;
  text: string;
  textZh?: string;
  decisionType: string;
  riskLevel: "low" | "medium" | "high";
  targetMeter: ResourceKey;
  expectedValue: string;
  probabilityType: string;
  outcomes: Outcome[];
};

export type GameCard = {
  id: string;
  number?: number;
  domain?: string;
  speaker: string;
  speakerZh?: string;
  portrait: string;
  prompt: string;
  promptZh?: string;
  options: GameOption[];
  soulTags?: string[];
  failureModes?: string[];
  isFollowUp?: boolean;
};

export type HistoryItem = {
  at: string;
  cardId: string;
  cardDomain?: string;
  cardPrompt?: string;
  cardPromptZh?: string;
  soulTags?: string[];
  failureModes?: string[];
  speaker: string;
  speakerZh?: string;
  direction: Direction;
  optionText: string;
  optionTextZh?: string;
  decisionType: string;
  riskLevel: string;
  targetMeter: ResourceKey;
  expectedValue: string;
  probabilityType: string;
  followUpScheduled: null | {
    cardId: string;
    dueTurn: number;
    fromCardId: string;
    fromDirection: Direction;
    reason: string;
  };
  responseTimeMs: number;
  outcomeLabel: string;
  outcomeLabelZh?: string;
  metersBefore: Record<ResourceKey, number>;
  effects: Partial<Record<ResourceKey, number>>;
  metersAfter: Record<ResourceKey, number>;
};

export type InitialSnapshot = {
  initializedAt: string;
  rulerName: string;
  language: Language;
  meters: Record<ResourceKey, number>;
  firstCardId: string;
  totalCards: number;
  groundingSource?: {
    source: string;
    userId?: string;
    studyGroup?: StudyGroup;
    loadedAt: string;
    protocol?: string;
    version?: string;
    privacyLevel?: string;
  };
};

export type GameState = {
  sessionId: string;
  rulerName: string;
  language: Language;
  initialSnapshot: InitialSnapshot;
  maxDecisions?: number;
  yearsInPower: number;
  year: number;
  meters: Record<ResourceKey, number>;
  currentCard: GameCard | null;
  history: HistoryItem[];
  ended: boolean;
  ending: string | null;
  endingZh: string | null;
  scheduledCount: number;
  remainingCards: number;
  runtime?: {
    currentCardId: string | null;
    deck: string[];
    scheduled: Array<{
      cardId: string;
      dueTurn: number;
      fromCardId: string;
      fromDirection: Direction;
      reason: string;
    }>;
    seenCardIds: string[];
    customCards?: GameCard[];
  };
};

export type CustomCardGenerationRequest = {
  provider: ModelProvider;
  apiKey: string;
  model?: string;
  background: string;
  scenario: string;
  groundingContext?: string;
  generationGuidance?: CardGenerationGuidance;
  count: number;
  language: Language;
};

export type CustomCardGenerationResponse = {
  provider: ModelProvider;
  model: string;
  designNotes: string;
  cards: GameCard[];
};

export type Analytics = {
  decisions: number;
  averageResponseTimeMs: number;
  directions: Record<string, number>;
  decisionTypes: Record<string, number>;
  riskLevels: Record<string, number>;
  domains?: Record<string, number>;
  soulTags?: Record<string, number>;
  failureModes?: Record<string, number>;
  directionEntropy: number;
  scheduledFollowUps: number;
};

export type GameRecord = {
  sessionId: string;
  rulerName: string;
  language: Language;
  startedAt: string;
  updatedAt: string;
  initialSnapshot: InitialSnapshot;
  finalState: Pick<GameState, "meters" | "yearsInPower" | "year" | "ended" | "ending" | "endingZh">;
  history: HistoryItem[];
  reflection?: CounterfactualReflection;
  selfReflection?: {
    text: string;
    created_at: string;
    updated_at: string;
  };
  generalReflection?: {
    text: string;
    source: string;
    created_at: string;
    updated_at: string;
  };
};

export type CloneReplayChoice = {
  card_id: string;
  card_domain?: string;
  card_prompt?: string;
  card_prompt_zh?: string;
  human_direction: Direction;
  clone_direction: Direction;
  human_choice: string;
  human_choice_zh?: string;
  matched: boolean;
  confidence: number;
  decision_type: string;
  risk_level: string;
  target_meter: ResourceKey;
  failure_modes?: string[];
  rationale: string;
};

export type CloneReplaySummary = {
  protocol: "rewindai.clone_same_question_replay";
  source_session_id: string;
  total_questions: number;
  matched_choices: number;
  similarity_score: number;
  similarity_percent: number;
  choices: CloneReplayChoice[];
  mismatch_categories: Record<string, number>;
  explanation: string;
  created_at: string;
  updated_at: string;
};

export type CounterfactualReflection = {
  protocol: "rewindai.counterfactual_reflection";
  evidence_boundary: "tentative_counterfactual_rehearsal" | "same_question_clone_replay";
  simulation_role: "clone_imitates_user_for_unchosen_choice" | "clone_replays_same_questions_for_similarity";
  reflection_to_replay_loop: string[];
  source_session_id: string;
  source_run_started_at: string;
  user_reflection: string;
  unchosen_option: string;
  simulated_choice?: {
    source_card_id?: string;
    source_card_domain?: string;
    original_choice: string;
    attempted_choice: string;
    imitation_basis: string[];
  };
  simulated_effects?: Partial<Record<ResourceKey, number>>;
  simulated_outcome?: string;
  clone_rehearsal: string;
  second_run_rule: string;
  clone_replay?: CloneReplaySummary;
  created_at: string;
  updated_at: string;
};

export type StorySageTraceIngest = {
  endpoint: string;
  token: string;
  expires_in_hours?: number;
  accepts?: {
    protocol: string;
    version: string;
    source_module?: string;
    target_module?: string;
  };
};
