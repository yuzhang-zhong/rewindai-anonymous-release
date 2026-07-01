import { portraitProfiles, resourceKeys } from "./game-data.mjs";

const directions = ["left", "right", "up", "down"];
const riskLevels = ["low", "medium", "high"];
const providerDefaults = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-2.5-flash",
  anthropic: "claude-3-5-haiku-latest",
  deepseek: "deepseek-chat"
};

const fallbackEffects = [
  { faith: 18, people: -10, military: -8 },
  { people: 18, wealth: -12, faith: -6 },
  { military: 18, faith: -12, people: -4 },
  { wealth: 18, people: -10, military: -8 }
];

function redactCredentialLikeText(value) {
  return value
    .replace(/sk-[A-Za-z0-9_/\-+=]{8,}/g, "[redacted]")
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/\b(api[_-]?key|token|secret)\s*[:=]\s*[A-Za-z0-9_/\-+=]{8,}/gi, "$1=[redacted]");
}

function sanitizeString(value, fallback, maxLength = 240) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = redactCredentialLikeText(value).trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function clampEffect(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(-26, Math.min(26, Math.round(number)));
}

function normalizeEffects(effects, index) {
  const normalized = {};
  for (const key of resourceKeys) {
    const value = clampEffect(effects?.[key]);
    if (value !== 0) {
      normalized[key] = value;
    }
  }

  const values = Object.values(normalized);
  const changed = values.filter((value) => value !== 0).length;
  const hasPositive = values.some((value) => value > 0);
  const hasNegative = values.some((value) => value < 0);

  if (changed < 2 || !hasPositive || !hasNegative) {
    return fallbackEffects[index % fallbackEffects.length];
  }

  return normalized;
}

function normalizeOption(option, index, usedDirections) {
  const direction = directions.includes(option?.direction) && !usedDirections.has(option.direction)
    ? option.direction
    : directions.find((item) => !usedDirections.has(item)) ?? directions[index % directions.length];
  usedDirections.add(direction);

  const effects = normalizeEffects(option?.outcomes?.[0]?.effects ?? option?.effects, index);
  const maxEffect = Math.max(...Object.values(effects).map((value) => Math.abs(value)));
  const targetMeter = resourceKeys.includes(option?.targetMeter) ? option.targetMeter : Object.entries(effects)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]?.[0] ?? "people";

  return {
    direction,
    text: sanitizeString(option?.text, direction === "left" ? "Take the honest route" : "Try the risky route", 64),
    textZh: sanitizeString(option?.textZh, direction === "left" ? "走诚实路线" : "尝试冒险路线", 64),
    decisionType: sanitizeString(option?.decisionType, "custom-choice", 40).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    riskLevel: riskLevels.includes(option?.riskLevel) ? option.riskLevel : "medium",
    targetMeter,
    expectedValue: maxEffect >= 20 ? "swingy" : "medium",
    probabilityType: "stable",
    outcomes: [
      {
        chance: 1,
        label: sanitizeString(option?.outcomes?.[0]?.label ?? option?.label, "The choice changes the balance immediately.", 140),
        labelZh: sanitizeString(option?.outcomes?.[0]?.labelZh ?? option?.labelZh, "这个选择立刻改变了局面。", 140),
        effects
      }
    ]
  };
}

export function normalizeCustomCards(rawCards, options = {}) {
  if (!Array.isArray(rawCards)) {
    return [];
  }

  return rawCards.slice(0, 30).map((card, index) => {
    const usedDirections = new Set();
    const rawOptions = Array.isArray(card?.options) ? card.options.slice(0, 4) : [];
    const normalizedOptions = rawOptions.map((option, optionIndex) => normalizeOption(option, optionIndex, usedDirections));

    while (normalizedOptions.length < 2) {
      normalizedOptions.push(normalizeOption({}, normalizedOptions.length, usedDirections));
    }

    return {
      id: sanitizeString(card?.id, `custom-${Date.now()}-${index + 1}`, 64).replace(/[^a-zA-Z0-9-_]/g, "-"),
      number: index + 1,
      domain: sanitizeString(card?.domain, "Custom", 48),
      speaker: sanitizeString(card?.speaker, "A person in your scenario", 72),
      speakerZh: sanitizeString(card?.speakerZh, "场景中的人物", 72),
      portrait: portraitProfiles.includes(card?.portrait) ? card.portrait : "classmate",
      prompt: sanitizeString(card?.prompt, "A decision in your custom scenario needs an answer.", 240),
      promptZh: sanitizeString(card?.promptZh, "你的自定义场景里出现了一个需要回应的决定。", 240),
      options: normalizedOptions,
      isFollowUp: Boolean(options.allowFollowUps && card?.isFollowUp)
    };
  });
}

