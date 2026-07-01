import cors from "cors";
import express from "express";
import { generateCustomCards, normalizeCustomCards } from "./custom-card-generator.mjs";
import { cardById, cards, initialMeters, resourceKeys } from "./game-data.mjs";

export const app = express();
const sessions = new Map();
const maxDecisionsPerRun = 24;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const storySageApiBaseUrl = (process.env.VITE_STORYSAGE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

function clampMeter(value) {
  return Math.max(0, Math.min(100, value));
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function nextDueCard(state) {
  const dueIndex = state.scheduled.findIndex((item) => item.dueTurn <= state.history.length && !state.seenCardIds.includes(item.cardId));
  if (dueIndex === -1) {
    return null;
  }

  const [item] = state.scheduled.splice(dueIndex, 1);
  return item.cardId;
}

function cardsForState(state) {
  return Array.isArray(state.customCards) && state.customCards.length > 0 ? state.customCards : cards;
}

function hasCardId(state, cardId) {
  return cardById.has(cardId) || cardsForState(state).some((card) => card.id === cardId);
}

function nextDeckCard(state) {
  const dueCardId = nextDueCard(state);
  if (dueCardId) {
    return dueCardId;
  }

  while (state.deck.length > 0) {
    const nextId = state.deck.shift();
    if (nextId && !state.seenCardIds.includes(nextId)) {
      return nextId;
    }
  }

  const unseenFollowUps = cardsForState(state)
    .filter((card) => !state.seenCardIds.includes(card.id))
    .map((card) => card.id);

  return unseenFollowUps[0] ?? null;
}

function getCurrentCard(state) {
  if (!state.currentCardId) {
    return null;
  }

  return cardById.get(state.currentCardId) ?? cardsForState(state).find((card) => card.id === state.currentCardId) ?? null;
}

function sanitizeName(value) {
  if (typeof value !== "string") {
    return "Alex Morgan";
  }

  const trimmed = value.trim().slice(0, 32);
  return trimmed || "Alex Morgan";
}

function sanitizeLanguage(value) {
  return value === "zh" ? "zh" : "en";
}

function redactCredentialLikeText(value) {
  return value
    .replace(/sk-[A-Za-z0-9_/\-+=]{8,}/g, "[redacted]")
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/\b(api[_-]?key|token|secret)\s*[:=]\s*[A-Za-z0-9_/\-+=]{8,}/gi, "$1=[redacted]");
}

function sanitizeText(value, fallback = "", maxLength = 240) {
  return typeof value === "string" && value.trim()
    ? redactCredentialLikeText(value).trim().slice(0, maxLength)
    : fallback;
}

function sanitizeMeters(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    resourceKeys.map((key) => [
      key,
      Number.isFinite(Number(source[key])) ? clampMeter(Number(source[key])) : initialMeters[key]
    ])
  );
}

function sanitizeEffects(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    resourceKeys
      .filter((key) => Number.isFinite(Number(source[key])) && Number(source[key]) !== 0)
      .map((key) => [key, Math.max(-100, Math.min(100, Number(source[key])))])
  );
}

function sanitizeGroundingSource(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    source: sanitizeText(value.source, "unknown", 80),
    userId: typeof value.userId === "string" ? sanitizeText(value.userId, "", 80) : undefined,
    loadedAt: sanitizeText(value.loadedAt, new Date().toISOString(), 80),
    protocol: typeof value.protocol === "string" ? sanitizeText(value.protocol, "", 80) : undefined,
    version: typeof value.version === "string" ? sanitizeText(value.version, "", 32) : undefined,
    privacyLevel: typeof value.privacyLevel === "string" ? sanitizeText(value.privacyLevel, "", 80) : undefined
  };
}

function sanitizeInitialSnapshot(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  const groundingSource = sanitizeGroundingSource(source.groundingSource);
  const firstCardId = sanitizeText(source.firstCardId, fallback.firstCardId, 80);
  const totalCards = Number(source.totalCards);

  return {
    initializedAt: sanitizeText(source.initializedAt, fallback.initializedAt, 80),
    rulerName: sanitizeName(source.rulerName ?? fallback.rulerName),
    language: sanitizeLanguage(source.language ?? fallback.language),
    meters: sanitizeMeters(source.meters ?? fallback.meters),
    firstCardId,
    totalCards: Number.isFinite(totalCards) ? Math.max(1, Math.min(1000, totalCards)) : fallback.totalCards,
    ...(groundingSource ? { groundingSource } : {})
  };
}

