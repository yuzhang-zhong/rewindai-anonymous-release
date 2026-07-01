import { useEffect, useRef, useState } from "react";
import "./styles.css";
import { createGroundedSession, generateCustomCards, requestGeneralReflection, submitDecision, syncTraceToStorySage } from "./lib/api";
import { GamePanel } from "./components/GamePanel";
import { LanguageSwitch } from "./components/LanguageSwitch";
import { loadRecords, updateRecordGeneralReflection, updateRecordReflection, updateRecordSelfReflection, upsertRecord } from "./lib/records";
import { text } from "./i18n";
import type { Analytics, CardGenerationGuidance, CloneReplaySummary, CounterfactualReflection, Direction, GameCard, GameRecord, GameState, HistoryItem, Language, ModelProvider, ResourceKey, RewindAIContract, StorySageTraceIngest, StudyGroup } from "./types";

type StorySageGrounding = {
  rewindai_contract?: RewindAIContract;
  user_id?: string;
  study_group?: StudyGroup;
  source?: string;
  privacy_policy?: string;
  grounding?: {
    graph_constraints?: {
      available?: boolean;
      relationship_focus?: string[];
      relation_types?: Record<string, number>;
      scenario_prompts?: string[];
    };
    behavioral_trace_summary?: {
      available?: boolean;
      decision_count?: number;
      summary?: string;
    };
    mental_model_formulation?: {
      status?: string;
      confidence?: string;
      decision_policy_hypotheses?: string[];
      likely_pressure_points?: string[];
      privacy_boundary?: string;
    } | null;
    card_generation_guidance?: CardGenerationGuidance;
  };
  rewind?: {
    player_name?: string;
    background?: string;
    scenario?: string;
  };
  simulation_test?: {
    player_name?: string;
    study_group?: StudyGroup;
    no_retention?: boolean;
    personalized_cards?: boolean;
    card_policy?: string;
    notes?: string;
  };
  trace_ingest?: StorySageTraceIngest;
};

type PackBlueprint = {
  title: string;
  summary: string;
  chips: string[];
  sections: Array<{
    label: string;
    values: string[];
  }>;
};

const storySageApiBaseUrl =
  ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_STORYSAGE_API_BASE_URL) ??
  "http://localhost:8000";

function isBrowserHostedAwayFromLocalApi(apiBaseUrl: string) {
  if (typeof window === "undefined") {
    return false;
  }

  const pageHost = window.location.hostname;
  const apiHost = new URL(apiBaseUrl, window.location.origin).hostname;
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

  return !localHosts.has(pageHost) && localHosts.has(apiHost);
}

function countStorySageTraceRuns(records: GameRecord[], fallbackRecord: GameRecord) {
  const userId = fallbackRecord.initialSnapshot.groundingSource?.userId;
  const matchedRecords = records.filter((record) => {
    const grounding = record.initialSnapshot.groundingSource;
    return record.history.length > 0
      && grounding?.source === "storysage_trace_handoff"
      && (!userId || grounding.userId === userId);
  });

  return Math.max(1, matchedRecords.length);
}

function decodeGroundingParam(value: string): StorySageGrounding | null {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as StorySageGrounding;
  } catch {
    return null;
  }
}

