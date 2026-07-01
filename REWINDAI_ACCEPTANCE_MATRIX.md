# RewindAI Acceptance Matrix

This matrix records the anonymous release checks used before sharing the project code.
It intentionally avoids deployment-owner names, private project identifiers, local
machine paths, and raw service credentials.

## Product Gates

| Gate | Evidence | Expected result |
| --- | --- | --- |
| Natural interview works | `StorySage/scripts/smoke_rewindai_backend.py` | A user can register, complete interview turns, end a session, and generate a biography draft. |
| Biography captures decision logic | Backend biography smoke and manual review | The generated biography includes a decision-logic section with trade-offs, values, uncertainty, and relationship pressures. |
| Relationship and decision graph works | StorySage graph endpoints and frontend graph viewer | A graph can be rebuilt from biography/interview evidence, exposes typed nodes/edges, and marks simulation evidence as tentative. |
| Mental model draft works | StorySage formulation endpoint | The model summarizes evidence-grounded hypotheses rather than raw transcripts. |
| simulation-test works independently | `Rewind-reigns npm run smoke:session` | The public campus decision deck can start, record choices, summarize a run, and show a report. |
| Trace loop works | StorySage simulation trace smoke | Game traces sync back to StorySage without storing raw secrets or full private context. |
| Group workflows work | Frontend smoke scripts and manual browser checks | Group 1 self-reflection, Group 2 general AI reflection, Group 3 clone reflection, and anonymous exploration render the correct workflow. |
| Admin view is privacy-bounded | Admin API/UI smoke | The dashboard shows counts, group assignment, run summaries, reflection status, similarity summaries, and deletion controls without raw interview text by default. |
| Public-safe errors | Backend smoke tests | Unexpected errors are redacted and do not expose local paths, stack traces, credential strings, or private deployment details. |
| Static frontend deployability | Frontend build and postbuild checks | Vite builds complete and the SPA shell has required routing/security-header assets. |

## Local Verification Commands

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\VERIFY_REWINDAI.ps1
powershell -ExecutionPolicy Bypass -File .\VERIFY_REWINDAI_SMOOTH.ps1 -SkipBrowser
```

For frontend-only checks:

```powershell
cd StorySage_Frontend
npm install
npm run build
npm run smoke:rewindai-ui
```

For simulation-test checks:

```powershell
cd Rewind-reigns
npm install
npm run smoke:session
npm run smoke:bridge
```

## Deployment Notes

Use environment variables rather than committed files for all public deployment
URLs and secrets. The release expects these values to be configured by the
hosting platform:

```env
VITE_API_BASE_URL=<public-storysage-api-url>
VITE_REWIND_APP_URL=<public-simulation-test-url>
PUBLIC_FRONTEND_URL=<public-frontend-url>
DATABASE_URL=<postgres-url>
OPENAI_API_KEY=<model-provider-key>
REWINDAI_ADMIN_TOKEN=<admin-token>
MIROFISH_BASE_URL=<optional-graph-backend-url>
```

Do not commit concrete API keys, database passwords, Vercel project IDs, local
absolute paths, or hosting-owner URLs.
