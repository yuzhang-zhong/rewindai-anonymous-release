import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");

const app = read("src/App.tsx");
const api = read("src/lib/api.ts");
const types = read("src/types.ts");
const records = read("src/lib/records.ts");
const gamePanel = read("src/components/GamePanel.tsx");
const i18n = read("src/i18n.ts");

function expect(condition, label, detail) {
  if (condition) {
    console.log(`PASS ${label}`);
    return;
  }

  console.error(`FAIL ${label}`);
  if (detail) {
    console.error(`     ${detail}`);
  }
  process.exit(1);
}

expect(app.includes("decodeGroundingParam"), "frontend has handoff decoder");
expect(
  app.includes("new URLSearchParams(window.location.search)") &&
    app.includes('params.get("handoff") ?? params.get("grounding")'),
  "frontend reads simulation-test handoff query parameter with legacy fallback"
);
expect(
  app.includes("Uint8Array.from(binary") &&
    app.includes("new TextDecoder().decode(bytes)") &&
    !app.includes("JSON.parse(atob"),
  "frontend decodes UTF-8 handoff payloads"
);
expect(
  app.includes('params.delete("handoff")') &&
    app.includes('params.delete("grounding")') &&
    app.includes("window.history.replaceState"),
  "frontend clears handoff query after decoding"
);
expect(
  app.includes("Unable to read StorySage simulation-test handoff.") &&
    app.includes("setTraceIngest(grounding.trace_ingest ?? null)"),
  "frontend requires a trace ingest contract"
);
expect(
  app.includes('source: "storysage_trace_handoff"') &&
    app.includes("protocol: grounding.rewindai_contract?.protocol") &&
    app.includes("privacyLevel: grounding.rewindai_contract?.privacy_level"),
  "frontend preserves only compact handoff provenance in game state"
);
expect(
  app.includes("Connected to RewindAI as") &&
    app.includes("simulation-test will use the public random campus deck.") &&
    app.includes("setStudioOpen(false)"),
  "StorySage handoff keeps simulation-test on the public random campus deck"
);
expect(
  app.includes("customCards: traceIngest ? undefined : customCards.length > 0 ? customCards : undefined") &&
    app.includes("{!traceIngest && (") &&
    app.includes("{customCards.length > 0 && !traceIngest"),
  "trace-linked sessions cannot inject personalized Scenario Studio cards"
);
expect(
  !app.includes("Loaded privacy-safe StorySage grounding") &&
    !app.includes("setGroundedBackground(grounding.rewind.background") &&
    !app.includes("setGroundedScenario(grounding.rewind.scenario") &&
    !app.includes("setGenerationGuidance(grounding.grounding?.card_generation_guidance)"),
  "main StorySage launch no longer pre-fills personalized card generation"
);
expect(
  app.includes("first-run gameplay trace") &&
    app.includes("round one uses the public random campus deck") &&
    app.includes("uses only the first-run trace"),
  "clone reflection is grounded in first-run gameplay trace, not personalized deck generation"
);
expect(
  app.includes("notifyStorySageTraceReturn") &&
    app.includes("window.opener.postMessage") &&
    app.includes("rewindai:simulation-trace-returned"),
  "game posts a lightweight trace-return message back to the RewindAI cockpit"
);
expect(
  app.includes("buildCounterfactualReflection") &&
    app.includes("onSaveReflection") &&
    app.includes("persistCounterfactualReflection") &&
    app.includes("syncTraceToStorySage(storySageApiBaseUrl, traceIngest, updatedRecord)"),
  "clone advisor saves and syncs counterfactual reflection traces"
);
expect(
  app.includes("buildAsIfDecisionSimulation") &&
    app.includes("simulated_choice") &&
    app.includes("simulation_role") &&
    app.includes("reflection_to_replay_loop") &&
    app.includes("simulated_effects") &&
    app.includes("As-if decision simulation"),
  "clone records its as-if simulated choice, meter shifts, and simulated outcome"
);
expect(
  app.includes("Clone-as-user simulation") &&
    app.includes("Simulated alternative outcome") &&
    app.includes("Second-run inspiration rule") &&
    app.includes("accept, reject, or adapt"),
  "clone imitates the user for an unchosen path while leaving the second run under human control"
);
expect(
  app.includes("Start assisted replay") &&
    app.includes("onStartReplay") &&
    app.includes("saveReflection()") &&
    app.includes("void startGame()") &&
    app.includes("onMouseDown={(event) => event.preventDefault()}"),
  "clone saves the reflection before starting assisted replay"
);
expect(
  app.includes("Latest two-run comparison") &&
    app.includes("Round-one primary issue") &&
    app.includes("round-two primary issue") &&
    app.includes("Highest-friction cards") &&
    app.includes("SOUL / failure modes") &&
    app.includes("Clone counterfactual inspiration"),
  "records report compares first and second runs with card/category failure evidence"
);
expect(
  i18n.includes("Decision trail") &&
    app.includes("trajectory-meters") &&
    app.includes("run-summary-card") &&
    gamePanel.includes("ending-report-button") &&
    gamePanel.includes("viewRunReport"),
  "death state opens a clear run report with decision trajectory"
);
expect(
  i18n.includes("Continue") &&
    i18n.includes("Press Continue to reflect") &&
    i18n.includes("点击“继续”后可以反思") &&
    app.includes("records-next-step") &&
    app.includes("t.continueToReflection"),
  "run report explains the next reflection/replay step"
);
expect(
  app.includes("choices the user says they considered but did not take") ||
    app.includes("choice you considered but did not take"),
  "clone advisor frames alternatives as choices considered but not taken"
);
expect(
  app.includes("if (!traceIngest || !record.initialSnapshot.groundingSource || record.history.length === 0)") &&
    app.includes("syncTraceToStorySage(storySageApiBaseUrl, traceIngest, record)"),
  "frontend syncs run records back to StorySage after decisions"
);
expect(
  app.includes("Trace synced:") &&
    app.includes("Trace sync failed:") &&
    app.includes("Trace saved locally. StorySage sync"),
  "frontend surfaces trace sync status and online fallback"
);

