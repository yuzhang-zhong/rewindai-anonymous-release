# RewindAI Frontend

This is the main RewindAI web cockpit. It is the only participant-facing
frontend for the integrated system: users register, enter their assigned group,
complete natural interview flows, view biography/graph/model outputs, launch the
simulation-test module, and access reflection support.

This anonymous release removes private deployment URLs, original repository
links, local paths, and credential material. Public service URLs should be
provided through environment variables at build time.

## Main Flows

- **Anonymous experience**: open exploration of interview, graph, mental model,
  simulation-test, and clone-style reflection without research step labels.
- **Group 1**: simulation-test, self-reflection, then replay.
- **Group 2**: simulation-test, general AI reflection without personal context,
  then replay.
- **Group 3**: natural interview, graph/model generation, simulation-test,
  clone reflection using the user's model and trace, then replay.
- **Admin dashboard**: privacy-bounded summaries, group counts, trace status,
  reflection coverage, clone similarity, export, and deletion controls.

## Setup

```bash
npm install
npm run dev
```

Default local services:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_REWIND_APP_URL=http://127.0.0.1:5174
```

## Build and Smoke Tests

```bash
npm run build
npm run smoke:rewindai-ui
npm run smoke:rewindai-flow
```

Use real deployment URLs only through environment variables or hosting-platform
configuration. Do not commit API keys, admin tokens, database URLs, local
absolute paths, or hosting-owner identifiers.