function sanitizeFollowUp(value, customIds = new Set()) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const cardId = sanitizeText(value.cardId, "", 80);
  const fromCardId = sanitizeText(value.fromCardId, "", 80);
  if (!cardId || (!cardById.has(cardId) && !customIds.has(cardId))) {
    return null;
  }

  return {
    cardId,
    dueTurn: Number.isFinite(Number(value.dueTurn)) ? Math.max(0, Math.min(100, Number(value.dueTurn))) : 1,
    fromCardId,
    fromDirection: ["left", "right", "up", "down"].includes(value.fromDirection) ? value.fromDirection : "left",
    reason: sanitizeText(value.reason, "", 160)
  };
}

function sanitizeHistoryItem(value, customIds = new Set()) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const cardId = sanitizeText(value.cardId, "", 80);
  if (!cardId || (!cardById.has(cardId) && !customIds.has(cardId))) {
    return null;
  }

  return {
    at: sanitizeText(value.at, new Date().toISOString(), 80),
    cardId,
    cardDomain: value.cardDomain ? sanitizeText(value.cardDomain, "", 80) : undefined,
    cardPrompt: value.cardPrompt ? sanitizeText(value.cardPrompt, "", 240) : undefined,
    cardPromptZh: value.cardPromptZh ? sanitizeText(value.cardPromptZh, "", 240) : undefined,
    soulTags: Array.isArray(value.soulTags) ? value.soulTags.map((tag) => sanitizeText(tag, "", 16)).filter(Boolean).slice(0, 5) : undefined,
    failureModes: Array.isArray(value.failureModes) ? value.failureModes.map((mode) => sanitizeText(mode, "", 80)).filter(Boolean).slice(0, 5) : undefined,
    speaker: sanitizeText(value.speaker, "Someone", 80),
    speakerZh: value.speakerZh ? sanitizeText(value.speakerZh, "", 80) : undefined,
    direction: ["left", "right", "up", "down"].includes(value.direction) ? value.direction : "left",
    optionText: sanitizeText(value.optionText, "Decision", 120),
    optionTextZh: value.optionTextZh ? sanitizeText(value.optionTextZh, "", 120) : undefined,
    decisionType: sanitizeText(value.decisionType, "unknown", 80),
    riskLevel: ["low", "medium", "high"].includes(value.riskLevel) ? value.riskLevel : "medium",
    targetMeter: resourceKeys.includes(value.targetMeter) ? value.targetMeter : resourceKeys[0],
    expectedValue: sanitizeText(value.expectedValue, "", 80),
    probabilityType: sanitizeText(value.probabilityType, "", 80),
    followUpScheduled: sanitizeFollowUp(value.followUpScheduled, customIds),
    responseTimeMs: Number.isFinite(Number(value.responseTimeMs)) ? Math.max(0, Number(value.responseTimeMs)) : 0,
    metersBefore: sanitizeMeters(value.metersBefore),
    outcomeLabel: sanitizeText(value.outcomeLabel, "Outcome", 160),
    outcomeLabelZh: value.outcomeLabelZh ? sanitizeText(value.outcomeLabelZh, "", 160) : undefined,
    effects: sanitizeEffects(value.effects),
    metersAfter: sanitizeMeters(value.metersAfter)
  };
}

export function redactSensitiveErrorMessage(message, secrets = []) {
  let safeMessage = typeof message === "string" && message.trim()
    ? message
    : "Unable to generate cards";

  for (const secret of secrets) {
    if (typeof secret !== "string") {
      continue;
    }

    const trimmed = secret.trim();
    if (trimmed.length < 4) {
      continue;
    }

    for (const variant of new Set([trimmed, encodeURIComponent(trimmed)])) {
      safeMessage = safeMessage.split(variant).join("[redacted]");
    }
  }

  return safeMessage;
}

