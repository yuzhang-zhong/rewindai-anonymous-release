process.env.VERCEL = "1";

const { default: app, redactSensitiveErrorMessage } = await import("../server/index.mjs");

function expect(condition, label, detail) {
  if (condition) {
    console.log(`PASS ${label}`);
    return;
  }

  console.error(`FAIL ${label}`);
  if (detail !== undefined) {
    console.error(detail);
  }
  process.exit(1);
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? payload.detail ?? `HTTP ${response.status}`);
  }
  return payload;
}

const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const health = await requestJson(baseUrl, "/api/health");
  expect(health.ok === true, "simulation-test API health returns ok");
  const fakeKey = "<OPENAI_API_KEY_PLACEHOLDER>";
  const encodedFakeKey = encodeURIComponent(fakeKey);
  const redactedError = redactSensitiveErrorMessage(
    `Provider rejected credential ${fakeKey}; url key=${encodedFakeKey}`,
    [fakeKey]
  );
  expect(
    !redactedError.includes(fakeKey) && !redactedError.includes(encodedFakeKey) && redactedError.includes("[redacted]"),
    "simulation-test generation errors redact raw and encoded API keys"
  );

  const session = await requestJson(baseUrl, "/api/sessions", {
    method: "POST",
    body: JSON.stringify({
      rulerName: "StorySage User",
      language: "en",
      groundingSource: {
        source: "storysage_trace_handoff",
        userId: "rewindai_contract_user",
        loadedAt: new Date().toISOString(),
        protocol: "rewindai.simulation_test_handoff",
        version: "1.0",
        privacyLevel: "no_profile_context"
      }
    })
  });

  expect(Boolean(session.sessionId), "trace-linked simulation-test session returns session id");
  expect(Boolean(session.state.currentCard), "trace-linked simulation-test session returns current card");
  expect(
    session.state.initialSnapshot.groundingSource.protocol === "rewindai.simulation_test_handoff",
    "trace-linked session preserves handoff protocol"
  );
  expect(
    session.state.initialSnapshot.groundingSource.version === "1.0",
    "trace-linked session preserves contract version"
  );
  expect(
    session.state.initialSnapshot.groundingSource.privacyLevel === "no_profile_context",
    "trace-linked session preserves privacy level"
  );

  const pollutedState = JSON.parse(JSON.stringify(session.state));
  pollutedState.sessionId = `revived-${session.sessionId}`;
  pollutedState.initialSnapshot.apiKey = fakeKey;
  pollutedState.initialSnapshot.groundingContext = "full StorySage grounding should not persist";
  pollutedState.initialSnapshot.generationGuidance = { secret: fakeKey };
  pollutedState.initialSnapshot.providerApiKey = fakeKey;
  pollutedState.initialSnapshot.traceToken = fakeKey;
  pollutedState.initialSnapshot.groundingSource.summary = "secret grounding summary should not persist";
  pollutedState.initialSnapshot.groundingSource.userId = `user-token=${fakeKey}`;
  pollutedState.initialSnapshot.groundingSource.source = `storysage apiKey=${fakeKey}`;
  pollutedState.meters.apiKey = fakeKey;
  pollutedState.runtime.currentCardId = "custom-secret-card";
  pollutedState.runtime.deck = [];
  pollutedState.runtime.customCards = [{
    id: "custom-secret-card",
    domain: "ethics",
    speaker: `A custom classmate with token=${fakeKey}`,
    portrait: "classmate",
    prompt: `A custom card should survive revival without non-contract fields or ${fakeKey}.`,
    apiKey: fakeKey,
    groundingContext: "full StorySage grounding should not persist from custom card",
    generationGuidance: { secret: fakeKey },
    options: [{
      direction: "left",
      text: `Choose the careful route with apiKey=${fakeKey}`,
      decisionType: "careful-choice",
      riskLevel: "medium",
      targetMeter: "faith",
      apiKey: fakeKey,
      outcomes: [{
        label: `The careful route changes the balance without exposing ${fakeKey}.`,
        effects: { faith: 8, people: -4 },
        apiKey: fakeKey
      }]
    }, {
      direction: "right",
      text: "Choose the bold route",
      decisionType: "bold-choice",
      riskLevel: "high",
      targetMeter: "people",
      outcomes: [{
        label: "The bold route changes the balance.",
        effects: { people: 8, faith: -4 }
      }]
    }]
  }];
  pollutedState.history = [{
    at: new Date().toISOString(),
    cardId: session.state.currentCard.id,
    speaker: `Injected speaker with secret=${fakeKey}`,
    direction: "left",
    optionText: `Injected decision with ${fakeKey}`,
    decisionType: "test",
    riskLevel: "medium",
    targetMeter: "faith",
    expectedValue: "test",
    probabilityType: "stable",
    followUpScheduled: null,
    responseTimeMs: 1,
    metersBefore: { ...session.state.meters, apiKey: fakeKey },
    outcomeLabel: `Injected outcome with token=${fakeKey}`,
    effects: { faith: 1, apiKey: fakeKey },
    metersAfter: { ...session.state.meters, faith: session.state.meters.faith + 1, apiKey: fakeKey },
    apiKey: fakeKey
  }];

  const revivedDecision = await requestJson(baseUrl, `/api/sessions/${pollutedState.sessionId}/decisions`, {
    method: "POST",
    body: JSON.stringify({
      cardId: pollutedState.runtime.currentCardId,
      direction: "left",
      responseTimeMs: 700,
      state: pollutedState
    })
  });
  const revivedPayloadText = JSON.stringify(revivedDecision.state);
  expect(
    !revivedPayloadText.includes(fakeKey)
      && !revivedPayloadText.includes("groundingContext")
      && !revivedPayloadText.includes("generationGuidance")
      && !revivedPayloadText.includes("providerApiKey")
      && !revivedPayloadText.includes("traceToken")
      && !revivedPayloadText.includes("secret grounding summary")
      && revivedPayloadText.includes("[redacted]"),
    "serverless session revival strips non-contract fields and redacts credential-like text"
  );

  const firstDirection = session.state.currentCard.options[0].direction;
  const decision = await requestJson(baseUrl, `/api/sessions/${session.sessionId}/decisions`, {
    method: "POST",
    body: JSON.stringify({
      cardId: session.state.currentCard.id,
      direction: firstDirection,
      responseTimeMs: 900,
      state: session.state
    })
  });

  expect(decision.state.history.length === 1, "decision appends one history item");
  expect(decision.analytics.decisions === 1, "decision analytics counts one decision");
  expect(
    decision.state.history[0].targetMeter && decision.state.history[0].riskLevel,
    "decision history includes trace-relevant fields"
  );

  const analytics = await requestJson(baseUrl, `/api/sessions/${session.sessionId}/analytics`);
  expect(analytics.analytics.decisions === 1, "analytics endpoint returns decision count");
  expect(Array.isArray(analytics.history) && analytics.history.length === 1, "analytics endpoint returns history");

  console.log("PASS simulation-test session contract smoke test completed");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
