# simulation-test

simulation-test is the RewindAI campus decision simulation module. The player enters a name, chooses English or Chinese UI, and handles university life through quick swipe choices while balancing GPA, Friends, Energy, and Budget.

Scenario Studio is a separate product module inside the start screen. Users can enter their own background, target decision scenario, provider API key, and model choice, then generate a playable 20-30 card custom pack.

In the larger RewindAI workspace, this app is launched from StorySage with a trace-only `?handoff=<base64-json>` payload. That handoff does not include biography, graph, mental model, or card-generation guidance. The first run always uses the public random campus deck, then syncs decision traces back to StorySage through the trace token included in the handoff.

After the first run, the Clone Advisor asks the user to reflect on a choice they considered but did not take. The clone then rehearses that unchosen path using the first-run gameplay trace, treating the simulated result as inspiration for a second run rather than generic advice or proof of what the real person would do.

Production URLs are configured by the hosting platform and are intentionally not
committed in this anonymous release.

## Run

```bash
npm install
npm run dev
```

The web app defaults to `http://127.0.0.1:5174`, and the API defaults to `http://127.0.0.1:3001`. StorySage_Frontend defaults to `5173`, so simulation-test uses a fixed separate port for the integrated demo.

## Smoke Test

```bash
npm run smoke:grounding
npm run smoke:bridge
npm run smoke:session
```

These verify that standalone custom-card grounding still works, the StorySage trace-only bridge is present, the clone counterfactual reflection flow is present, and the simulation-test API/session contract works without calling any external model provider.

## Main Files

- `docs/PROJECT.md`: product and simulation design notes
- `docs/API.md`: backend API reference
- `server/index.mjs`: Express API and in-memory session state
- `server/custom-card-generator.mjs`: provider adapters and validation for generated custom cards
- `server/game-data.mjs`: English/Chinese campus scenario system, large meter swings, and delayed follow-up links
- `src/App.tsx`: frontend state flow
- `src/lib/api.ts`: game API calls and StorySage trace sync
- `src/components/DecisionCard.tsx`: draggable swipe card
- `src/lib/records.ts`: local run history, initialization snapshots, and trajectory storage
- `src/styles.css`: sunny campus game UI, typography, records panel, and portrait variants