function createSession({ rulerName, language, customCards: requestedCustomCards, groundingSource: requestedGroundingSource } = {}) {
  const sessionId = crypto.randomUUID();
  const customCards = normalizeCustomCards(requestedCustomCards);
  const groundingSource = sanitizeGroundingSource(requestedGroundingSource);
  const activeCards = customCards.length > 0 ? customCards : cards;
  const baseDeck = shuffle(activeCards.filter((card) => !card.isFollowUp).map((card) => card.id));
  const firstCardId = baseDeck.shift() ?? "campus-001";
  const initializedAt = new Date().toISOString();
  const initialSnapshot = {
    initializedAt,
    rulerName: sanitizeName(rulerName),
    language: sanitizeLanguage(language),
    meters: { ...initialMeters },
    firstCardId,
    totalCards: activeCards.length,
    ...(groundingSource ? { groundingSource } : {})
  };
  const state = {
    sessionId,
    rulerName: initialSnapshot.rulerName,
    language: initialSnapshot.language,
    initialSnapshot,
    yearsInPower: 1,
    year: 1,
    meters: { ...initialMeters },
    currentCardId: firstCardId,
    deck: baseDeck,
    scheduled: [],
    seenCardIds: [],
    customCards,
    history: [],
    ended: false,
    ending: null,
    endingZh: null
  };

  sessions.set(sessionId, state);
  return state;
}

function publicState(state) {
  return {
    sessionId: state.sessionId,
    rulerName: state.rulerName,
    language: state.language,
    initialSnapshot: state.initialSnapshot,
    maxDecisions: maxDecisionsPerRun,
    yearsInPower: state.yearsInPower,
    year: state.year,
    meters: state.meters,
    currentCard: state.ended ? null : getCurrentCard(state),
    history: state.history,
    ended: state.ended,
    ending: state.ending,
    endingZh: state.endingZh,
    scheduledCount: state.scheduled.length,
    remainingCards: state.deck.length,
    runtime: {
      currentCardId: state.currentCardId,
      deck: state.deck,
      scheduled: state.scheduled,
      seenCardIds: state.seenCardIds,
      customCards: state.customCards
    }
  };
}

function validCardIds(items, customCards = []) {
  const customIds = new Set(customCards.map((card) => card.id));
  return Array.isArray(items)
    ? items.filter((id) => typeof id === "string" && (cardById.has(id) || customIds.has(id)))
    : [];
}

function reviveSession(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || typeof snapshot.sessionId !== "string") {
    return null;
  }

  const runtime = snapshot.runtime && typeof snapshot.runtime === "object" ? snapshot.runtime : {};
  const customCards = normalizeCustomCards(runtime.customCards);
  const customIds = new Set(customCards.map((card) => card.id));
  const currentCardId =
    typeof runtime.currentCardId === "string" && (cardById.has(runtime.currentCardId) || customIds.has(runtime.currentCardId))
      ? runtime.currentCardId
      : snapshot.currentCard?.id;

  if (currentCardId && !cardById.has(currentCardId) && !customIds.has(currentCardId)) {
    return null;
  }

  const initialSnapshot = sanitizeInitialSnapshot(snapshot.initialSnapshot, {
    initializedAt: new Date().toISOString(),
    rulerName: sanitizeName(snapshot.rulerName),
    language: sanitizeLanguage(snapshot.language),
    meters: { ...initialMeters },
    firstCardId: currentCardId ?? "campus-001",
    totalCards: customCards.length > 0 ? customCards.length : cards.length
  });
  const scheduled = Array.isArray(runtime.scheduled)
    ? runtime.scheduled.map((item) => sanitizeFollowUp(item, customIds)).filter(Boolean)
    : [];
  const history = Array.isArray(snapshot.history)
    ? snapshot.history.map((item) => sanitizeHistoryItem(item, customIds)).filter(Boolean)
    : [];

  const revived = {
    sessionId: sanitizeText(snapshot.sessionId, crypto.randomUUID(), 120),
    rulerName: sanitizeName(snapshot.rulerName),
    language: sanitizeLanguage(snapshot.language),
    initialSnapshot,
    yearsInPower: Number.isFinite(snapshot.yearsInPower) ? snapshot.yearsInPower : 1,
    year: Number.isFinite(snapshot.year) ? snapshot.year : 1,
    meters: sanitizeMeters(snapshot.meters),
    currentCardId: currentCardId ?? null,
    deck: validCardIds(runtime.deck, customCards),
    scheduled,
    seenCardIds: validCardIds(runtime.seenCardIds, customCards),
    customCards,
    history,
    ended: Boolean(snapshot.ended),
    ending: snapshot.ending ? sanitizeText(snapshot.ending, "", 240) : null,
    endingZh: snapshot.endingZh ? sanitizeText(snapshot.endingZh, "", 240) : null
  };

  sessions.set(revived.sessionId, revived);
  return revived;
}

