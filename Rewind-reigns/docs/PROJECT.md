# simulation-test Project Notes

## Product Shape

simulation-test is RewindAI's campus-life decision card module, inspired by the fast resource pressure of Reigns. It uses original English/Chinese campus events, original low-poly student portraits, and a structured data model for each decision.

The player is a university student. Each run starts with a required player name and a language choice. Each card presents a campus situation and offers two to four swipe choices. Choices update four long-term meters:

- `faith`: GPA
- `people`: Friends
- `military`: Energy
- `wealth`: Budget

All four meters initialize at `50`. Any meter reaching `0` or `100` ends the semester because the life balance has collapsed. The game also ends after 40 decisions, making each decision swingy enough to matter in a short run.

## Scenario System

`server/game-data.mjs` now generates a 300-card English/Chinese scenario deck from unique campus scenario rows. The deck is balanced across ten domains, with 30 cards each for academics, dorm life, clubs, money, wellbeing, social life, career pressure, integrity, campus systems, and family pressure.

All options intentionally trade at least one meter up against at least one meter down. Typical effects are in the `12` to `26` point range, so the game reaches meaningful pressure in a small number of turns.

Each run starts from a shuffled non-follow-up card, so the first visible scenario is no longer fixed. Some options schedule delayed follow-up cards. The current deck has 27 dependency links, including academic integrity audits, social conflicts that return through mediation, money choices that become account problems, health choices that become policy reminders, and family pressure that resurfaces as planning conversations.

Option copy uses several variants for the same underlying decision pattern, reducing repeated button language while keeping the scoring model consistent.

## Scenario Studio

Scenario Studio is a product module for user-generated decision packs. From the start screen, users can enter a personal or organizational background, describe the decision scenario they want to simulate, choose OpenAI, Google Gemini, Anthropic, or DeepSeek, provide a model name and API key, and generate a playable 20-30 card pack.

API keys are sent only to the backend for that single generation request. They are not saved in local storage, run records, or generated card packs.

Generated cards are normalized before use. The backend enforces the simulation-test card shape, two to four unique swipe directions, bilingual English/Chinese text, allowed portrait variants, and meter effects that trade at least one resource up against at least one resource down. Custom packs can then be used as the session deck while retaining the same scoring, records, and serverless-safe runtime behavior.

## StorySage Trace Bridge

When launched from StorySage, the app accepts a `handoff` query parameter containing a base64-encoded JSON payload from `GET /simulation/test-handoff`. This payload is trace-only: it includes player identity, a short-lived trace token, and the RewindAI contract metadata, but not biography, graph, mental model, or card-generation guidance.

StorySage-launched runs always use the public random campus deck. Scenario Studio is hidden in this mode so downstream gameplay is comparable across users and not personalized by profile data.

The browser syncs local run records back to StorySage through `POST /simulation/traces`. The run record stores decision trajectory and a small `groundingSource` provenance object, but it does not store the full StorySage biography text in the session snapshot.

After the first run, the Clone Advisor asks the user to name a choice they considered but did not take. The clone rehearses that unchosen path from the first-run gameplay trace, records a tentative counterfactual reflection, and lets the user start a second assisted replay.

Standalone Scenario Studio remains available when simulation-test is opened directly. It can still generate custom card packs from manually entered background/scenario data, but this is no longer the StorySage main flow.

## Portrait System

The card portraits use 20 typical campus character variants:

- roommate
- teaching assistant
- club leader
- advisor
- athlete
- barista
- resident assistant
- classmate
- professor
- mentor
- journalist
- artist
- coder
- activist
- librarian
- medic
- captain
- founder
- counselor
- parent

The visual style stays low-poly and card-like while giving each role a distinct color and prop.

## UI Notes

The interface uses a sunny campus background, a vertical game panel, top resource HUD, central prompt, and a draggable decision card. The card no longer shows a persistent explanatory footer below the portrait. During drag, the active option appears as a swipe stamp and the direction hint buttons remain available for mouse users.

The page supports English and Chinese UI text. The backend also returns Chinese speaker, prompt, option, outcome, and ending fields for bilingual play. Local browser storage keeps the initialization snapshot and full trajectory, so previous runs can be reopened from the Records panel. The side panel shows concrete run status rather than achievement-style objectives.

Typography uses a clean system stack led by Aptos and Inter-style fallbacks for a sharper, more premium feel without requiring a network font.
