# simulation-test API Reference

## `POST /api/sessions`

Creates a new game session.

Request:

```json
{
  "rulerName": "campus-player",
  "language": "en",
  "customCards": [],
  "groundingSource": {
    "source": "storysage_trace_handoff",
    "userId": "storysage-user",
    "loadedAt": "2026-06-14T00:00:00.000Z",
    "protocol": "rewindai.simulation_test_handoff",
    "privacyLevel": "no_profile_context"
  }
}
```

Response:

```json
{
  "sessionId": "session-id",
  "state": {}
}
```

## `GET /api/sessions/:sessionId`

Reads the current session state.

## `POST /api/sessions/:sessionId/decisions`

Submits one swipe decision.

Request:

```json
{
  "cardId": "campus-001",
  "direction": "right",
  "responseTimeMs": 1732
}
```

Response:

```json
{
  "state": {},
  "chosenOption": {},
  "outcome": {},
  "analytics": {}
}
```

## `GET /api/sessions/:sessionId/analytics`

Returns a session analytics summary:

- total decisions
- average response time
- direction distribution
- decision type distribution
- risk distribution
- simplified direction entropy
- scheduled follow-up count

## `POST /api/custom-cards/generate`

Generates a 20-30 card custom pack through the selected provider.

Request fields:

- `provider`: `openai`, `gemini`, `anthropic`, or `deepseek`
- `apiKey`: used once for the provider request and not stored
- `model`: optional provider model override
- `background`: privacy-safe user or organization background
- `scenario`: target decision simulation scenario
- `groundingContext`: optional StorySage graph/model/trace guidance for generation
- `count`: 20, 25, or 30
- `language`: `en` or `zh`

`groundingContext` should be compact guidance, not a raw graph or full biography dump.
When `generationGuidance` is present, the backend derives a grounding-informed design brief from that structured object. If it is absent, the backend falls back to parsing `groundingContext`. The brief guides card distribution across relationship-pressure cards, decision-policy incidents, pressure mechanics, risk levels, and relevant meters while keeping the generated cards event-based rather than questionnaire-like.

Optional `generationGuidance`:

```json
{
  "version": "1.0",
  "graph_pressure_card_quota": 7,
  "relationship_roles": ["advisor", "roommate"],
  "relationship_tensions": ["trust", "obligation"],
  "decision_policy_incidents": ["probe whether the user sets boundaries before overhelping"],
  "pressure_mechanics": ["limited energy during exam week"],
  "target_meters": ["military", "people"],
  "risk_distribution": ["medium", "high"],
  "trace_summary": "6 decisions recorded with repeated energy tradeoffs.",
  "rules": ["Treat traces as tentative evidence."]
}
```

## StorySage Trace Sync

Trace sync is not handled by the simulation-test API server. The browser client posts local run records directly to the StorySage endpoint specified by the launch handoff payload:

```json
{
  "trace_token": "short-lived-token-from-storysage",
  "source": "simulation-test",
  "contract": {
    "protocol": "rewindai.trace",
    "version": "1.0",
    "source_module": "simulation-test",
    "target_module": "storysage"
  },
  "record": {}
}
```

Default StorySage endpoint:

```text
POST http://localhost:8000/simulation/traces
```
