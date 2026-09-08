# Placeform

An architectural exterior design studio built with React, TypeScript, MapLibre + Terra Draw, and React Three Fiber. New demos open at the Presidio. Draw a study boundary, use the prepared Watt Wonder research and four supported directions, generate one concept image, approve it, then develop the parametric Three.js model. Saved Portland projects retain their original context.

## Run locally

Requires Node 22.13+ and npm.

```sh
npm ci
# Only on a fresh checkout; keep an existing .dev.vars
cp -n .dev.vars.example .dev.vars
npm run dev -- --host 0.0.0.0 --port 3001
```

Open http://localhost:3001. For subscription generation, install the Codex CLI and sign in once with `codex login` using your ChatGPT account. Placeform detects the existing login; no subscription token is copied into the app. Image generation and refinement require OPENAI_API_KEY. Existing model projects, typed commands, drawings, GLB exports and recording remain available without provider credentials; the new Presidio demo requires a generated image review before entering 3D. Project history is saved in this browser; export a project JSON or review ZIP for a portable backup. Imported images consume browser storage. Export if the save indicator reports a storage failure.

## Provider connections

Set secrets in `.dev.vars`, then restart the local server. For the hosted version, configure the same values as server secrets through Sites.

- `OPENAI_API_KEY`: Sunburst image generation/refinement (`gpt-image-2.5-sunburst`, `quality: "max"`, `1536x1024`, PNG) and paid OpenAI Realtime voice using `gpt-realtime-2.1`, a WebRTC connection, server-mediated SDP exchange, and the same validated action interpreter as typed commands. Optional `OPENAI_REALTIME_MODEL` override. Microphone access requires HTTPS or localhost. Sessions stop after five minutes; provider usage is billed separately from ChatGPT/Codex. Current pricing is linked in Connections.
- `AIAND_API_KEY`: AIand video API. The key owner must accept Video Service Terms in the AIand console. The app checks the live `/v1/videos/models` catalog for `minimaxai/minimax-h3`, verifies the 768p rate again before submitting, uploads first/last model frames, and requires the displayed Generate action. See `docs/video-research.md` for verified provider inputs and pricing. Unknown submission outcomes require history reconciliation before retrying; the app never automatically repeats a paid POST.

No long-lived key is sent to browser code or stored in project exports. `/api/status` reports only connection availability. The hosted site is intended to remain owner-only: its provider keys and video history belong to the key owner. In-memory rate limits are a prototype guard, not an account-level billing cap.

## Presidio hackathon flow

1. Start on Place at the Presidio. Draw a polygon; searching only moves the map and does not approve a parcel.
2. Prepared board context and four supported design directions are already bundled. Drawing the boundary starts one image job for the active direction. No live research or concept calls run for this demo.
3. Open Concepts to review the image, then choose **Approve image & develop in 3D**. Other directions generate on demand. Model navigation, Film and Drawings require this review for new demos.
4. Refine through **Generate & review**, using the original concept image or an actual model frame as reference. Every image request uses Sunburst at maximum quality through the OpenAI API, with no subscription or lower-quality fallback.
5. Explore typed or voice model edits, locks, undo/redo, drawing sheets and model recording. Image generation does not reconstruct arbitrary geometry: image and model use the same effective supported specification, including mixed components. Selecting a direction preserves entered dimensions.
6. Export the review ZIP for original concept PNGs, specification, boundary, research, drawings and available model assets. Projects and original images persist in IndexedDB, with migration from the previous localStorage store. Keep exports for backup.

The source snapshot is `lib/presidio-board.json`; curated evidence is in `lib/presidio.ts`. These are prepared board observations and interpretations, not fresh parcel verification. Board: https://www.are.na/oscar-hong/watt-wonder-presidio-design-inspiration. The precedent-gallery link is not a requirements form; the active specification supplies requirements.

The automatic controller retains durable checkpoints, cancellation, stale-result exclusion, known-job retry and reload recovery. Unknown submission outcomes are not automatically retried. Manual design changes pause automatic application. Camera changes do not invalidate image review; geometry changes before review require a matching image. Subsequent model edits remain available after approval.

## Other projects and providers

Outside the Presidio demo, the existing research → four directions → images workflow remains available. Boundary changes preserve dimensions and locks and clear old context/images. Text jobs can use the local signed-in Codex CLI; image jobs always use the OpenAI API. Research and concept replacement may require unlocking features first. Standalone results are reviewed before application.

Responses image jobs run in background mode and are polled by ID. The API uses GPT-5 orchestration and explicitly configures the Sunburst image tool. Access, quality, quota and size errors are surfaced without silently changing settings. Voice and AIand video retain their separate connections. The bundled Portland walkthrough is available only to legacy projects.

Local Codex jobs are saved under `~/.cache/placeform/<workspace-hash>/`. Up to four jobs run concurrently, with a 15-minute timeout. Stopping/restarting the local server interrupts active subscription jobs; their records identify the interruption and offer retry. Provider background responses are subject to provider retention; browser storage is local to the current browser and origin. Keep a project export for portable backups.

The four editable geometry recipes remain bounded parametric models. Generated palettes recolor their material families and update drawing legends; an image cannot introduce arbitrary new geometry. Use a model proposal for supported geometric changes. Legacy project imports remain available in Export for interoperability, but the normal research and generation journey requires no ZIP handoff.

Official integration references: [Codex SDK and local integrations](https://learn.chatgpt.com/docs/codex-sdk), [Responses background jobs](https://developers.openai.com/api/docs/guides/background), [image generation](https://developers.openai.com/api/docs/guides/image-generation), and [web search](https://developers.openai.com/api/docs/guides/tools-web-search).

Prepared images were generated with the built-in subscription image tool. Exact prompts/provenance are in `public/assets/manifest.json`. The bundled walkthrough is an original recording of the actual Three.js model, without AI video processing. OSM tiles and Wikimedia context photos retain on-screen attribution; source details are in `docs/place-research.md` and `lib/research.ts`.

## Validation

```sh
npm run typecheck
npm test
npm run lint
npm run build
npm audit
```

The Presidio tests cover prepared context, locks, dimensions, review gating, PNG persistence, single-image sequencing, retry, cancellation, stale results and reload. Live generation/refinement smoke tests require a configured API key; no provider success is inferred from mocked tests.

## Scope

This is schematic architectural design, not construction or engineering documentation. Study boundaries are speculative and existing occupation, ownership, zoning, utilities and parcel-specific flood status are unverified. The model represents equipment, operational zones, site access and context schematically. No noise, energy, cooling-water, carbon, ecological or flood-performance values are claimed. Four concepts are design-intent images; the detailed procedural model resolves their general vocabulary without claiming a literal photogrammetric reconstruction. Sun positions are art-directed; pedestrian navigation has no collision system. Drawings use project-local elevation axes and indicate their geographic long-axis bearing.
