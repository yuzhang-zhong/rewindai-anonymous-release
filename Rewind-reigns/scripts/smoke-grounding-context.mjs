import { buildGroundingDesignBrief, buildMessages } from "../server/custom-card-generator.mjs";

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

const groundingContext = [
  "Graph-derived relationship constraints:",
  "- Relationship focus: advisor, classmates",
  "- Relation types: trust, obligation",
  "Mental model draft: status=ready, confidence=medium.",
  "- Hypothesis: probe boundaries around helping others.",
  "- Pressure point: limited energy around military",
  "Behavioral trace summary: 4 decisions recorded.",
  "Counterfactual reflection goal: rehearse unchosen paths.",
  "Clone imitation protocol: imitate the grounded user before offering advice.",
  "Counterfactual outcome goal: report simulated costs and future constraints.",
  "Unchosen option prompt: ask what the user considered but did not do.",
  "Assisted replay goal: turn simulated alternatives into one second-run rule.",
  "Reflection loop step: compare first and second runs by card friction."
].join("\n");

const withContext = buildMessages({
  background: "A privacy-safe student background with competing obligations.",
  scenario: "Create campus decisions about energy, trust, and classmates.",
  groundingContext,
  count: 20,
  language: "en"
});

expect(
  withContext.system.includes("convert it into playable situations"),
  "system tells model how to use grounding context"
);
expect(
  withContext.user.includes("StorySage graph/model grounding context"),
  "user prompt includes grounding context header"
);
expect(withContext.user.includes("advisor, classmates"), "user prompt includes graph focus");
expect(withContext.user.includes("trust, obligation"), "user prompt includes relation types");
expect(withContext.user.includes("probe boundaries"), "user prompt includes mental model hypothesis");
expect(withContext.user.includes("4 decisions recorded"), "user prompt includes trace summary");
expect(withContext.user.includes("rehearse unchosen paths"), "user prompt includes counterfactual reflection goal");
expect(withContext.user.includes("imitate the grounded user before offering advice"), "user prompt includes clone imitation protocol");
expect(withContext.user.includes("report simulated costs and future constraints"), "user prompt includes counterfactual outcome goal");
expect(
  withContext.user.includes("Grounding-informed card distribution"),
  "user prompt includes grounding design brief"
);
expect(
  withContext.user.includes("at least 7 cards"),
  "grounding design brief turns graph context into card quota"
);
expect(
  withContext.user.includes("Decision-policy hypothesis: probe boundaries around helping others."),
  "grounding design brief turns hypothesis into incident constraint"
);
expect(
  withContext.user.includes("meaningful tradeoffs touching these meters: military"),
  "grounding design brief extracts affected meter"
);

const designBrief = buildGroundingDesignBrief(groundingContext, 20);
expect(designBrief.includes("Relationship roles to vary across cards: advisor, classmates."), "design brief keeps relationship roles");
expect(designBrief.includes("Relationship tensions to dramatize: trust, obligation."), "design brief keeps relation types");
expect(designBrief.includes("Design for counterfactual reflection"), "design brief requires counterfactual reflection");
expect(designBrief.includes("imitation-first"), "design brief requires clone to simulate before advising");
expect(designBrief.includes("Unchosen option prompt: ask what the user considered but did not do."), "design brief keeps unchosen option prompt");

const withStructuredGuidance = buildMessages({
  background: "A privacy-safe student background with competing obligations.",
  scenario: "Create campus decisions about energy, trust, and classmates.",
  groundingContext: "",
  generationGuidance: {
    graph_pressure_card_quota: 9,
    relationship_roles: ["advisor", "roommate"],
    relationship_tensions: ["obligation", "conflict"],
    decision_policy_incidents: ["test whether the user sets boundaries before overhelping"],
    pressure_mechanics: ["limited energy during exam week"],
    target_meters: ["military", "people"],
    risk_distribution: ["medium", "high"],
    trace_summary: "6 decisions recorded with repeated energy tradeoffs.",
    counterfactual_reflection_goal: "simulate options the user says they almost chose",
    clone_imitation_protocol: "role-play the grounded user before turning the result into advice",
    counterfactual_outcome_report_goal: "summarize likely relationship and resource consequences",
    unchosen_option_prompt: "Which choice did you consider but not make?",
    assisted_replay_goal: "convert the simulated result into one second-run experiment",
    reflection_loop_steps: ["record first run", "simulate the unchosen path", "compare round two"],
    safety_rules: ["Keep grounded claims tentative."],
    rules: ["Treat traces as tentative evidence."]
  },
  count: 25,
  language: "en"
});

expect(
  withStructuredGuidance.user.includes("at least 9 cards"),
  "structured guidance controls graph pressure quota"
);
expect(
  withStructuredGuidance.user.includes("advisor, roommate"),
  "structured guidance supplies relationship roles"
);
expect(
  withStructuredGuidance.user.includes("meaningful tradeoffs touching these meters: military, people"),
  "structured guidance supplies target meters"
);
expect(
  withStructuredGuidance.user.includes("simulate options the user says they almost chose") &&
    withStructuredGuidance.user.includes("role-play the grounded user before turning the result into advice") &&
    withStructuredGuidance.user.includes("summarize likely relationship and resource consequences") &&
    withStructuredGuidance.user.includes("Which choice did you consider but not make?") &&
    withStructuredGuidance.user.includes("one second-run experiment") &&
    withStructuredGuidance.user.includes("Reflection loop step: simulate the unchosen path"),
  "structured guidance supplies counterfactual reflection goals"
);
expect(
  withStructuredGuidance.user.includes("Rule: Keep grounded claims tentative."),
  "structured guidance supplies safety rules"
);
expect(
  withStructuredGuidance.user.includes("Rule: Treat traces as tentative evidence."),
  "structured guidance preserves legacy rules"
);

const withoutContext = buildMessages({
  background: "A manual background for standalone Scenario Studio usage.",
  scenario: "Create decisions about classes and club work.",
  groundingContext: "",
  count: 20,
  language: "zh"
});

expect(
  !withoutContext.user.includes("StorySage graph/model grounding context"),
  "standalone prompt omits grounding context header"
);
expect(
  !withoutContext.user.includes("Grounding-informed card distribution"),
  "standalone prompt omits grounding design brief"
);
expect(withoutContext.user.includes("Preferred UI language: Chinese"), "language flag still works");

console.log("PASS simulation-test grounding context smoke test completed");