function splitList(value) {
  return value
    .split(/[,;、，]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function parseGroundingFacts(groundingContext) {
  const lines = String(groundingContext ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const facts = {
    relationshipFocus: [],
    relationTypes: [],
    hypotheses: [],
    pressurePoints: [],
    traceSummary: "",
    affectedResources: [],
    counterfactualGoal: "",
    cloneImitationProtocol: "",
    counterfactualOutcomeGoal: "",
    unchosenOptionPrompt: "",
    assistedReplayGoal: "",
    reflectionLoopSteps: []
  };

  for (const line of lines) {
    const cleaned = line.replace(/^[-*]\s*/, "");
    if (cleaned.startsWith("Relationship focus:")) {
      facts.relationshipFocus.push(...splitList(cleaned.replace("Relationship focus:", "")));
    } else if (cleaned.startsWith("Relation types:")) {
      facts.relationTypes.push(...splitList(cleaned.replace("Relation types:", "")));
    } else if (cleaned.startsWith("Hypothesis:")) {
      facts.hypotheses.push(cleaned.replace("Hypothesis:", "").trim());
    } else if (cleaned.startsWith("Pressure point:")) {
      facts.pressurePoints.push(cleaned.replace("Pressure point:", "").trim());
    } else if (cleaned.startsWith("Behavioral trace summary:")) {
      facts.traceSummary = cleaned.replace("Behavioral trace summary:", "").trim();
    } else if (cleaned.startsWith("Counterfactual reflection goal:")) {
      facts.counterfactualGoal = cleaned.replace("Counterfactual reflection goal:", "").trim();
    } else if (cleaned.startsWith("Clone imitation protocol:")) {
      facts.cloneImitationProtocol = cleaned.replace("Clone imitation protocol:", "").trim();
    } else if (cleaned.startsWith("Counterfactual outcome goal:")) {
      facts.counterfactualOutcomeGoal = cleaned.replace("Counterfactual outcome goal:", "").trim();
    } else if (cleaned.startsWith("Unchosen option prompt:")) {
      facts.unchosenOptionPrompt = cleaned.replace("Unchosen option prompt:", "").trim();
    } else if (cleaned.startsWith("Assisted replay goal:")) {
      facts.assistedReplayGoal = cleaned.replace("Assisted replay goal:", "").trim();
    } else if (cleaned.startsWith("Reflection loop step:")) {
      facts.reflectionLoopSteps.push(cleaned.replace("Reflection loop step:", "").trim());
    }

    for (const resource of resourceKeys) {
      if (new RegExp(`\\b${resource}\\b`, "i").test(cleaned)) {
        facts.affectedResources.push(resource);
      }
    }
  }

  return {
    relationshipFocus: unique(facts.relationshipFocus),
    relationTypes: unique(facts.relationTypes),
    hypotheses: unique(facts.hypotheses).slice(0, 5),
    pressurePoints: unique(facts.pressurePoints).slice(0, 6),
    traceSummary: facts.traceSummary,
    counterfactualGoal: facts.counterfactualGoal,
    cloneImitationProtocol: facts.cloneImitationProtocol,
    counterfactualOutcomeGoal: facts.counterfactualOutcomeGoal,
    unchosenOptionPrompt: facts.unchosenOptionPrompt,
    assistedReplayGoal: facts.assistedReplayGoal,
    reflectionLoopSteps: unique(facts.reflectionLoopSteps).slice(0, 5),
    affectedResources: unique(facts.affectedResources)
  };
}

function factsFromGenerationGuidance(guidance) {
  if (!guidance || typeof guidance !== "object") {
    return null;
  }

  const safetyRules = unique([
    ...(Array.isArray(guidance.safety_rules) ? guidance.safety_rules : []),
    ...(Array.isArray(guidance.rules) ? guidance.rules : [])
  ]).slice(0, 6);

  return {
    graphPressureCardQuota: Number.isFinite(guidance.graph_pressure_card_quota) ? guidance.graph_pressure_card_quota : 0,
    relationshipFocus: Array.isArray(guidance.relationship_roles) ? guidance.relationship_roles.slice(0, 8) : [],
    relationTypes: Array.isArray(guidance.relationship_tensions) ? guidance.relationship_tensions.slice(0, 8) : [],
    hypotheses: Array.isArray(guidance.decision_policy_incidents) ? guidance.decision_policy_incidents.slice(0, 5) : [],
    pressurePoints: Array.isArray(guidance.pressure_mechanics) ? guidance.pressure_mechanics.slice(0, 6) : [],
    traceSummary: typeof guidance.trace_summary === "string" ? guidance.trace_summary : "",
    counterfactualGoal: typeof guidance.counterfactual_reflection_goal === "string" ? guidance.counterfactual_reflection_goal : "",
    cloneImitationProtocol: typeof guidance.clone_imitation_protocol === "string" ? guidance.clone_imitation_protocol : "",
    counterfactualOutcomeGoal: typeof guidance.counterfactual_outcome_report_goal === "string" ? guidance.counterfactual_outcome_report_goal : "",
    unchosenOptionPrompt: typeof guidance.unchosen_option_prompt === "string" ? guidance.unchosen_option_prompt : "",
    assistedReplayGoal: typeof guidance.assisted_replay_goal === "string" ? guidance.assisted_replay_goal : "",
    reflectionLoopSteps: Array.isArray(guidance.reflection_loop_steps) ? guidance.reflection_loop_steps.slice(0, 5) : [],
    affectedResources: Array.isArray(guidance.target_meters)
      ? guidance.target_meters.filter((item) => resourceKeys.includes(item)).slice(0, 4)
      : [],
    riskDistribution: Array.isArray(guidance.risk_distribution) ? guidance.risk_distribution.slice(0, 3) : [],
    rules: safetyRules
  };
}

export function buildGroundingDesignBrief(groundingContext, count, generationGuidance) {
  if (!groundingContext && !generationGuidance) {
    return "";
  }

  const facts = factsFromGenerationGuidance(generationGuidance) ?? parseGroundingFacts(groundingContext);
  const cardCount = Math.max(20, Math.min(30, Number(count) || 20));
  const lines = ["Grounding-informed card distribution:"];

  if (facts.relationshipFocus.length || facts.relationTypes.length) {
    const quota = facts.graphPressureCardQuota > 0 ? facts.graphPressureCardQuota : Math.ceil(cardCount * 0.35);
    lines.push(
      `- Use graph constraints in at least ${quota} cards by turning relationship roles into social pressure, not labels.`
    );
    if (facts.relationshipFocus.length) {
      lines.push(`- Relationship roles to vary across cards: ${facts.relationshipFocus.join(", ")}.`);
    }
    if (facts.relationTypes.length) {
      lines.push(`- Relationship tensions to dramatize: ${facts.relationTypes.join(", ")}.`);
    }
  }

  if (facts.hypotheses.length) {
    lines.push("- Convert each decision-policy hypothesis into at least one playable incident with two plausible choices.");
    for (const hypothesis of facts.hypotheses) {
      lines.push(`- Decision-policy hypothesis: ${hypothesis}`);
    }
  }

  if (facts.pressurePoints.length) {
    lines.push("- Use pressure points as situation mechanics; do not state them as personality claims.");
    for (const pressure of facts.pressurePoints) {
      lines.push(`- Pressure mechanic: ${pressure}`);
    }
  }

  if (facts.traceSummary) {
    lines.push(
      `- Use behavioral trace summary to diversify risks and target meters, but treat it as tentative evidence: ${facts.traceSummary}`
    );
  }

  if (
    facts.counterfactualGoal ||
    facts.cloneImitationProtocol ||
    facts.counterfactualOutcomeGoal ||
    facts.unchosenOptionPrompt ||
    facts.assistedReplayGoal ||
    facts.reflectionLoopSteps.length
  ) {
    lines.push("- Design for counterfactual reflection: each important card should make at least one unchosen option feel plausible enough for the clone to rehearse after round one.");
    lines.push("- The clone loop is imitation-first: role-play the grounded user on the unchosen option, report a tentative simulated result, then convert it into second-run inspiration.");
    if (facts.counterfactualGoal) {
      lines.push(`- Counterfactual reflection goal: ${facts.counterfactualGoal}`);
    }
    if (facts.cloneImitationProtocol) {
      lines.push(`- Clone imitation protocol: ${facts.cloneImitationProtocol}`);
    }
    if (facts.counterfactualOutcomeGoal) {
      lines.push(`- Counterfactual outcome goal: ${facts.counterfactualOutcomeGoal}`);
    }
    if (facts.unchosenOptionPrompt) {
      lines.push(`- Unchosen option prompt: ${facts.unchosenOptionPrompt}`);
    }
    if (facts.assistedReplayGoal) {
      lines.push(`- Assisted replay goal: ${facts.assistedReplayGoal}`);
    }
    for (const step of facts.reflectionLoopSteps) {
      lines.push(`- Reflection loop step: ${step}`);
    }
  }

  const resourceTargets = facts.affectedResources.length ? facts.affectedResources : resourceKeys;
  lines.push(`- Ensure meter coverage across the pack. Include meaningful tradeoffs touching these meters: ${resourceTargets.join(", ")}.`);
  if (facts.riskDistribution?.length) {
    lines.push(`- Balance risk levels around this observed/desired mix: ${facts.riskDistribution.join(", ")}.`);
  } else {
    lines.push("- Balance risk levels: include low-stakes everyday choices, medium trade-offs, and several high-pressure turning points.");
  }
  for (const rule of facts.rules ?? []) {
    lines.push(`- Rule: ${rule}`);
  }
  lines.push("- Avoid direct questionnaires. Every grounded insight must appear as an event with a speaker, context, choice, consequence, and resource tradeoff.");

  return lines.join("\n").slice(0, 2200);
}

function jsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["cards", "designNotes"],
    properties: {
      designNotes: { type: "string" },
      cards: {
        type: "array",
        minItems: 20,
        maxItems: 30,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["domain", "speaker", "speakerZh", "portrait", "prompt", "promptZh", "options"],
          properties: {
            domain: { type: "string" },
            speaker: { type: "string" },
            speakerZh: { type: "string" },
            portrait: { type: "string", enum: portraitProfiles },
            prompt: { type: "string" },
            promptZh: { type: "string" },
            options: {
              type: "array",
              minItems: 2,
              maxItems: 4,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["direction", "text", "textZh", "decisionType", "riskLevel", "targetMeter", "outcomes"],
                properties: {
                  direction: { type: "string", enum: directions },
                  text: { type: "string" },
                  textZh: { type: "string" },
                  decisionType: { type: "string" },
                  riskLevel: { type: "string", enum: riskLevels },
                  targetMeter: { type: "string", enum: resourceKeys },
                  outcomes: {
                    type: "array",
                    minItems: 1,
                    maxItems: 1,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["chance", "label", "labelZh", "effects"],
                      properties: {
                        chance: { type: "number" },
                        label: { type: "string" },
                        labelZh: { type: "string" },
                        effects: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            faith: { type: "integer", minimum: -26, maximum: 26 },
                            people: { type: "integer", minimum: -26, maximum: 26 },
                            military: { type: "integer", minimum: -26, maximum: 26 },
                            wealth: { type: "integer", minimum: -26, maximum: 26 }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}

export function buildMessages({ background, scenario, groundingContext, generationGuidance, count, language }) {
  const groundingDesignBrief = buildGroundingDesignBrief(groundingContext, count, generationGuidance);
  const system = [
    "You design decision cards for simulation-test, a Reigns-like swipe game.",
    "Return JSON only. No markdown.",
    "Each card must be grounded in the user's background and scenario.",
    "Each option must change at least two meters, include at least one positive and one negative effect, and use integer effects between -26 and 26.",
    "Meters: faith=GPA/competence, people=relationships/reputation, military=energy/health, wealth=budget/resources.",
    "Use 2 to 4 options per card. Directions must be unique within a card.",
    "Generate the requested number of cards. Do not stop early.",
    "Make tradeoffs concrete, emotionally believable, and not repetitive.",
    "If grounding context is provided, treat the grounding-informed card distribution as a design brief and convert it into playable situations. Do not label, diagnose, or directly quiz the user about the context.",
    "Design cards so post-game reflection can ask what the player considered but did not choose; the clone should later imitate the grounded user, simulate those unchosen paths as counterfactual rehearsals, report tentative outcomes, and inspire the next run.",
    "Provide English and Chinese text fields for speakers, prompts, option text, and outcome labels."
  ].join(" ");
  const userLines = [
    `Preferred UI language: ${language === "zh" ? "Chinese" : "English"}.`,
    `Number of cards: ${count}.`,
    `User background: ${background}`,
    `Decision scenario: ${scenario}`,
  ];
  if (groundingContext) {
    userLines.push(`StorySage graph/model grounding context: ${groundingContext}`);
  }
  if (groundingDesignBrief) {
    userLines.push(groundingDesignBrief);
  }
  userLines.push(`Allowed portrait values: ${portraitProfiles.join(", ")}.`);
  const user = userLines.join("\n");

  return { system, user };
}

function stripJson(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  return first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
}

function parseGeneratedJson(text) {
  return JSON.parse(stripJson(text));
}

async function callOpenAICompatible({ endpoint, apiKey, model, system, user }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 12000
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 240)}`);
  }

  const payload = JSON.parse(text);
  return payload.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic({ apiKey, model, system, user }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 12000,
      temperature: 0.8,
      system,
      messages: [{ role: "user", content: user }]
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 240)}`);
  }

  const payload = JSON.parse(text);
  return payload.content?.map((part) => part.text ?? "").join("\n") ?? "";
}

async function callGemini({ apiKey, model, system, user }) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.8,
        maxOutputTokens: 12000
      }
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Provider request failed (${response.status}): ${text.slice(0, 240)}`);
  }

  const payload = JSON.parse(text);
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
}

export async function generateCustomCards(request) {
  const provider = sanitizeString(request?.provider, "openai", 24);
  if (!Object.hasOwn(providerDefaults, provider)) {
    const error = new Error("Unsupported provider");
    error.statusCode = 400;
    throw error;
  }

  const apiKey = sanitizeString(request?.apiKey, "", 4096);
  if (!apiKey) {
    const error = new Error("API key is required");
    error.statusCode = 400;
    throw error;
  }

  const background = sanitizeString(request?.background, "", 1200);
  const scenario = sanitizeString(request?.scenario, "", 1200);
  const groundingContext = sanitizeString(request?.groundingContext, "", 2400);
  const generationGuidance = request?.generationGuidance && typeof request.generationGuidance === "object"
    ? request.generationGuidance
    : null;
  if (background.length < 10 || scenario.length < 10) {
    const error = new Error("Background and scenario need more detail");
    error.statusCode = 400;
    throw error;
  }

  const count = Math.max(20, Math.min(30, Number(request?.count) || 20));
  const language = request?.language === "zh" ? "zh" : "en";
  const model = sanitizeString(request?.model, providerDefaults[provider], 80);
  const { system, user } = buildMessages({ background, scenario, groundingContext, generationGuidance, count, language });

  let rawText = "";
  if (provider === "openai") {
    rawText = await callOpenAICompatible({
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey,
      model,
      system,
      user: `${user}\n\nJSON schema intent: ${JSON.stringify(jsonSchema())}`
    });
  } else if (provider === "deepseek") {
    rawText = await callOpenAICompatible({
      endpoint: "https://api.deepseek.com/chat/completions",
      apiKey,
      model,
      system,
      user: `${user}\n\nJSON schema intent: ${JSON.stringify(jsonSchema())}`
    });
  } else if (provider === "anthropic") {
    rawText = await callAnthropic({
      apiKey,
      model,
      system: `${system} Follow this JSON schema intent: ${JSON.stringify(jsonSchema())}`,
      user
    });
  } else if (provider === "gemini") {
    rawText = await callGemini({
      apiKey,
      model,
      system: `${system} Follow this JSON schema intent: ${JSON.stringify(jsonSchema())}`,
      user
    });
  }

  const parsed = parseGeneratedJson(rawText);
  const cards = normalizeCustomCards(parsed.cards);

  if (cards.length < count) {
    throw new Error(`The provider returned ${cards.length} usable cards, but ${count} were requested. Try again or use a stronger model with a larger output limit.`);
  }

  return {
    provider,
    model,
    designNotes: sanitizeString(parsed.designNotes, "Generated custom decision cards.", 480),
    cards
  };
}