function chooseOutcome(outcomes) {
  const roll = Math.random();
  let total = 0;

  for (const outcome of outcomes) {
    total += outcome.chance;
    if (roll <= total) {
      return outcome;
    }
  }

  return outcomes[outcomes.length - 1];
}

const resourceEndLabels = {
  faith: { en: "GPA", zh: "GPA" },
  people: { en: "Friends", zh: "朋友" },
  military: { en: "Energy", zh: "精力" },
  wealth: { en: "Budget", zh: "预算" }
};

function endingForMeters(meters) {
  const low = resourceKeys.find((key) => meters[key] <= 0);
  if (low) {
    return {
      ending: `The semester falls out of balance: ${resourceEndLabels[low].en} hits the floor.`,
      endingZh: `这个学期失衡了：${resourceEndLabels[low].zh}降到了底线。`
    };
  }

  const high = resourceKeys.find((key) => meters[key] >= 100);
  if (high) {
    return {
      ending: `The semester falls out of balance: ${resourceEndLabels[high].en} gets pushed into overload.`,
      endingZh: `这个学期失衡了：${resourceEndLabels[high].zh}被推到过载。`
    };
  }

  return null;
}

function summarize(history) {
  const directions = {};
  const decisionTypes = {};
  const riskLevels = {};
  const domains = {};
  const soulTags = {};
  const failureModes = {};
  let responseTotal = 0;

  for (const item of history) {
    directions[item.direction] = (directions[item.direction] ?? 0) + 1;
    decisionTypes[item.decisionType] = (decisionTypes[item.decisionType] ?? 0) + 1;
    riskLevels[item.riskLevel] = (riskLevels[item.riskLevel] ?? 0) + 1;
    if (item.cardDomain) {
      domains[item.cardDomain] = (domains[item.cardDomain] ?? 0) + 1;
    }
    for (const tag of item.soulTags ?? []) {
      soulTags[tag] = (soulTags[tag] ?? 0) + 1;
    }
    for (const mode of item.failureModes ?? []) {
      failureModes[mode] = (failureModes[mode] ?? 0) + 1;
    }
    responseTotal += item.responseTimeMs;
  }

  const count = history.length || 1;
  const entropy = Object.values(directions).reduce((sum, value) => {
    const p = value / count;
    return sum - p * Math.log2(p);
  }, 0);

  return {
    decisions: history.length,
    averageResponseTimeMs: Math.round(responseTotal / count),
    directions,
    decisionTypes,
    riskLevels,
    domains,
    soulTags,
    failureModes,
    directionEntropy: Number(entropy.toFixed(3)),
    scheduledFollowUps: history.filter((item) => item.followUpScheduled).length
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/cards", (_req, res) => {
  res.json({ cards });
});

app.post("/api/custom-cards/generate", async (req, res) => {
  try {
    const result = await generateCustomCards(req.body ?? {});
    res.json(result);
  } catch (error) {
    const statusCode = error.statusCode ?? 502;
    res.status(statusCode).json({
      error: redactSensitiveErrorMessage(error.message, [req.body?.apiKey])
    });
  }
});