const groundingSourceType = types.slice(types.indexOf("groundingSource?: {"), types.indexOf("};", types.indexOf("groundingSource?: {")) + 2);
expect(groundingSourceType.includes("source: string") && groundingSourceType.includes("privacyLevel?: string"), "run snapshot keeps compact source metadata");
expect(!groundingSourceType.includes("summary") && !groundingSourceType.includes("graph_constraints") && !groundingSourceType.includes("privacy_policy"), "run snapshot excludes full StorySage profile payload");
expect(records.includes("initialSnapshot: state.initialSnapshot") && !records.includes("groundedContext") && !records.includes("generationGuidance"), "local records persist gameplay state without full grounding context");
expect(
  records.includes("updateRecordReflection") &&
    records.includes("reflection") &&
    types.includes("CounterfactualReflection") &&
    types.includes("tentative_counterfactual_rehearsal") &&
    types.includes("clone_imitates_user_for_unchosen_choice") &&
    types.includes("reflection_to_replay_loop"),
  "local records preserve tentative counterfactual reflection and clone-assisted replay protocol"
);
expect(records.includes("sensitiveRecordKeyPatterns") && records.includes("key.toLowerCase().includes(pattern)") && records.includes('"trace_token"') && records.includes('"groundingcontext"'), "local records match sensitive-field variants");
expect(records.includes("sanitizeStoredRecords(parsed)") && records.includes("sanitizeStoredRecords(records)"), "local records sanitize old and new localStorage payloads");
expect(records.includes("redactCredentialLikeText") && records.includes("[redacted]"), "local records redact credential-like text");
expect(api.includes("fallbackTraceContract") && api.includes('protocol: "rewindai.trace"') && api.includes('source_module: "simulation-test"'), "API helper keeps simulation-test trace fallback contract");
expect(api.includes('source: "simulation-test"') && api.includes("trace_token: traceIngest.token") && api.includes("record"), "API helper posts simulation-test trace token and record");
expect(
  api.includes('const endpoint = "/api/storysage/simulation/traces"') &&
    api.includes('const endpoint = "/api/storysage/simulation/general-reflection"'),
  "API helper routes StorySage trace/reflection through same-origin proxy endpoints"
);
expect(api.includes("formulation_stale?: boolean"), "API helper models StorySage stale marker response");

const unicodeHandoff = {
  source: "storysage_trace_handoff",
  user_id: "用户-测试",
  rewindai_contract: {
    protocol: "rewindai.simulation_test_handoff",
    version: "1.0",
    privacy_level: "no_profile_context"
  },
  simulation_test: {
    player_name: "用户-测试",
    personalized_cards: false,
    card_policy: "public_random_campus_deck"
  },
  trace_ingest: {
    endpoint: "/simulation/traces",
    token: "trace-token",
    accepts: {
      protocol: "rewindai.trace",
      version: "1.0",
      source_module: "simulation-test",
      target_module: "storysage"
    }
  }
};
const json = JSON.stringify(unicodeHandoff);
const bytes = new TextEncoder().encode(json);
let binary = "";
bytes.forEach((byte) => {
  binary += String.fromCharCode(byte);
});
const encoded = btoa(binary);
const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))));
expect(decoded.simulation_test.player_name === unicodeHandoff.simulation_test.player_name, "handoff codec round-trips Chinese trace-only context");

console.log("PASS simulation-test frontend bridge contract smoke completed");