function clearGroundingQueryParam(params: URLSearchParams) {
  params.delete("grounding");
  params.delete("handoff");
  params.delete("lang");
  const search = params.toString();
  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`
  );
}

function formatGroundingContext(grounding: StorySageGrounding): string {
  const lines: string[] = [];
  const graph = grounding.grounding?.graph_constraints;
  if (graph?.available) {
    lines.push("Graph-derived relationship constraints:");
    if (graph.relationship_focus?.length) {
      lines.push(`- Relationship focus: ${graph.relationship_focus.slice(0, 8).join(", ")}`);
    }
    const relationTypes = graph.relation_types ? Object.keys(graph.relation_types).slice(0, 8) : [];
    if (relationTypes.length) {
      lines.push(`- Relation types: ${relationTypes.join(", ")}`);
    }
    for (const prompt of graph.scenario_prompts?.slice(0, 4) ?? []) {
      lines.push(`- ${prompt}`);
    }
  }

  const model = grounding.grounding?.mental_model_formulation;
  if (model) {
    lines.push(`Mental model draft: status=${model.status ?? "unknown"}, confidence=${model.confidence ?? "unknown"}.`);
    for (const hypothesis of model.decision_policy_hypotheses?.slice(0, 4) ?? []) {
      lines.push(`- Hypothesis: ${hypothesis}`);
    }
    for (const pressure of model.likely_pressure_points?.slice(0, 5) ?? []) {
      lines.push(`- Pressure point: ${pressure}`);
    }
  }

  const trace = grounding.grounding?.behavioral_trace_summary;
  if (trace?.available) {
    lines.push(`Behavioral trace summary: ${trace.summary ?? `${trace.decision_count ?? 0} decisions recorded.`}`);
  }

  const guidance = grounding.grounding?.card_generation_guidance;
  if (guidance?.counterfactual_reflection_goal) {
    lines.push(`Counterfactual reflection goal: ${guidance.counterfactual_reflection_goal}`);
  }
  if (guidance?.clone_imitation_protocol) {
    lines.push(`Clone imitation protocol: ${guidance.clone_imitation_protocol}`);
  }
  if (guidance?.counterfactual_outcome_report_goal) {
    lines.push(`Counterfactual outcome goal: ${guidance.counterfactual_outcome_report_goal}`);
  }
  if (guidance?.unchosen_option_prompt) {
    lines.push(`Unchosen option prompt: ${guidance.unchosen_option_prompt}`);
  }
  if (guidance?.assisted_replay_goal) {
    lines.push(`Assisted replay goal: ${guidance.assisted_replay_goal}`);
  }
  for (const step of guidance?.reflection_loop_steps?.slice(0, 5) ?? []) {
    lines.push(`Reflection loop step: ${step}`);
  }

  if (grounding.privacy_policy) {
    lines.push(`Privacy boundary: ${grounding.privacy_policy}`);
  }

  return lines.join("\n").slice(0, 2400);
}

function safeBlueprintText(value: unknown, maxLength = 96): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/sk-[A-Za-z0-9_/\-+=]{8,}/g, "[redacted]")
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/\b(api[_-]?key|token|secret)\s*[:=]\s*[A-Za-z0-9_/\-+=]{8,}/gi, "$1=[redacted]")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function compactList(values: unknown, limit = 4): string[] {
  return Array.isArray(values)
    ? values.map((value) => safeBlueprintText(value)).filter(Boolean).slice(0, limit)
    : [];
}

function extractGroundingLine(context: string, label: string): string[] {
  const line = context
    .split(/\r?\n/)
    .map((item) => item.trim().replace(/^[-*]\s*/, ""))
    .find((item) => item.toLowerCase().startsWith(label.toLowerCase()));

  if (!line) {
    return [];
  }

  return line
    .slice(label.length)
    .split(/[,;、，]/)
    .map((item) => safeBlueprintText(item))
    .filter(Boolean)
    .slice(0, 4);
}

function buildPackBlueprint(guidance?: CardGenerationGuidance, groundingContext = ""): PackBlueprint | null {
  if (!guidance && !groundingContext) {
    return null;
  }

  const relationshipRoles = compactList(guidance?.relationship_roles);
  const relationshipTensions = compactList(guidance?.relationship_tensions);
  const incidents = compactList(guidance?.decision_policy_incidents, 3);
  const pressureMechanics = compactList(guidance?.pressure_mechanics, 3);
  const targetMeters = compactList(guidance?.target_meters, 4);
  const riskDistribution = compactList(guidance?.risk_distribution, 3);
  const counterfactualGoals = compactList([
    guidance?.counterfactual_reflection_goal,
    guidance?.clone_imitation_protocol,
    guidance?.counterfactual_outcome_report_goal,
    guidance?.unchosen_option_prompt,
    guidance?.assisted_replay_goal
  ], 5);

  const fallbackRoles = extractGroundingLine(groundingContext, "Relationship focus:");
  const fallbackTensions = extractGroundingLine(groundingContext, "Relation types:");
  const fallbackTrace = safeBlueprintText(
    groundingContext
      .split(/\r?\n/)
      .map((item) => item.trim().replace(/^[-*]\s*/, ""))
      .find((item) => item.startsWith("Behavioral trace summary:"))
      ?.replace("Behavioral trace summary:", ""),
    120
  );

  const sections = [
    { label: "Relationship pressure", values: relationshipRoles.length ? relationshipRoles : fallbackRoles },
    { label: "Tensions to dramatize", values: relationshipTensions.length ? relationshipTensions : fallbackTensions },
    { label: "Decision incidents", values: incidents },
    { label: "Pressure mechanics", values: pressureMechanics },
    { label: "Counterfactual reflection", values: counterfactualGoals }
  ].filter((section) => section.values.length > 0);

  const chips = [
    guidance?.graph_pressure_card_quota ? `${guidance.graph_pressure_card_quota} graph-pressure cards` : "",
    targetMeters.length ? `meters: ${targetMeters.join(", ")}` : "",
    riskDistribution.length ? `risk: ${riskDistribution.join(", ")}` : "",
    fallbackTrace ? "trace-informed" : ""
  ].filter(Boolean);

  const summary = safeBlueprintText(guidance?.trace_summary, 150) || fallbackTrace ||
    "StorySage grounding will be converted into playable situations, not questionnaires.";

  return {
    title: guidance ? "StorySage-proposed simulation pack" : "Attached StorySage grounding",
    summary,
    chips,
    sections
  };
}

const starterMeters: ResourceKey[] = ["faith", "people", "military", "wealth"];
const starterRiskLevels = ["low", "medium", "high"] as const;

function isResourceKey(value: string): value is ResourceKey {
  return starterMeters.includes(value as ResourceKey);
}

function sectionValues(blueprint: PackBlueprint | null | undefined, label: string) {
  return blueprint?.sections.find((section) => section.label === label)?.values ?? [];
}

function starterValues(primary: string[], fallback: string[]) {
  return primary.length > 0 ? primary : fallback;
}

function rolePortrait(role: string) {
  const lower = role.toLowerCase();
  if (/advisor|professor|teacher|mentor/.test(lower)) return "advisor";
  if (/roommate|classmate|peer|friend/.test(lower)) return "classmate";
  if (/club|team|captain|leader/.test(lower)) return "club";
  if (/family|parent|sibling/.test(lower)) return "parent";
  if (/health|energy|sport|athlete/.test(lower)) return "athlete";
  return "classmate";
}

function starterEffect(primary: ResourceKey, secondary: ResourceKey, positivePrimary: boolean) {
  return positivePrimary
    ? { [primary]: 15, [secondary]: -10 }
    : { [primary]: -11, [secondary]: 14 };
}

function createBlueprintStarterCards(
  blueprint: PackBlueprint | null | undefined,
  guidance?: CardGenerationGuidance
): GameCard[] {
  const count = Math.max(20, Math.min(30, Number(guidance?.card_count) || 20));
  const roles = starterValues(
    compactList(guidance?.relationship_roles, 8),
    starterValues(sectionValues(blueprint, "Relationship pressure"), ["advisor", "close classmate", "project teammate"])
  );
  const tensions = starterValues(
    compactList(guidance?.relationship_tensions, 8),
    starterValues(sectionValues(blueprint, "Tensions to dramatize"), ["obligation", "trust", "boundary-setting"])
  );
  const incidents = starterValues(
    compactList(guidance?.decision_policy_incidents, 8),
    starterValues(sectionValues(blueprint, "Decision incidents"), ["decide whether to help when already overloaded"])
  );
  const mechanics = starterValues(
    compactList(guidance?.pressure_mechanics, 8),
    starterValues(sectionValues(blueprint, "Pressure mechanics"), ["limited energy during a deadline week"])
  );
  const targetMeters = compactList(guidance?.target_meters, 4).filter(isResourceKey);
  const risks = compactList(guidance?.risk_distribution, 3).filter((risk): risk is "low" | "medium" | "high" =>
    starterRiskLevels.includes(risk as "low" | "medium" | "high")
  );

  return Array.from({ length: count }, (_, index) => {
    const role = roles[index % roles.length];
    const tension = tensions[index % tensions.length];
    const incident = incidents[index % incidents.length];
    const mechanic = mechanics[index % mechanics.length];
    const primary = targetMeters[index % Math.max(1, targetMeters.length)] ?? starterMeters[index % starterMeters.length];
    const secondary = starterMeters[(starterMeters.indexOf(primary) + 1 + (index % 3)) % starterMeters.length];
    const riskLevel = risks[index % Math.max(1, risks.length)] ?? starterRiskLevels[index % starterRiskLevels.length];
    const domain = index % 3 === 0 ? "Grounded relationship pressure" : index % 3 === 1 ? "Grounded trade-off" : "Grounded follow-through";

    return {
      id: `storysage-blueprint-${index + 1}`,
      number: index + 1,
      domain,
      speaker: role,
      speakerZh: "与你有关的人",
      portrait: rolePortrait(role),
      prompt: `${role} brings up ${incident}. The pressure is ${mechanic}, and the real tension is ${tension}. What do you do?`,
      promptZh: `${role} 提出了一个与你有关的决定：${incident}。压力来自 ${mechanic}，真正的拉扯是 ${tension}。你会怎么做？`,
      options: [
        {
          direction: "left",
          text: "Name the trade-off and set a clear boundary",
          textZh: "说清取舍，并设下清楚边界",
          decisionType: "boundary-with-context",
          riskLevel,
          targetMeter: primary,
          expectedValue: riskLevel === "high" ? "swingy" : "medium",
          probabilityType: "stable",
          outcomes: [
            {
              chance: 1,
              label: "You protect the core priority, but the relationship absorbs some strain.",
              labelZh: "你守住了核心优先级，但关系承受了一些张力。",
              effects: starterEffect(primary, secondary, true)
            }
          ]
        },
        {
          direction: "right",
          text: "Keep the peace and absorb the extra burden",
          textZh: "先维持和气，自己承担额外压力",
          decisionType: "relationship-first",
          riskLevel,
          targetMeter: secondary,
          expectedValue: "medium",
          probabilityType: "stable",
          outcomes: [
            {
              chance: 1,
              label: "The immediate social friction drops, but the hidden cost moves back to you.",
              labelZh: "眼前的关系摩擦下降了，但隐形成本回到了你身上。",
              effects: starterEffect(primary, secondary, false)
            }
          ]
        }
      ]
    };
  });
}

function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [playerName, setPlayerName] = useState("");
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [customCards, setCustomCards] = useState<GameCard[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardStartedAt, setCardStartedAt] = useState(performance.now());
  const [groundedBackground, setGroundedBackground] = useState("");
  const [groundedScenario, setGroundedScenario] = useState("");
  const [groundedContext, setGroundedContext] = useState("");
  const [generationGuidance, setGenerationGuidance] = useState<CardGenerationGuidance | undefined>();
  const [packBlueprint, setPackBlueprint] = useState<PackBlueprint | null>(null);
  const [groundingNotice, setGroundingNotice] = useState("");
  const [groundingSource, setGroundingSource] = useState<GameState["initialSnapshot"]["groundingSource"]>();
  const [traceIngest, setTraceIngest] = useState<StorySageTraceIngest | null>(null);
  const [traceSyncStatus, setTraceSyncStatus] = useState("");
  const [studyGroup, setStudyGroup] = useState<StudyGroup>("experiment");
  const [noRetention, setNoRetention] = useState(false);
  const traceSyncInFlight = useRef(false);

  useEffect(() => {
    setRecords(loadRecords());
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedLanguage = params.get("lang");
    const nextLanguage: Language = requestedLanguage === "zh" || requestedLanguage === "en"
      ? requestedLanguage
      : language;
    if (requestedLanguage === "zh" || requestedLanguage === "en") {
      setLanguage(nextLanguage);
    }
    const handoffValue = params.get("handoff") ?? params.get("grounding");
    if (!handoffValue) {
      if (requestedLanguage === "zh" || requestedLanguage === "en") {
        clearGroundingQueryParam(params);
      }
      return;
    }

    const grounding = decodeGroundingParam(handoffValue);
    clearGroundingQueryParam(params);
    if (!grounding?.trace_ingest) {
      setError("Unable to read StorySage simulation-test handoff.");
      return;
    }

    const nextGroup = grounding.simulation_test?.study_group ?? grounding.study_group ?? "experiment";
    const nextNoRetention = Boolean(grounding.simulation_test?.no_retention || nextGroup === "anonymous");
    const nextPlayerName = grounding.simulation_test?.player_name ?? grounding.rewind?.player_name ?? grounding.user_id ?? "";
    setStudyGroup(nextGroup);
    setNoRetention(nextNoRetention);
    setPlayerName(nextPlayerName);
    setGroundedBackground("");
    setGroundedScenario("");
    setGroundedContext("");
    setGenerationGuidance(undefined);
    setPackBlueprint(null);
    setCustomCards([]);
    setGroundingSource({
      source: "storysage_trace_handoff",
      userId: grounding.user_id,
      studyGroup: nextGroup,
      loadedAt: new Date().toISOString(),
      protocol: grounding.rewindai_contract?.protocol,
      version: grounding.rewindai_contract?.version,
      privacyLevel: grounding.rewindai_contract?.privacy_level
    });
    setTraceIngest(grounding.trace_ingest ?? null);
    setGroundingNotice(nextLanguage === "zh"
      ? `已连接 RewindAI 账号 ${nextPlayerName || "当前用户"} · ${nextGroup}。${nextNoRetention ? "Anonymous Group：本次体验不会上传或保留研究轨迹。" : "simulation-test 将使用公共随机校园题库。"}`
      : `Connected to RewindAI as ${nextPlayerName || "this account"} · ${nextGroup}. ${nextNoRetention ? "Anonymous Group: this experience will not upload or retain study traces." : "simulation-test will use the public random campus deck."}`);
    setStudioOpen(false);
  }, []);

  async function persistRecord(nextState: GameState) {
    if (noRetention) {
      const transientRecord = recordFromState(nextState, language);
      setRecords([transientRecord]);
      setTraceSyncStatus(language === "zh" ? "Anonymous Group：本次体验不保留研究轨迹。" : "Anonymous Group: this experience is not retained as a study trace.");
      return;
    }

    const record = upsertRecord(nextState, language);
    const nextRecords = loadRecords();
    setRecords(nextRecords);

    if (!traceIngest || !record.initialSnapshot.groundingSource || record.history.length === 0) {
      return;
    }

    notifyStorySageTraceReturn(
      record.history.length,
      undefined,
      countStorySageTraceRuns(nextRecords, record)
    );

    const shouldSyncRemoteTrace = record.finalState.ended || record.history.length === 1 || record.history.length % 6 === 0;
    if (!shouldSyncRemoteTrace || (traceSyncInFlight.current && !record.finalState.ended)) {
      return;
    }

    if (!traceIngest.endpoint.startsWith("http") && isBrowserHostedAwayFromLocalApi(storySageApiBaseUrl)) {
      setTraceSyncStatus("Trace saved locally. StorySage sync needs a public StorySage API URL for this online preview.");
      return;
    }

    try {
      traceSyncInFlight.current = true;
      setTraceSyncStatus("Syncing simulation-test trace to StorySage...");
      const result = await syncTraceToStorySage(storySageApiBaseUrl, traceIngest, record);
      setTraceSyncStatus(`Trace synced: ${result.decisions} decisions`);
      notifyStorySageTraceReturn(result.decisions, result.received_at);
    } catch (err) {
      if (err instanceof TypeError) {
        setTraceSyncStatus("Trace saved locally. StorySage sync is unavailable from this browser session.");
        return;
      }
      setTraceSyncStatus(err instanceof Error ? `Trace sync failed: ${err.message}` : "Trace sync failed");
    } finally {
      traceSyncInFlight.current = false;
    }
  }

  async function persistCounterfactualReflection(record: GameRecord, reflection: CounterfactualReflection) {
    if (noRetention) {
      setRecords((items) => [
        { ...record, reflection, updatedAt: reflection.updated_at },
        ...items.filter((item) => item.sessionId !== record.sessionId),
      ]);
      setTraceSyncStatus(language === "zh" ? "Anonymous Group：clone 体验不上传研究记录。" : "Anonymous Group: clone experience is not uploaded as study data.");
      return;
    }

    const updatedRecord = updateRecordReflection(record.sessionId, reflection);
    setRecords(loadRecords());
    if (!updatedRecord) {
      return;
    }

    if (!traceIngest || !updatedRecord.initialSnapshot.groundingSource || updatedRecord.history.length === 0) {
      setTraceSyncStatus("Counterfactual reflection saved locally.");
      return;
    }

    if (!traceIngest.endpoint.startsWith("http") && isBrowserHostedAwayFromLocalApi(storySageApiBaseUrl)) {
      setTraceSyncStatus("Counterfactual reflection saved locally. StorySage sync needs a public StorySage API URL for this online preview.");
      return;
    }

    try {
      setTraceSyncStatus("Syncing counterfactual reflection to StorySage...");
      const result = await syncTraceToStorySage(storySageApiBaseUrl, traceIngest, updatedRecord);
      setTraceSyncStatus(`Counterfactual reflection synced: ${result.decisions} decisions`);
      notifyStorySageTraceReturn(result.decisions, result.received_at);
    } catch (err) {
      if (err instanceof TypeError) {
        setTraceSyncStatus("Counterfactual reflection saved locally. StorySage sync is unavailable from this browser session.");
        return;
      }
      setTraceSyncStatus(err instanceof Error ? `Counterfactual sync failed: ${err.message}` : "Counterfactual sync failed");
    }
  }

  async function persistSelfReflection(record: GameRecord, text: string) {
    if (noRetention) {
      const now = new Date().toISOString();
      setRecords((items) => [
        {
          ...record,
          updatedAt: now,
          selfReflection: {
            text,
            created_at: record.selfReflection?.created_at ?? now,
            updated_at: now
          }
        },
        ...items.filter((item) => item.sessionId !== record.sessionId),
      ]);
      return;
    }

    const updatedRecord = updateRecordSelfReflection(record.sessionId, text);
    setRecords(loadRecords());
    if (updatedRecord && traceIngest && updatedRecord.initialSnapshot.groundingSource) {
      const result = await syncTraceToStorySage(storySageApiBaseUrl, traceIngest, updatedRecord).catch(() => null);
      if (result) {
        notifyStorySageTraceReturn(result.decisions, result.received_at);
      }
    }
  }

  async function persistGeneralReflection(record: GameRecord) {
    if (noRetention) {
      throw new Error(language === "zh" ? "Anonymous Group 不保存通用 AI 反思记录。" : "Anonymous Group does not retain general AI reflection records.");
    }

    if (!traceIngest) {
      throw new Error("General reflection requires a RewindAI launch token.");
    }
    const result = await requestGeneralReflection(storySageApiBaseUrl, traceIngest, record);
    const updatedRecord = updateRecordGeneralReflection(record.sessionId, result.reflection, result.source);
    setRecords(loadRecords());
    if (updatedRecord && updatedRecord.initialSnapshot.groundingSource) {
      const syncResult = await syncTraceToStorySage(storySageApiBaseUrl, traceIngest, updatedRecord).catch(() => null);
      if (syncResult) {
        notifyStorySageTraceReturn(syncResult.decisions, syncResult.received_at);
      }
    }
    return result.reflection;
  }

  function notifyStorySageTraceReturn(decisions: number, receivedAt?: string, traceCount = 1) {
    if (!window.opener || !Number.isFinite(decisions) || decisions <= 0) {
      return;
    }

    window.opener.postMessage({
      type: "rewindai:simulation-trace-returned",
      source: "simulation-test",
      user_id: playerName,
      trace_count: Math.max(1, traceCount),
      decision_count: decisions,
      summary: `${decisions} simulation-test decision${decisions === 1 ? "" : "s"} recorded in this browser session.`,
      received_at: receivedAt ?? new Date().toISOString()
    }, "*");
  }

  async function startGame(nameOverride?: string) {
    const name = nameOverride?.trim() || playerName.trim() || (language === "zh" ? "校园玩家" : "Campus Player");
    setPending(true);
    setError(null);

    try {
      const payload = await createGroundedSession({
        rulerName: name,
        language,
        customCards: traceIngest ? undefined : customCards.length > 0 ? customCards : undefined,
        groundingSource
      });
      setState(payload.state);
      setAnalytics(null);
      setAdvisorOpen(false);
      void persistRecord(payload.state);
      setCardStartedAt(performance.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start game");
    } finally {
      setPending(false);
    }
  }

  function startAnonymous() {
    const suffix = Math.random().toString(36).slice(2, 7);
    const anonymousName = `anonymous-${suffix}`;
    setPlayerName(anonymousName);
    setStudyGroup("blank");
    setGroundingNotice("Anonymous local mode. Your run is saved in this browser unless launched from RewindAI.");
    window.setTimeout(() => {
      void startGame(anonymousName);
    }, 0);
  }

  async function choose(direction: Direction) {
    if (!state?.currentCard || pending) {
      return;
    }

    setPending(true);
    setError(null);
    const responseTimeMs = Math.round(performance.now() - cardStartedAt);

    try {
      const payload = await submitDecision(state, direction, responseTimeMs);
      window.setTimeout(() => {
        setState(payload.state);
        setAnalytics(payload.analytics);
        void persistRecord(payload.state);
        setCardStartedAt(performance.now());
      }, 260);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit decision");
    } finally {
      window.setTimeout(() => setPending(false), 280);
    }
  }

  const t = text[language];
  const advisorLabel = studyGroup === "blank"
    ? language === "zh" ? "自我反思" : "Reflect"
    : studyGroup === "contrast"
      ? language === "zh" ? "通用反思" : "AI Reflect"
      : studyGroup === "anonymous"
        ? language === "zh" ? "体验反思" : "Reflect"
        : "Clone";

  if (!state) {
    return (
      <div className="loading-screen">
        <div className="loading-panel start-panel">
          <strong>simulation-test</strong>
          <span>{t.continueTitle}</span>
          <label className="field-label">
            {t.nameLabel}
            <input
              autoComplete="name"
              maxLength={32}
              onChange={(event) => setPlayerName(event.target.value)}
              placeholder={t.namePlaceholder}
              type="text"
              value={playerName}
            />
          </label>
          <LanguageSwitch language={language} label={t.language} onChange={setLanguage} />
          <div className="start-guide" aria-label={t.startGuideTitle}>
            <strong>{t.startGuideTitle}</strong>
            <span><b>1</b>{t.startGuidePlay}</span>
            <span><b>2</b>{t.startGuideRecords}</span>
            <span><b>3</b>{t.startGuideReflect}</span>
          </div>
          <div className="start-actions">
            <button disabled={pending} type="button" onClick={() => startGame()}>
              {pending ? "..." : t.start}
            </button>
            {!traceIngest && (
              <button type="button" className="secondary-button" onClick={startAnonymous}>
                {language === "zh" ? "匿名开始" : "Anonymous start"}
              </button>
            )}
            {!traceIngest && (
              <button type="button" className="secondary-button" onClick={() => setStudioOpen(true)}>
              Scenario Studio
              </button>
            )}
            <button
              type="button"
              className="secondary-button"
              disabled={records.length === 0}
              title={records.length === 0 ? t.recordsLocked : undefined}
              onClick={() => setRecordsOpen(true)}
            >
              {t.records}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={records.length === 0}
              title={records.length === 0 ? t.advisorLocked : undefined}
              onClick={() => setAdvisorOpen(true)}
            >
              {advisorLabel}
            </button>
          </div>
          {records.length === 0 && (
            <span className="pack-pill start-unlock-hint">{t.recordsLocked}</span>
          )}
          {customCards.length > 0 && !traceIngest && (
            <span className="pack-pill">{customCards.length} custom cards ready</span>
          )}
          {groundingNotice && <span className="pack-pill">{groundingNotice}</span>}
          {traceSyncStatus && <span className="pack-pill">{traceSyncStatus}</span>}
          {error && <span className="inline-error">{error}</span>}
        </div>
        {studioOpen && (
          <ScenarioStudio
            activeCards={customCards}
            initialBackground={groundedBackground}
            initialScenario={groundedScenario}
            initialGroundingContext={groundedContext}
            initialGenerationGuidance={generationGuidance}
            packBlueprint={packBlueprint}
            notice={groundingNotice}
            language={language}
            onApply={(cards) => {
              setCustomCards(cards);
              setStudioOpen(false);
            }}
            onClear={() => setCustomCards([])}
            onClose={() => setStudioOpen(false)}
          />
        )}
        {recordsOpen && (
          <RecordsPanel records={records} language={language} onClose={() => setRecordsOpen(false)} />
        )}
        {advisorOpen && (
          <CloneAdvisorPanel
            currentState={state}
            groundedContext={groundedContext}
            language={language}
            records={records}
            onClose={() => setAdvisorOpen(false)}
            studyGroup={studyGroup}
            onSaveReflection={persistCounterfactualReflection}
            onSaveSelfReflection={persistSelfReflection}
            onRequestGeneralReflection={persistGeneralReflection}
            onStartReplay={() => {
              setAdvisorOpen(false);
              void startGame();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <GamePanel
        state={state}
        pending={pending}
        analytics={analytics}
        language={language}
        onChoose={choose}
        onRestart={startGame}
        onLanguageChange={(nextLanguage) => setLanguage(nextLanguage)}
        advisorLabel={advisorLabel}
        onOpenAdvisor={() => setAdvisorOpen(true)}
        onOpenRecords={() => setRecordsOpen(true)}
      />
      {advisorOpen && (
        <CloneAdvisorPanel
          currentState={state}
          groundedContext={groundedContext}
          language={language}
          records={records}
          onClose={() => setAdvisorOpen(false)}
          studyGroup={studyGroup}
          onSaveReflection={persistCounterfactualReflection}
          onSaveSelfReflection={persistSelfReflection}
          onRequestGeneralReflection={persistGeneralReflection}
          onStartReplay={() => {
            setAdvisorOpen(false);
            void startGame();
          }}
        />
      )}
      {recordsOpen && (
        <RecordsPanel records={records} language={language} onClose={() => setRecordsOpen(false)} />
      )}
      {error && <div className="error-banner">{error}</div>}
      {traceSyncStatus && <div className="error-banner trace-banner">{traceSyncStatus}</div>}
    </>
  );
}

const providerDefaults: Record<ModelProvider, string> = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.5-flash",
  anthropic: "claude-3-5-haiku-latest",
  deepseek: "deepseek-chat"
};

function ScenarioStudio({
  activeCards,
  initialBackground,
  initialGroundingContext,
  initialGenerationGuidance,
  initialScenario,
  language,
  notice,
  packBlueprint,
  onApply,
  onClear,
  onClose
}: {
  activeCards: GameCard[];
  initialBackground?: string;
  initialGroundingContext?: string;
  initialGenerationGuidance?: CardGenerationGuidance;
  initialScenario?: string;
  language: Language;
  notice?: string;
  packBlueprint?: PackBlueprint | null;
  onApply: (cards: GameCard[]) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<ModelProvider>("openai");
  const [model, setModel] = useState(providerDefaults.openai);
  const [apiKey, setApiKey] = useState("");
  const [background, setBackground] = useState(initialBackground ?? "");
  const [scenario, setScenario] = useState(initialScenario ?? "");
  const [groundingContext] = useState(initialGroundingContext ?? "");
  const [count, setCount] = useState(20);
  const [cards, setCards] = useState<GameCard[]>(activeCards);
  const [designNotes, setDesignNotes] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function changeProvider(nextProvider: ModelProvider) {
    setProvider(nextProvider);
    setModel(providerDefaults[nextProvider]);
  }

  async function generate() {
    setWorking(true);
    setMessage(null);

    try {
      const result = await generateCustomCards({
        provider,
        model,
        apiKey,
        background,
        scenario,
        groundingContext,
        generationGuidance: initialGenerationGuidance,
        count,
        language
      });
      setCards(result.cards);
      setDesignNotes(result.designNotes);
      setApiKey("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to generate cards");
    } finally {
      setWorking(false);
    }
  }

  function draftStarterPack() {
    const starterCards = createBlueprintStarterCards(packBlueprint, initialGenerationGuidance);
    setCards(starterCards);
    setDesignNotes(
      `Drafted ${starterCards.length} local starter cards from the StorySage blueprint. No provider API key was used.`
    );
    setMessage(null);
  }

  return (
    <section className="studio-overlay" aria-label="Scenario Studio">
      <div className="studio-panel">
        <header className="studio-header">
          <div>
            <strong>Scenario Studio</strong>
            <span>Generate a 20-30 card decision pack from your own context.</span>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        {notice && <p className="privacy-note">{notice}</p>}
        {groundingContext && (
          <p className="privacy-note">
            StorySage graph/model context is attached to card generation as private design guidance.
          </p>
        )}
        {packBlueprint && (
          <section className="pack-blueprint" aria-label="StorySage simulation pack blueprint">
            <div>
              <span>Grounded blueprint</span>
              <strong>{packBlueprint.title}</strong>
              <p>{packBlueprint.summary}</p>
            </div>
            {packBlueprint.chips.length > 0 && (
              <div className="blueprint-chips">
                {packBlueprint.chips.map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
            )}
            {packBlueprint.sections.length > 0 && (
              <div className="blueprint-grid">
                {packBlueprint.sections.map((section) => (
                  <article key={section.label}>
                    <small>{section.label}</small>
                    <strong>{section.values.join(" · ")}</strong>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="studio-layout">
          <form className="studio-form" onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}>
            <div className="studio-grid">
              <label className="field-label">
                Provider
                <select value={provider} onChange={(event) => changeProvider(event.target.value as ModelProvider)}>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </label>
              <label className="field-label">
                Model
                <input value={model} onChange={(event) => setModel(event.target.value)} />
              </label>
              <label className="field-label">
                Batch Size
                <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
                  <option value={20}>20 cards</option>
                  <option value={25}>25 cards</option>
                  <option value={30}>30 cards</option>
                </select>
              </label>
            </div>

            <label className="field-label">
              API Key
              <input
                autoComplete="off"
                placeholder="Used once on the server, never saved"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>

            <label className="field-label">
              User Background
              <textarea
                placeholder="Example: I am a senior design student balancing thesis, internship interviews, and a student club..."
                value={background}
                onChange={(event) => setBackground(event.target.value)}
              />
            </label>

            <label className="field-label">
              Decision Scenario
              <textarea
                placeholder="Example: Make this about graduation pressure, roommate conflict, budget limits, and choices that affect reputation and energy."
                value={scenario}
                onChange={(event) => setScenario(event.target.value)}
              />
            </label>

            <div className="studio-actions">
              {packBlueprint && (
                <button className="blueprint-button" type="button" onClick={draftStarterPack}>
                  Draft Starter Pack
                </button>
              )}
              <button disabled={working} type="submit">{working ? "Generating..." : "Generate Pack"}</button>
              <button
                className="secondary-button"
                disabled={cards.length === 0}
                type="button"
                onClick={() => onApply(cards)}
              >
                Use Pack
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setCards([]);
                  setDesignNotes("");
                  onClear();
                }}
              >
                Clear
              </button>
            </div>

            <p className="privacy-note">Keys are sent only with this generation request and are not stored in records or local storage.</p>
            {message && <span className="inline-error">{message}</span>}
          </form>

          <div className="studio-preview">
            <header>
              <strong>Generated Pack</strong>
              <span>{cards.length} generated</span>
            </header>
            {designNotes && <p className="design-notes">{designNotes}</p>}
            {cards.length === 0 && <p className="empty-records">No custom cards yet.</p>}
            <div className="preview-list">
              {cards.map((card) => (
                <article className="preview-card" key={card.id}>
                  <small>{card.domain} / {card.portrait}</small>
                  <strong>{language === "zh" ? card.speakerZh ?? card.speaker : card.speaker}</strong>
                  <p>{language === "zh" ? card.promptZh ?? card.prompt : card.prompt}</p>
                  <div className="preview-options">
                    {card.options.map((option) => (
                      <span key={option.direction}>
                        {option.direction}: {language === "zh" ? option.textZh ?? option.text : option.text}
                        <em>{formatEffects(option.outcomes[0]?.effects ?? {})}</em>
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatEffects(effects: Partial<Record<"faith" | "people" | "military" | "wealth", number>>) {
  return Object.entries(effects)
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `${key} ${value && value > 0 ? "+" : ""}${value}`)
    .join(" / ");
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

function totalNegativeImpact(item: HistoryItem) {
  return Object.values(item.effects).reduce((sum, value) => sum + Math.max(0, -(value ?? 0)), 0);
}

function frictionScore(item: HistoryItem) {
  return totalNegativeImpact(item) + (item.riskLevel === "high" ? 12 : item.riskLevel === "medium" ? 6 : 0);
}

function lowestMeter(record: GameRecord) {
  return Math.min(...Object.values(record.finalState.meters));
}

function topFrictionCards(record: GameRecord, limit = 5) {
  return [...record.history]
    .map((item) => ({ item, score: frictionScore(item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function isCompletedRun(record: GameRecord) {
  return Boolean(record.finalState.ended && record.finalState.ending?.includes("Semester complete"));
}

function displayEnding(record: GameRecord, language: Language) {
  if (!record.finalState.ended) {
    return language === "zh" ? "本局仍在进行中。" : "This run is still in progress.";
  }

  return (
    language === "zh"
      ? record.finalState.endingZh ?? record.finalState.ending
      : record.finalState.ending
  ) ?? (language === "zh" ? "本局已结束。" : "Run ended.");
}

function buildRunReport(record: GameRecord | undefined, language: Language) {
  if (!record || record.history.length === 0) {
    return null;
  }

  const domainCounts = countBy(record.history.map((item) => item.cardDomain ?? "Unknown"));
  const soulCounts = countBy(record.history.flatMap((item) => item.soulTags ?? []));
  const modeCounts = countBy(record.history.flatMap((item) => item.failureModes ?? []));
  const highRiskCount = record.history.filter((item) => item.riskLevel === "high").length;
  const negativeImpact = record.history.reduce((sum, item) => sum + totalNegativeImpact(item), 0);
  const topCards = topFrictionCards(record);
  const sortedModes = Object.entries(modeCounts).sort((a, b) => b[1] - a[1]);
  const sortedSoul = Object.entries(soulCounts).sort((a, b) => b[1] - a[1]);

  return {
    title: language === "zh" ? "本轮风险报告" : "Run risk report",
    decisions: record.history.length,
    highRiskCount,
    negativeImpact,
    lowestMeter: lowestMeter(record),
    domainCounts,
    topCards,
    primaryMode: sortedModes[0]?.[0] ?? "mixed-risk",
    primarySoul: sortedSoul[0]?.[0] ?? "COG",
    sortedModes,
    sortedSoul
  };
}

function compareRecords(records: GameRecord[], language: Language) {
  const [latest, previous] = records;
  if (!latest || !previous) {
    return null;
  }

  const latestReport = buildRunReport(latest, language);
  const previousReport = buildRunReport(previous, language);
  if (!latestReport || !previousReport) {
    return null;
  }

  const previousNegativePerDecision = previousReport.negativeImpact / Math.max(1, previousReport.decisions);
  const latestNegativePerDecision = latestReport.negativeImpact / Math.max(1, latestReport.decisions);
  const previousHighRiskRate = previousReport.highRiskCount / Math.max(1, previousReport.decisions);
  const latestHighRiskRate = latestReport.highRiskCount / Math.max(1, latestReport.decisions);

  return {
    previous,
    latest,
    negativeImpactDelta: latestNegativePerDecision - previousNegativePerDecision,
    highRiskDelta: latestHighRiskRate - previousHighRiskRate,
    lowestMeterDelta: latestReport.lowestMeter - previousReport.lowestMeter,
    previousCompleted: Boolean(previous.finalState.ended && previous.finalState.ending?.includes("Semester complete")),
    latestCompleted: Boolean(latest.finalState.ended && latest.finalState.ending?.includes("Semester complete")),
    previousReport,
    latestReport
  };
}

function signedNumber(value: number, digits = 0) {
  const rounded = Number(value.toFixed(digits));
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function describeUnchosenPath(item: HistoryItem | undefined, language: Language) {
  if (!item) {
    return language === "zh" ? "另一条未选择路径" : "the unchosen path";
  }

  const type = item.decisionType.toLowerCase();
  if (/boundary|rule|negotiate|system|truth|direct/.test(type)) {
    return language === "zh"
      ? "更柔和地维持关系、先承担一部分成本"
      : "absorbing more of the cost first to preserve social ease";
  }
  if (/relationship|avoid|peace|defer|accept|help/.test(type)) {
    return language === "zh"
      ? "更早说出边界，把真实取舍摆到桌面上"
      : "naming the boundary earlier and making the trade-off explicit";
  }
  if (/risk|bold|public|challenge/.test(type)) {
    return language === "zh"
      ? "选择更稳、更私下的处理方式"
      : "taking the quieter, lower-exposure route";
  }
  return language === "zh"
    ? "选择你当时想到、但最后没有执行的另一个做法"
    : "taking the choice you considered but did not take";
}

function extractGroundingLens(groundedContext: string, language: Language) {
  if (!groundedContext.trim()) {
    return "";
  }

  const lines = groundedContext
    .split(/\r?\n/)
    .map((item) => item.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);
  const focus = safeBlueprintText(lines.find((item) => item.startsWith("Relationship focus:"))?.replace("Relationship focus:", ""), 90);
  const tensions = safeBlueprintText(lines.find((item) => item.startsWith("Relation types:"))?.replace("Relation types:", ""), 90);
  const hypothesis = safeBlueprintText(lines.find((item) => item.startsWith("Hypothesis:"))?.replace("Hypothesis:", ""), 110);
  const pressure = safeBlueprintText(lines.find((item) => item.startsWith("Pressure point:"))?.replace("Pressure point:", ""), 110);
  const trace = safeBlueprintText(lines.find((item) => item.startsWith("Behavioral trace summary:"))?.replace("Behavioral trace summary:", ""), 120);

  const parts = [
    focus ? (language === "zh" ? `关系焦点 ${focus}` : `relationship focus ${focus}`) : "",
    tensions ? (language === "zh" ? `张力 ${tensions}` : `tensions ${tensions}`) : "",
    hypothesis ? (language === "zh" ? `决策假设 ${hypothesis}` : `decision hypothesis ${hypothesis}`) : "",
    pressure ? (language === "zh" ? `压力点 ${pressure}` : `pressure point ${pressure}`) : "",
    trace ? (language === "zh" ? `已有轨迹 ${trace}` : `trace pattern ${trace}`) : ""
  ].filter(Boolean).slice(0, 3);

  if (!parts.length) {
    return "";
  }

  return language === "zh"
    ? `Grounding lens：这次试走会参考 ${parts.join("；")}。`
    : `Grounding lens: this rehearsal uses ${parts.join("; ")}.`;
}

function buildSecondRunRule(report: ReturnType<typeof buildRunReport>, alternative: string, language: Language) {
  const primaryMode = report?.primaryMode ?? "mixed-risk";
  const primarySoul = report?.primarySoul ?? "COG";
  const lowest = report?.lowestMeter ?? 50;

  return language === "zh"
    ? `第二轮启发规则：当 ${primaryMode} 再出现时，不要直接反着选；先把“${alternative}”当成一个小实验，并优先保护最低资源 ${lowest} 与 ${primarySoul} 相关的长期目标。`
    : `Second-run inspiration rule: when ${primaryMode} appears again, do not simply choose the opposite; treat "${alternative}" as a small experiment you can accept, reject, or adapt, while protecting the lowest meter (${lowest}) and the long-term ${primarySoul} goal.`;
}

function buildReflectionToReplayLoop(language: Language) {
  return language === "zh"
    ? [
        "人先完成第一轮真实游戏。",
        "系统固定第一轮出现过的同一批卡片。",
        "clone 根据已形成的个人决策模式逐题作答。",
        "系统计算 clone 选择与真人选择的一致性分数，并标出错配类别。",
        "真人带着这个相似度报告进入第二轮，而不是被 clone 直接替代。"
      ]
    : [
        "The human completes the first real run.",
        "The system freezes the exact same cards from round one.",
        "The clone answers each same-question card from the learned decision pattern.",
        "The system computes human-clone choice agreement and highlights mismatch categories.",
        "The human uses that similarity report as second-run support, not as a replacement for judgment."
      ];
}

const resourceKeys: ResourceKey[] = ["faith", "people", "military", "wealth"];
const cloneTraceBoundary = "uses only the first-run trace";

function nextResourceKey(key: ResourceKey): ResourceKey {
  return resourceKeys[(resourceKeys.indexOf(key) + 1) % resourceKeys.length];
}

function formatEffectList(effects: Partial<Record<ResourceKey, number>>, language: Language) {
  const values = resourceKeys
    .map((key) => ({ key, value: effects[key] ?? 0 }))
    .filter(({ value }) => value !== 0)
    .map(({ key, value }) => `${key} ${signedNumber(value)}`);

  if (!values.length) {
    return language === "zh" ? "资源变化不明显" : "no major meter shift";
  }

  return values.join(language === "zh" ? "，" : ", ");
}

function extractImitationBasis(report: ReturnType<typeof buildRunReport>, groundedContext: string, language: Language) {
  return [
    report?.primaryMode ? (language === "zh" ? `第一轮主要模式：${report.primaryMode}` : `round-one mode: ${report.primaryMode}`) : "",
    report?.primarySoul ? `SOUL: ${report.primarySoul}` : "",
    language === "zh" ? "第一轮游戏轨迹" : "first-run gameplay trace"
  ].filter(Boolean).slice(0, 3);
}

function mostCommonDirection(items: HistoryItem[], fallback: Direction): Direction {
  const counts = new Map<Direction, number>();
  for (const item of items) {
    counts.set(item.direction, (counts.get(item.direction) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? fallback;
}

function predictCloneDirection(item: HistoryItem, evidence: HistoryItem[], fallback: Direction) {
  const scores = new Map<Direction, number>();
  for (const direction of ["left", "right", "up", "down"] as Direction[]) {
    scores.set(direction, 0);
  }

  for (const sample of evidence) {
    let weight = 0.5;
    if (sample.decisionType === item.decisionType) weight += 3;
    if (sample.riskLevel === item.riskLevel) weight += 2;
    if (sample.targetMeter === item.targetMeter) weight += 1.5;
    if (sample.cardDomain && sample.cardDomain === item.cardDomain) weight += 1;
    scores.set(sample.direction, (scores.get(sample.direction) ?? 0) + weight);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  const runnerUp = ranked[1];
  const direction = best && best[1] > 0 ? best[0] : fallback;
  const margin = Math.max(0, (best?.[1] ?? 0) - (runnerUp?.[1] ?? 0));
  const confidence = Math.min(0.92, Math.max(0.42, 0.48 + margin / 10));

  return { direction, confidence };
}

function buildCloneReplay(
  record: GameRecord,
  report: ReturnType<typeof buildRunReport>,
  language: Language
): CloneReplaySummary {
  const now = new Date().toISOString();
  const history = record.history;
  const fallback = mostCommonDirection(history, history[0]?.direction ?? "left");
  const choices = history.map((item, index) => {
    const evidence = history.filter((_sample, sampleIndex) => sampleIndex !== index);
    const prediction = predictCloneDirection(item, evidence, fallback);
    const matched = prediction.direction === item.direction;
    return {
      card_id: item.cardId,
      card_domain: item.cardDomain,
      card_prompt: item.cardPrompt,
      card_prompt_zh: item.cardPromptZh,
      human_direction: item.direction,
      clone_direction: prediction.direction,
      human_choice: item.optionText,
      human_choice_zh: item.optionTextZh,
      matched,
      confidence: Number(prediction.confidence.toFixed(2)),
      decision_type: item.decisionType,
      risk_level: item.riskLevel,
      target_meter: item.targetMeter,
      failure_modes: item.failureModes,
      rationale: language === "zh"
        ? `clone 根据同类 ${item.decisionType}、${item.riskLevel} 风险和 ${item.targetMeter} 资源的第一轮模式预测。`
        : `The clone predicts from round-one patterns with similar ${item.decisionType}, ${item.riskLevel} risk, and ${item.targetMeter} pressure.`
    };
  });

  const matchedChoices = choices.filter((choice) => choice.matched).length;
  const total = Math.max(choices.length, 1);
  const similarityScore = matchedChoices / total;
  const mismatchCategories = choices
    .filter((choice) => !choice.matched)
    .reduce<Record<string, number>>((acc, choice) => {
      const keys = [
        choice.card_domain,
        choice.decision_type,
        choice.risk_level,
        ...(choice.failure_modes ?? [])
      ].filter(Boolean) as string[];
      for (const key of keys.slice(0, 4)) {
        acc[key] = (acc[key] ?? 0) + 1;
      }
      return acc;
    }, {});
  const mismatchText = Object.entries(mismatchCategories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, value]) => `${key} ${value}`)
    .join(language === "zh" ? "，" : ", ");
  const primaryMode = report?.primaryMode ?? "mixed-risk";
  const explanation = language === "zh"
    ? `clone 已重放第一轮完全相同的 ${choices.length} 张卡，一致 ${matchedChoices} 张，相似度 ${Math.round(similarityScore * 100)}%。${mismatchText ? `主要错配集中在：${mismatchText}。` : "本轮没有明显错配类别。"} 这说明 clone 对你的 ${primaryMode} 模式有一定拟合，但错配处更适合作为第二轮反思入口。`
    : `The clone replayed the exact same ${choices.length} round-one cards, matching ${matchedChoices} choices for ${Math.round(similarityScore * 100)}% similarity. ${mismatchText ? `Main mismatches: ${mismatchText}.` : "No clear mismatch category dominated."} This means the clone fits your ${primaryMode} pattern partially; mismatches are the best second-run reflection targets.`;

  return {
    protocol: "rewindai.clone_same_question_replay",
    source_session_id: record.sessionId,
    total_questions: choices.length,
    matched_choices: matchedChoices,
    similarity_score: Number(similarityScore.toFixed(4)),
    similarity_percent: Math.round(similarityScore * 100),
    choices,
    mismatch_categories: mismatchCategories,
    explanation,
    created_at: record.reflection?.clone_replay?.created_at ?? now,
    updated_at: now
  };
}

function buildAsIfDecisionSimulation(
  record: GameRecord,
  report: ReturnType<typeof buildRunReport>,
  reflection: string,
  language: Language,
  groundedContext = ""
) {
  const top = report?.topCards[0]?.item;
  const attemptedChoice = safeBlueprintText(reflection, 180) || describeUnchosenPath(top, language);
  const originalChoice = top ? (language === "zh" ? top.optionTextZh ?? top.optionText : top.optionText) : "";
  const originalEffects = top?.effects ?? {};
  const protectedMeter =
    resourceKeys.find((key) => (originalEffects[key] ?? 0) < 0)
    ?? top?.targetMeter
    ?? resourceKeys.find((key) => record.finalState.meters[key] === lowestMeter(record))
    ?? "faith";
  const shiftedMeter = nextResourceKey(protectedMeter);
  const originalCost = Math.abs(originalEffects[protectedMeter] ?? 8);
  const protectedGain = Math.max(4, Math.round(originalCost * 0.6));
  const shiftedCost = -Math.max(4, Math.round(originalCost * 0.45));
  const simulatedEffects: Partial<Record<ResourceKey, number>> = {
    [protectedMeter]: protectedGain,
    [shiftedMeter]: shiftedCost
  };
  const effectsText = formatEffectList(simulatedEffects, language);
  const simulatedOutcome = language === "zh"
    ? `As-if decision simulation / Clone-as-user simulation：clone 在 ${top?.cardId ?? "第一轮高摩擦情境"} 中，不再执行“${originalChoice || "原选择"}”，而是模仿用户试走“${attemptedChoice}”。Simulated alternative outcome：${effectsText}；它可能减轻 ${protectedMeter} 上的直接压力，但把成本转移到 ${shiftedMeter}，所以这不是更正确的答案，而是一条可观察的替代路径。`
    : `As-if decision simulation / Clone-as-user simulation: on ${top?.cardId ?? "the highest-friction first-run moment"}, the clone does not repeat "${originalChoice || "the original choice"}"; it imitates the user and tries "${attemptedChoice}". Simulated alternative outcome: ${effectsText}; it may reduce direct pressure on ${protectedMeter}, but shifts cost toward ${shiftedMeter}, so this is not a more correct answer, only an observable alternative path.`;

  return {
    source_card_id: top?.cardId,
    source_card_domain: top?.cardDomain,
    original_choice: originalChoice || (language === "zh" ? "原选择" : "the original choice"),
    attempted_choice: attemptedChoice,
    imitation_basis: extractImitationBasis(report, groundedContext, language),
    simulated_effects: simulatedEffects,
    simulated_outcome: simulatedOutcome
  };
}

function buildCounterfactualRehearsal(
  record: GameRecord | undefined,
  report: ReturnType<typeof buildRunReport>,
  reflection: string,
  language: Language,
  groundedContext = ""
) {
  if (!record || !report) {
    return language === "zh"
      ? "先完成第一轮；clone 会重放同一批卡片并逐题预测你的选择，再给出人-clone 相似度。"
      : "Finish a first run; the clone will replay the same cards, predict your choices, and report human-clone similarity.";
  }

  const cloneReplay = buildCloneReplay(record, report, language);
  const groundingLens = extractGroundingLens(groundedContext, language);
  const note = safeBlueprintText(reflection, 220);

  return language === "zh"
    ? `同题 clone replay：${cloneReplay.explanation}${groundingLens ? ` ${groundingLens}` : ""}${note ? ` 你的反思备注：${note}` : ""} 第二轮建议：优先观察 clone 错配最多的类别，不要直接照抄 clone。`
    : `Same-question clone replay: ${cloneReplay.explanation}${groundingLens ? ` ${groundingLens}` : ""}${note ? ` Your reflection note: ${note}` : ""} Second-run suggestion: watch the categories where the clone mismatched most; do not simply copy the clone.`;
}

function buildCounterfactualReflection(
  record: GameRecord | undefined,
  report: ReturnType<typeof buildRunReport>,
  reflection: string,
  language: Language,
  groundedContext = ""
): CounterfactualReflection | null {
  if (!record || !report) {
    return null;
  }

  const top = report.topCards[0]?.item;
  const unchosenOption = language === "zh" ? "同题 clone replay" : "same-question clone replay";
  const now = new Date().toISOString();
  const cloneReplay = buildCloneReplay(record, report, language);
  const topMismatch = cloneReplay.choices.find((choice) => !choice.matched);
  const simulation = buildAsIfDecisionSimulation(record, report, topMismatch?.card_id ?? describeUnchosenPath(top, language), language, groundedContext);

  return {
    protocol: "rewindai.counterfactual_reflection",
    evidence_boundary: "same_question_clone_replay",
    simulation_role: "clone_replays_same_questions_for_similarity",
    reflection_to_replay_loop: buildReflectionToReplayLoop(language),
    source_session_id: record.sessionId,
    source_run_started_at: record.startedAt,
    user_reflection: safeBlueprintText(reflection, 500) || (language === "zh" ? "查看 clone 同题相似度后进入第二轮。" : "Reviewing same-question clone similarity before round two."),
    unchosen_option: unchosenOption,
    simulated_choice: {
      source_card_id: topMismatch?.card_id ?? simulation.source_card_id,
      source_card_domain: topMismatch?.card_domain ?? simulation.source_card_domain,
      original_choice: topMismatch?.human_choice ?? simulation.original_choice,
      attempted_choice: topMismatch?.clone_direction ?? simulation.attempted_choice,
      imitation_basis: [...extractImitationBasis(report, groundedContext, language), language === "zh" ? "同题选择一致性" : "same-question choice agreement"]
    },
    simulated_effects: simulation.simulated_effects,
    simulated_outcome: cloneReplay.explanation,
    clone_rehearsal: buildCounterfactualRehearsal(record, report, reflection, language, groundedContext),
    second_run_rule: language === "zh"
      ? `第二轮启发规则：优先关注 clone 没有猜中的类别（${Object.keys(cloneReplay.mismatch_categories).slice(0, 3).join(" / ") || "暂无明显类别"}），把它当成“我可能和模型不一致的地方”，而不是把 clone 当答案。`
      : `Second-run rule: focus on categories the clone did not predict (${Object.keys(cloneReplay.mismatch_categories).slice(0, 3).join(" / ") || "no dominant category"}), treating them as model-human disagreement points rather than clone answers.`,
    clone_replay: cloneReplay,
    created_at: record.reflection?.created_at ?? now,
    updated_at: now
  };
}

function buildCloneProtocolNote(groundedContext: string, language: Language) {
  return language === "zh"
    ? "流程：1. 第一轮使用公共随机校园题库；2. 固定第一轮完整卡片轨迹；3. clone 对同一批卡逐题作答；4. 系统计算与真人选择的一致率；5. 错配类别成为第二轮反思入口。"
    : "Flow: 1. round one uses the public random campus deck; 2. freeze the full first-run card trace; 3. the clone answers the same cards; 4. the system computes human-clone agreement; 5. mismatch categories guide round-two reflection.";
}

function buildCloneOpening(record: GameRecord | undefined, groundedContext: string, language: Language) {
  const report = buildRunReport(record, language);
  if (!record || !report) {
    return language === "zh"
      ? "我会在你完成第一轮后，根据这轮游戏轨迹帮你复盘。先去玩一轮，我们再看哪些选择模式最需要调整。"
      : "I will review your first run after you play it, using the gameplay trace. Finish one run first, then we can decide what to change.";
  }

  const contextHint = language === "zh"
    ? "我只使用你的第一轮游戏轨迹，不使用自传或图谱来改变题目。"
    : `I use only your first-run gameplay trace (${cloneTraceBoundary}); biography or graph data does not change the cards.`;

  return language === "zh"
    ? `${contextHint} 第一轮里，最突出的模式是 ${report.primaryMode}，SOUL 轴偏向 ${report.primarySoul}。我会重放同一批卡片并逐题预测你的选择，再用一致率告诉你：clone 哪些地方像你、哪些地方不像你。`
    : `${contextHint} In round one, the strongest pattern is ${report.primaryMode}, with SOUL emphasis on ${report.primarySoul}. I will replay the same cards, predict your choices one by one, and use agreement to show where the clone resembles you and where it breaks down.`;
}

function buildCloneReply(question: string, record: GameRecord | undefined, groundedContext: string, language: Language, reflection = "") {
  const report = buildRunReport(record, language);
  if (!record || !report) {
    return buildCloneOpening(record, groundedContext, language);
  }

  const top = report.topCards[0]?.item;
  const askedAboutNext = /next|again|第二|下一|再玩|replay/i.test(question);
  const askedAboutMistake = /wrong|mistake|error|错|问题|失误|哪里/i.test(question);
  const askedAboutAlternative = /alternative|counterfactual|unchosen|did not|didn't|almost|similar|score|agreement|另一个|反事实|没选|没有做|差点|如果|相似|一致|分数/i.test(question);

  if (reflection.trim() || askedAboutAlternative) {
    return buildCounterfactualRehearsal(record, report, reflection || question, language, groundedContext);
  }

  if (askedAboutMistake && top) {
    return language === "zh"
      ? `最值得复盘的是 ${top.cardId}（${top.cardDomain ?? "Unknown"}）：你选择了“${top.optionTextZh ?? top.optionText}”，负面影响主要落在 ${Object.entries(top.effects).filter(([, value]) => (value ?? 0) < 0).map(([key]) => key).join("、") || "整体平衡"}。我会把它看成 ${top.failureModes?.join(" / ") ?? "mixed-risk"}，不是道德评判，而是下一轮要提前识别的触发器。`
      : `The clearest review point is ${top.cardId} (${top.cardDomain ?? "Unknown"}): you chose "${top.optionText}", and the cost landed mostly on ${Object.entries(top.effects).filter(([, value]) => (value ?? 0) < 0).map(([key]) => key).join(", ") || "overall balance"}. I would mark it as ${top.failureModes?.join(" / ") ?? "mixed-risk"}: not a moral judgment, just a trigger to notice earlier next time.`;
  }

  if (askedAboutNext) {
    return language === "zh"
      ? `第二轮策略：遇到 high risk 先停一拍，问自己“这是短期止痛还是长期边界？”；遇到 ${report.primarySoul} 类卡片时，把选择说成一句可执行规则。比如：先保最低资源，不用完美答案换取暂时安静。`
      : `Second-run strategy: when a card is high risk, pause and ask, "Is this short-term pain relief or a long-term boundary?" For ${report.primarySoul}-heavy cards, turn the choice into one executable rule: protect the lowest meter first, and do not trade a clean long-term boundary for temporary quiet.`;
  }

  return language === "zh"
    ? `我的建议是：先看同题相似度，而不是让 clone 直接替你决定。你可以写一句自己的观察，例如“clone 没猜中的地方让我想到……”，然后开始第二轮。`
    : `My suggestion: look at same-question similarity first, rather than letting the clone decide for you. You can write one observation, such as "where the clone missed me, I noticed...", then start round two.`;
}

function recordFromState(state: GameState, language: Language): GameRecord {
  const now = new Date().toISOString();
  return {
    sessionId: state.sessionId,
    rulerName: state.rulerName,
    language,
    startedAt: state.initialSnapshot.initializedAt,
    updatedAt: now,
    initialSnapshot: state.initialSnapshot,
    finalState: {
      meters: state.meters,
      yearsInPower: state.yearsInPower,
      year: state.year,
      ended: state.ended,
      ending: state.ending,
      endingZh: state.endingZh
    },
    history: state.history
  };
}

function CloneAdvisorPanel({
  currentState,
  groundedContext,
  language,
  records,
  onClose,
  studyGroup,
  onSaveReflection,
  onSaveSelfReflection,
  onRequestGeneralReflection,
  onStartReplay
}: {
  currentState: GameState | null;
  groundedContext: string;
  language: Language;
  records: GameRecord[];
  onClose: () => void;
  studyGroup: StudyGroup;
  onSaveReflection: (record: GameRecord, reflection: CounterfactualReflection) => void | Promise<void>;
  onSaveSelfReflection: (record: GameRecord, text: string) => void | Promise<void>;
  onRequestGeneralReflection: (record: GameRecord) => Promise<string>;
  onStartReplay: () => void;
}) {
  const firstRecord = records[0] ?? (currentState ? recordFromState(currentState, language) : undefined);
  const report = buildRunReport(firstRecord, language);
  const [messages, setMessages] = useState<Array<{ role: "clone" | "user"; text: string }>>([
    { role: "clone", text: buildCloneOpening(firstRecord, groundedContext, language) }
  ]);
  const [draft, setDraft] = useState("");
  const [reflectionDraft, setReflectionDraft] = useState("");
  const [reflectionStatus, setReflectionStatus] = useState("");
  const [generalReflection, setGeneralReflection] = useState(firstRecord?.generalReflection?.text ?? "");
  const [generalWorking, setGeneralWorking] = useState(false);

  async function saveReflection() {
    const reflection = buildCounterfactualReflection(firstRecord, report, reflectionDraft, language, groundedContext);
    if (!firstRecord || !reflection) {
      return false;
    }

    try {
      await onSaveReflection(firstRecord, reflection);
      setReflectionStatus(language === "zh" ? "已保存 clone 同题 replay 与相似度。" : "Clone same-question replay and similarity saved.");
      return true;
    } catch {
      setReflectionStatus(language === "zh" ? "保存失败，请稍后再试。" : "Save failed. Please try again.");
      return false;
    }
  }

  function send() {
    const question = draft.trim();
    if (!question) {
      return;
    }
    if (reflectionDraft.trim()) {
      void saveReflection();
    }
    setMessages((items) => [
      ...items,
      { role: "user", text: question },
      { role: "clone", text: buildCloneReply(question, firstRecord, groundedContext, language, reflectionDraft) }
    ]);
    setDraft("");
  }

  async function saveSelfReflectionAndReplay() {
    if (!firstRecord || !reflectionDraft.trim()) {
      setReflectionStatus(language === "zh" ? "请先写下自己的反思。" : "Write your reflection first.");
      return;
    }
    await onSaveSelfReflection(firstRecord, reflectionDraft);
    setReflectionStatus(language === "zh" ? "自我反思已保存。" : "Self-reflection saved.");
    onStartReplay();
  }

  async function requestContrastReflection() {
    if (!firstRecord) return;
    try {
      setGeneralWorking(true);
      const result = await onRequestGeneralReflection(firstRecord);
      setGeneralReflection(result);
      setReflectionStatus(language === "zh" ? "通用 AI 反思已保存。" : "General AI reflection saved.");
    } catch (err) {
      setReflectionStatus(err instanceof Error ? err.message : "Unable to create reflection.");
    } finally {
      setGeneralWorking(false);
    }
  }

  if (studyGroup !== "experiment" && studyGroup !== "anonymous") {
    const isBlank = studyGroup === "blank";
    return (
      <section className="advisor-overlay" aria-label="Reflection panel">
        <div className="advisor-panel">
          <header className="advisor-header">
            <div>
              <strong>{isBlank ? (language === "zh" ? "自我反思" : "Self Reflection") : (language === "zh" ? "通用 AI 反思" : "General AI Reflection")}</strong>
              <span>
                {isBlank
                  ? (language === "zh" ? "Group 1 · 不使用 AI 或个人画像" : "Group 1 · no AI or personal profile")
                  : (language === "zh" ? "Group 2 · 只基于游戏报告，不读取自传/图谱" : "Group 2 · game report only, no biography/graph")}
              </span>
            </div>
            <button type="button" onClick={onClose}>{text[language].close}</button>
          </header>
          <div className="advisor-layout">
            <section className="advisor-report">
              <h2>{language === "zh" ? "第一轮报告" : "Round-one report"}</h2>
              {!report && <p>{language === "zh" ? "完成第一轮后再回来反思。" : "Finish the first run before reflecting."}</p>}
              {report && (
                <>
                  <div className="report-kpis">
                    <span>{language === "zh" ? "决策" : "Decisions"} <strong>{report.decisions}</strong></span>
                    <span>High risk <strong>{report.highRiskCount}</strong></span>
                    <span>{language === "zh" ? "负面冲击" : "Negative impact"} <strong>{report.negativeImpact}</strong></span>
                    <span>{language === "zh" ? "最低资源" : "Lowest meter"} <strong>{report.lowestMeter}</strong></span>
                  </div>
                  <h3>{isBlank ? (language === "zh" ? "写下自己的总结" : "Write your own summary") : (language === "zh" ? "通用 AI 总结" : "General AI summary")}</h3>
                  {isBlank ? (
                    <textarea
                      className="reflection-box"
                      value={reflectionDraft}
                      placeholder={language === "zh" ? "写下：我第一轮最想调整的是……第二轮我会尝试……" : "Write: what I want to adjust from round one is... In round two I will try..."}
                      onChange={(event) => setReflectionDraft(event.target.value)}
                    />
                  ) : (
                    <>
                      <button className="blueprint-button" type="button" disabled={generalWorking} onClick={requestContrastReflection}>
                        {generalWorking ? "..." : language === "zh" ? "生成通用 AI 反思" : "Generate general AI reflection"}
                      </button>
                      {generalReflection && <article className="counterfactual-card"><span>{generalReflection}</span></article>}
                    </>
                  )}
                  {reflectionStatus && <p className="reflection-status">{reflectionStatus}</p>}
                  <button
                    className="blueprint-button"
                    type="button"
                    onClick={() => {
                      if (isBlank) {
                        void saveSelfReflectionAndReplay();
                      } else {
                        onStartReplay();
                      }
                    }}
                  >
                    {language === "zh" ? "开始第二轮" : "Start second run"}
                  </button>
                </>
              )}
            </section>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="advisor-overlay" aria-label="Clone advisor">
      <div className="advisor-panel">
        <header className="advisor-header">
          <div>
            <strong>
              {studyGroup === "anonymous"
                ? language === "zh" ? "体验反思" : "Experience Reflection"
                : language === "zh" ? "Clone 决策助手" : "Clone Decision Advisor"}
            </strong>
            <span>
              {studyGroup === "anonymous"
                ? language === "zh" ? "本次体验 · 不上传研究轨迹" : "this-session experience · no study trace upload"
                : language === "zh" ? "同题 replay · 相似度分数 · 两轮决策辅助" : "same-question replay · similarity score · two-round support"}
            </span>
          </div>
          <button type="button" onClick={onClose}>{text[language].close}</button>
        </header>

        <div className="advisor-layout">
          <section className="advisor-report">
            <h2>{language === "zh" ? "第一轮信号" : "Round-one signal"}</h2>
            <article className="counterfactual-card clone-protocol-card">
              <strong>{language === "zh" ? "Clone 模仿协议" : "Clone imitation protocol"}</strong>
              <span>{buildCloneProtocolNote(groundedContext, language)}</span>
            </article>
            <article className="counterfactual-card">
              <strong>{language === "zh" ? "Reflection -> replay 链路" : "Reflection-to-replay loop"}</strong>
              <span>{buildReflectionToReplayLoop(language).join(language === "zh" ? " " : " ")}</span>
            </article>
            {!report && <p>{language === "zh" ? "完成第一轮游戏后，这里会出现 clone 复盘。" : "Finish the first run to unlock clone review."}</p>}
            {report && (
              <>
                <div className="report-kpis">
                  <span>{language === "zh" ? "决策" : "Decisions"} <strong>{report.decisions}</strong></span>
                  <span>High risk <strong>{report.highRiskCount}</strong></span>
                  <span>{language === "zh" ? "负面冲击" : "Negative impact"} <strong>{report.negativeImpact}</strong></span>
                  <span>{language === "zh" ? "最低资源" : "Lowest meter"} <strong>{report.lowestMeter}</strong></span>
                </div>
                <h3>{language === "zh" ? "最容易出错的卡" : "Highest-friction cards"}</h3>
                <div className="friction-list">
                  {report.topCards.map(({ item, score }) => (
                    <article key={`${item.cardId}-${item.at}`}>
                      <strong>{item.cardId} · {item.cardDomain}</strong>
                      <span>{language === "zh" ? item.cardPromptZh ?? item.cardPrompt : item.cardPrompt}</span>
                      <small>{language === "zh" ? item.optionTextZh ?? item.optionText : item.optionText} · score {score}</small>
                    </article>
                  ))}
                </div>
                <h3>SOUL / failure modes</h3>
                <div className="blueprint-chips">
                  {report.sortedSoul.map(([key, value]) => <span key={key}>{key}: {value}</span>)}
                  {report.sortedModes.slice(0, 4).map(([key, value]) => <span key={key}>{key}: {value}</span>)}
                </div>
                <h3>{language === "zh" ? "Clone 同题相似度" : "Clone same-question similarity"}</h3>
                <article className="counterfactual-card">
                  <strong>{language === "zh" ? "Human-clone agreement" : "Human-clone agreement"}</strong>
                  <span>{buildCloneReplay(firstRecord, report, language).explanation}</span>
                </article>
                <div className="friction-list compact">
                  {buildCloneReplay(firstRecord, report, language).choices.filter((choice) => !choice.matched).slice(0, 4).map((choice) => (
                    <article key={`${choice.card_id}-${choice.clone_direction}`}>
                      <strong>{choice.card_id} · {choice.card_domain ?? "campus"} · {language === "zh" ? "错配" : "mismatch"}</strong>
                      <span>{language === "zh" ? choice.card_prompt_zh ?? choice.card_prompt : choice.card_prompt}</span>
                      <small>{language === "zh" ? "真人" : "human"}: {choice.human_direction} · clone: {choice.clone_direction}</small>
                    </article>
                  ))}
                </div>
                <h3>{language === "zh" ? "你的反思备注（可选）" : "Your reflection note (optional)"}</h3>
                <textarea
                  className="reflection-box"
                  value={reflectionDraft}
                  placeholder={language === "zh"
                    ? "写下：clone 没猜中的地方让我想到……第二轮我想特别观察……"
                    : "Write: where the clone missed me, I noticed... In round two I want to watch..."}
                  onChange={(event) => setReflectionDraft(event.target.value)}
                  onBlur={() => {
                    if (reflectionDraft.trim()) {
                      void saveReflection();
                    }
                  }}
                />
                {reflectionStatus && <p className="reflection-status">{reflectionStatus}</p>}
                <article className="counterfactual-card">
                  <strong>{language === "zh" ? "Clone replay 说明" : "Clone replay explanation"}</strong>
                  <span>{buildCounterfactualRehearsal(firstRecord, report, reflectionDraft, language, groundedContext)}</span>
                </article>
              </>
            )}
            <button
              className="blueprint-button"
              type="button"
              title="Start assisted replay"
              aria-label="Start assisted replay"
              disabled={!report}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                void (async () => {
                  const saved = await saveReflection();
                  if (saved) {
                    onStartReplay();
                  }
                })();
              }}
            >
              {language === "zh" ? "保存相似度并开始第二轮" : "Save similarity and start round two"}
            </button>
          </section>

          <section className="clone-chat">
            <div className="clone-thread">
              {messages.map((message, index) => (
                <p className={message.role === "clone" ? "clone-message" : "user-message"} key={`${message.role}-${index}`}>
                  {message.text}
                </p>
              ))}
            </div>
            <div className="clone-input">
              <input
                value={draft}
                placeholder={language === "zh" ? "问 clone：哪些题你和我不一致？" : "Ask the clone: where did you disagree with me?"}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    send();
                  }
                }}
              />
              <button type="button" onClick={send}>{language === "zh" ? "发送" : "Send"}</button>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function RecordsPanel({ records, language, onClose }: { records: GameRecord[]; language: Language; onClose: () => void }) {
  const t = text[language];
  const [selectedId, setSelectedId] = useState(records[0]?.sessionId ?? "");
  const selected = records.find((record) => record.sessionId === selectedId) ?? records[0];
  const selectedReport = buildRunReport(selected, language);
  const comparison = compareRecords(records, language);

  return (
    <section className="records-overlay" aria-label={t.records}>
      <div className="records-panel">
        <header className="records-header">
          <div>
            <strong>{t.runReport}</strong>
            <span>{language === "zh" ? "选择、结果、资源变化与失败类别" : "Choices, outcomes, meter shifts, and failure categories"}</span>
          </div>
          <button type="button" onClick={onClose}>{t.continueToReflection}</button>
        </header>
        <p className="records-next-step">{t.reportNextStep}</p>

        {records.length === 0 && <p className="empty-records">{t.noRecords}</p>}

        {records.length > 0 && (
          <div className="records-layout">
            <div className="records-list">
              {records.map((record) => (
                <button
                  className={record.sessionId === selected?.sessionId ? "record-item is-selected" : "record-item"}
                  key={record.sessionId}
                  onClick={() => setSelectedId(record.sessionId)}
                  type="button"
                >
                  <strong>{record.rulerName}</strong>
                  <span>{record.history.length} {t.decisions} · {isCompletedRun(record) ? "complete" : record.finalState.ended ? "ended" : "active"}</span>
                  <small>{formatDate(record.updatedAt)}</small>
                </button>
              ))}
            </div>

            {selected && (
              <article className="record-detail">
                <section className="run-summary-card">
                  <div>
                    <span className="report-eyebrow">{t.runEnded}</span>
                    <h2>{selected.rulerName}</h2>
                    <p>{displayEnding(selected, language)}</p>
                  </div>
                  <div className="report-kpis">
                    <span>{t.decisionsBeforeEnding} <strong>{selected.history.length}</strong></span>
                    <span>{t.finalMeters} <strong>{lowestMeter(selected)}</strong></span>
                    <span>{language === "zh" ? "状态" : "Status"} <strong>{isCompletedRun(selected) ? "complete" : selected.finalState.ended ? "ended early" : "active"}</strong></span>
                    <span>{t.updatedAt} <strong>{formatDate(selected.updatedAt)}</strong></span>
                  </div>
                </section>

                {comparison && (
                  <section className="comparison-card">
                    <h2>{language === "zh" ? "最近两轮对比" : "Latest two-run comparison"}</h2>
                    <div className="report-kpis">
                      <span>{language === "zh" ? "每决策负面变化" : "Negative per decision"} <strong>{signedNumber(comparison.negativeImpactDelta, 1)}</strong></span>
                      <span>High-risk rate <strong>{signedNumber(comparison.highRiskDelta * 100, 1)}%</strong></span>
                      <span>{language === "zh" ? "最低资源变化" : "Lowest meter delta"} <strong>{signedNumber(comparison.lowestMeterDelta)}</strong></span>
                      <span>{language === "zh" ? "完成状态" : "Completion"} <strong>{comparison.latestCompleted ? "complete" : "ended early"}</strong></span>
                    </div>
                    <p>
                      {language === "zh"
                        ? `第一轮主要问题：${comparison.previousReport.primaryMode}；第二轮主要问题：${comparison.latestReport.primaryMode}。`
                        : `Round-one primary issue: ${comparison.previousReport.primaryMode}; round-two primary issue: ${comparison.latestReport.primaryMode}.`}
                    </p>
                    {comparison.previous.reflection && (
                      <>
                        <div className="counterfactual-card">
                          <strong>{language === "zh" ? "Clone 反事实启发" : "Clone counterfactual inspiration"}</strong>
                          <span>{comparison.previous.reflection.clone_replay?.explanation ?? comparison.previous.reflection.simulated_outcome ?? comparison.previous.reflection.clone_rehearsal}</span>
                        </div>
                        <div className="counterfactual-card">
                          <strong>{language === "zh" ? "Clone 模拟角色" : "Clone simulation role"}</strong>
                          <span>
                            {comparison.previous.reflection.simulation_role === "clone_replays_same_questions_for_similarity"
                              ? language === "zh"
                                ? "clone 重放第一轮完全相同的题并逐题作答；一致率用于说明模拟相似度和第二轮反思入口。"
                                : "The clone replays the exact same round-one cards and answers each one; agreement explains simulation similarity and second-run reflection targets."
                              : comparison.previous.reflection.simulation_role}
                          </span>
                        </div>
                      </>
                    )}
                  </section>
                )}

                <section>
                  <h2>{t.initial}</h2>
                  <p>{t.startedAt}: {formatDate(selected.startedAt)}</p>
                  <p>{t.firstCard}: {selected.initialSnapshot.firstCardId}</p>
                  <p>{t.totalCards}: {selected.initialSnapshot.totalCards}</p>
                  <MeterLine meters={selected.initialSnapshot.meters} language={language} />
                </section>

                <section>
                  <h2>{t.finalState}</h2>
                  <MeterLine meters={selected.finalState.meters} language={language} />
                  <p>{t.endingCause}: {displayEnding(selected, language)}</p>
                </section>

                {selected.reflection && (
                  <section>
                    <h2>{language === "zh" ? "Clone 同题复盘" : "Clone Same-Question Replay"}</h2>
                    {selected.reflection.clone_replay && (
                      <>
                        <div className="counterfactual-card">
                          <strong>{language === "zh" ? "相似度分数" : "Similarity score"}</strong>
                          <span>
                            {selected.reflection.clone_replay.similarity_percent}% · {selected.reflection.clone_replay.matched_choices}/{selected.reflection.clone_replay.total_questions}
                          </span>
                        </div>
                        <div className="counterfactual-card">
                          <strong>{language === "zh" ? "说明" : "Explanation"}</strong>
                          <span>{selected.reflection.clone_replay.explanation}</span>
                        </div>
                      </>
                    )}
                    <div className="counterfactual-card">
                      <strong>{language === "zh" ? "复盘对象" : "Replay target"}</strong>
                      <span>{selected.reflection.unchosen_option}</span>
                    </div>
                    <div className="counterfactual-card">
                      <strong>{language === "zh" ? "Clone 模拟角色" : "Clone simulation role"}</strong>
                      <span>
                        {selected.reflection.simulation_role === "clone_replays_same_questions_for_similarity"
                          ? language === "zh"
                            ? "clone 模仿这个人的决策模式，重做第一轮完全相同的题，并用选择一致率说明模拟相似度。"
                            : "The clone imitates this person's decision pattern, re-answers the exact same round-one cards, and uses choice agreement as simulation similarity."
                          : selected.reflection.simulation_role}
                      </span>
                    </div>
                    <div className="counterfactual-card">
                      <strong>{language === "zh" ? "模拟结果" : "Simulation result"}</strong>
                      <span>{selected.reflection.simulated_outcome ?? selected.reflection.clone_rehearsal}</span>
                    </div>
                    {selected.reflection.simulated_choice && (
                      <div className="counterfactual-card">
                        <strong>{language === "zh" ? "代表性错配" : "Representative mismatch"}</strong>
                        <span>
                          {selected.reflection.simulated_choice.source_card_id ?? "run"}: {selected.reflection.simulated_choice.original_choice}
                          {" -> "}
                          {selected.reflection.simulated_choice.attempted_choice}
                        </span>
                      </div>
                    )}
                    {selected.reflection.clone_replay && (
                      <div className="friction-list compact">
                        {selected.reflection.clone_replay.choices.filter((choice) => !choice.matched).slice(0, 5).map((choice) => (
                          <article key={`${choice.card_id}-${choice.clone_direction}`}>
                            <strong>{choice.card_id} · {choice.card_domain ?? "campus"}</strong>
                            <span>{language === "zh" ? choice.card_prompt_zh ?? choice.card_prompt : choice.card_prompt}</span>
                            <small>{language === "zh" ? "真人" : "human"} {choice.human_direction} · clone {choice.clone_direction}</small>
                          </article>
                        ))}
                      </div>
                    )}
                    <div className="counterfactual-card">
                      <strong>{language === "zh" ? "第二轮启发" : "Second-run inspiration"}</strong>
                      <span>{selected.reflection.second_run_rule}</span>
                    </div>
                  </section>
                )}

                <section>
                  <h2>{t.decisionTrail}</h2>
                  {selectedReport && (
                    <div className="run-report-card">
                      <div className="report-kpis">
                        <span>High risk <strong>{selectedReport.highRiskCount}</strong></span>
                        <span>{language === "zh" ? "负面冲击" : "Negative impact"} <strong>{selectedReport.negativeImpact}</strong></span>
                        <span>SOUL <strong>{selectedReport.primarySoul}</strong></span>
                        <span>{language === "zh" ? "主要问题" : "Primary issue"} <strong>{selectedReport.primaryMode}</strong></span>
                      </div>
                      <h3>{language === "zh" ? "高摩擦卡片 / 失败类别" : "Highest-friction cards / failure modes"}</h3>
                      <div className="friction-list compact">
                        {selectedReport.topCards.slice(0, 4).map(({ item, score }) => (
                          <article key={`${item.cardId}-${item.at}`}>
                            <strong>{item.cardId} · {item.cardDomain} · score {score}</strong>
                            <span>{language === "zh" ? item.cardPromptZh ?? item.cardPrompt : item.cardPrompt}</span>
                            <small>{item.failureModes?.join(" / ")}</small>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="trajectory-list">
                    {selected.history.map((item, index) => (
                      <article className="trajectory-item" key={`${item.cardId}-${item.at}`}>
                        <div className="trajectory-index">{index + 1}</div>
                        <div className="trajectory-body">
                          <div className="trajectory-head">
                            <strong>{t.card}: {item.cardId}</strong>
                            <span>{item.cardDomain ?? "Unknown"} · {t.risk}: {item.riskLevel}</span>
                          </div>
                          <p className="trajectory-prompt">
                            {language === "zh" ? item.cardPromptZh ?? item.cardPrompt : item.cardPrompt}
                          </p>
                          <div className="trajectory-choice">
                            <span>{t.choice}</span>
                            <strong>{text[language].directionNames[item.direction]} · {language === "zh" ? item.optionTextZh ?? item.optionText : item.optionText}</strong>
                          </div>
                          <div className="trajectory-outcome">
                            <span>{t.outcome}</span>
                            <strong>{language === "zh" ? item.outcomeLabelZh ?? item.outcomeLabel : item.outcomeLabel}</strong>
                          </div>
                          <div className="trajectory-meters">
                            <div>
                              <span>{t.before}</span>
                              <MeterLine meters={item.metersBefore} language={language} compact />
                            </div>
                            <div>
                              <span>{t.after}</span>
                              <MeterLine meters={item.metersAfter} effects={item.effects} language={language} compact />
                            </div>
                          </div>
                          <div className="trajectory-tags">
                            <span>{t.category}: {item.decisionType}</span>
                            <span>{t.tags}: {[...(item.soulTags ?? []), ...(item.failureModes ?? [])].join(" / ") || "none"}</span>
                          </div>
                          {item.followUpScheduled && (
                            <small className="trajectory-followup">
                              {language === "zh" ? "触发后续事件" : "Follow-up scheduled"}: {item.followUpScheduled.cardId}
                            </small>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </article>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function MeterLine({
  meters,
  effects = {},
  language,
  compact = false
}: {
  meters: GameRecord["finalState"]["meters"];
  effects?: Partial<GameRecord["finalState"]["meters"]>;
  language: Language;
  compact?: boolean;
}) {
  const labels = text[language].resourceLabels;
  return (
    <div className={compact ? "meter-line compact" : "meter-line"}>
      {(["faith", "people", "military", "wealth"] as const).map((key) => {
        const delta = effects[key] ?? 0;
        return (
          <span key={key}>
            {labels[key]} {meters[key]}
            {delta !== 0 && <em className={delta > 0 ? "gain" : "loss"}>{delta > 0 ? `+${delta}` : delta}</em>}
          </span>
        );
      })}
    </div>
  );
}

export default App;