async function proxyStorySageJson(req, res, path) {
  try {
    const upstream = await fetch(`${storySageApiBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {})
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.type(upstream.headers.get("content-type") || "application/json");
    res.send(text || "{}");
  } catch (error) {
    res.status(502).json({
      error: "Unable to reach StorySage API",
      detail: error instanceof Error ? error.message : "Unknown proxy error"
    });
  }
}

app.post("/api/storysage/simulation/traces", (req, res) => {
  proxyStorySageJson(req, res, "/simulation/traces");
});

app.post("/api/storysage/simulation/general-reflection", (req, res) => {
  proxyStorySageJson(req, res, "/simulation/general-reflection");
});

app.post("/api/sessions", (req, res) => {
  const state = createSession(req.body ?? {});
  res.status(201).json({ sessionId: state.sessionId, state: publicState(state) });
});

app.get("/api/sessions/:sessionId", (req, res) => {
  const state = sessions.get(req.params.sessionId);
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({ state: publicState(state) });
});

app.post("/api/sessions/:sessionId/decisions", (req, res) => {
  const state = sessions.get(req.params.sessionId) ?? reviveSession(req.body?.state);
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (state.sessionId !== req.params.sessionId) {
    res.status(400).json({ error: "Session mismatch" });
    return;
  }

  if (state.ended) {
    res.status(409).json({ error: "Session already ended", state: publicState(state) });
    return;
  }

  const card = getCurrentCard(state);
  if (!card) {
    state.ended = true;
    state.ending = "You have handled this run of campus events.";
    state.endingZh = "你已经处理完这轮校园事件。";
    res.status(409).json({ error: "No current card", state: publicState(state) });
    return;
  }

  const { cardId, direction, responseTimeMs = 0 } = req.body ?? {};

  if (cardId !== card.id) {
    res.status(400).json({ error: "Card mismatch" });
    return;
  }

  const chosenOption = card.options.find((option) => option.direction === direction);
  if (!chosenOption) {
    res.status(400).json({ error: "Direction is not available for this card" });
    return;
  }

  const outcome = chooseOutcome(chosenOption.outcomes);
  const nextMeters = { ...state.meters };
  for (const [key, delta] of Object.entries(outcome.effects)) {
    nextMeters[key] = clampMeter((nextMeters[key] ?? 0) + delta);
  }

  let followUpScheduled = null;
  if (chosenOption.followUp && hasCardId(state, chosenOption.followUp.cardId) && !state.seenCardIds.includes(chosenOption.followUp.cardId)) {
    const minDelay = chosenOption.followUp.minDelay ?? 3;
    const maxDelay = chosenOption.followUp.maxDelay ?? minDelay;
    const delay = minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
    followUpScheduled = {
      cardId: chosenOption.followUp.cardId,
      dueTurn: state.history.length + delay + 1,
      fromCardId: card.id,
      fromDirection: direction,
      reason: chosenOption.followUp.reason
    };
    state.scheduled.push(followUpScheduled);
  }

  const logItem = {
    at: new Date().toISOString(),
    cardId: card.id,
    cardDomain: card.domain,
    cardPrompt: card.prompt,
    cardPromptZh: card.promptZh,
    soulTags: card.soulTags,
    failureModes: card.failureModes,
    speaker: card.speaker,
    speakerZh: card.speakerZh,
    direction,
    optionText: chosenOption.text,
    optionTextZh: chosenOption.textZh,
    decisionType: chosenOption.decisionType,
    riskLevel: chosenOption.riskLevel,
    targetMeter: chosenOption.targetMeter,
    expectedValue: chosenOption.expectedValue,
    probabilityType: chosenOption.probabilityType,
    followUpScheduled,
    responseTimeMs,
    metersBefore: state.meters,
    outcomeLabel: outcome.label,
    outcomeLabelZh: outcome.labelZh,
    effects: outcome.effects,
    metersAfter: nextMeters
  };

  state.history.push(logItem);
  state.seenCardIds.push(card.id);
  state.meters = nextMeters;
  state.currentCardId = nextDeckCard(state);
  state.yearsInPower += 1;
  state.year += 1;
  const ending = endingForMeters(nextMeters);
  state.ending = ending?.ending ?? null;
  state.endingZh = ending?.endingZh ?? null;
  state.ended = Boolean(state.ending) || !state.currentCardId || state.history.length >= maxDecisionsPerRun;

  if (!state.ending && state.ended) {
    state.ending = "Semester complete: you made it through a full run of campus life.";
    state.endingZh = "学期完成：你处理完了一整轮校园生活。";
  }

  res.json({
    state: publicState(state),
    chosenOption,
    outcome,
    analytics: summarize(state.history)
  });
});

app.get("/api/sessions/:sessionId/analytics", (req, res) => {
  const state = sessions.get(req.params.sessionId);
  if (!state) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({ analytics: summarize(state.history), history: state.history });
});

const port = Number(process.env.PORT ?? 3001);

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`simulation-test API listening on http://127.0.0.1:${port}`);
  });
}

export default app;
