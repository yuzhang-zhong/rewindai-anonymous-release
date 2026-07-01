import type {
  Analytics,
  CustomCardGenerationRequest,
  CustomCardGenerationResponse,
  Direction,
  GameCard,
  GameState,
  Outcome,
  GameOption,
  GameRecord,
  Language,
  StorySageTraceIngest
} from "../types";

const fallbackTraceContract = {
  protocol: "rewindai.trace",
  version: "1.0",
  source_module: "simulation-test",
  target_module: "storysage"
};

type SessionResponse = {
  sessionId: string;
  state: GameState;
};

type DecisionResponse = {
  state: GameState;
  chosenOption: GameOption;
  outcome: Outcome;
  analytics: Analytics;
};

export async function createSession(rulerName: string, language: Language, customCards?: GameCard[]) {
  return createGroundedSession({ rulerName, language, customCards });
}

export async function createGroundedSession({
  rulerName,
  language,
  customCards,
  groundingSource
}: {
  rulerName: string;
  language: Language;
  customCards?: GameCard[];
  groundingSource?: GameState["initialSnapshot"]["groundingSource"];
}) {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rulerName, language, customCards, groundingSource })
  });
  if (!response.ok) {
    throw new Error("Unable to create session");
  }
  return (await response.json()) as SessionResponse;
}

export async function generateCustomCards(request: CustomCardGenerationRequest) {
  const response = await fetch("/api/custom-cards/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Unable to generate cards");
  }

  return (await response.json()) as CustomCardGenerationResponse;
}

export async function submitDecision(
  state: GameState,
  direction: Direction,
  responseTimeMs: number
) {
  if (!state.currentCard) {
    throw new Error("No current card");
  }

  const response = await fetch(`/api/sessions/${state.sessionId}/decisions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId: state.currentCard.id, direction, responseTimeMs, state })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Unable to submit decision");
  }

  return (await response.json()) as DecisionResponse;
}

export async function getAnalytics(sessionId: string) {
  const response = await fetch(`/api/sessions/${sessionId}/analytics`);
  if (!response.ok) {
    throw new Error("Unable to load analytics");
  }
  return (await response.json()) as { analytics: Analytics };
}

export async function syncTraceToStorySage(
  apiBaseUrl: string,
  traceIngest: StorySageTraceIngest,
  record: GameRecord
) {
  const endpoint = "/api/storysage/simulation/traces";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trace_token: traceIngest.token,
      source: "simulation-test",
      contract: {
        ...fallbackTraceContract,
        ...(traceIngest.accepts ?? {}),
        created_at: new Date().toISOString()
      },
      record
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail ?? payload.error ?? "Unable to sync trace");
  }

  return response.json() as Promise<{
    status: string;
    message: string;
    session_id: string;
    decisions: number;
    received_at: string;
    contract?: {
      accepted: boolean;
      protocol?: string;
      version?: string;
      warnings?: string[];
      warning?: string;
    };
    formulation_stale?: boolean;
    warning?: string | null;
  }>;
}

export async function requestGeneralReflection(
  apiBaseUrl: string,
  traceIngest: StorySageTraceIngest,
  record: GameRecord
) {
  const endpoint = "/api/storysage/simulation/general-reflection";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trace_token: traceIngest.token,
      language: record.language,
      record
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail ?? payload.error ?? "Unable to create general reflection");
  }

  return response.json() as Promise<{ reflection: string; source: string }>;
}
