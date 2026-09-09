# Placeform

An architectural exterior design studio built with React, TypeScript, MapLibre, and React Three Fiber. The prepared Eastbank Exchange study opens with four generated concepts, nine primary-source design references, a detailed editable exterior model, schematic drawings, and a model-rendered film.

## Run locally

Requires Node 22.13+ and npm.

```sh
npm ci
# Only on a fresh checkout; keep an existing .dev.vars
cp -n .dev.vars.example .dev.vars
npm run dev -- --host 0.0.0.0 --port 3001
```

Open http://localhost:3001. For subscription generation, install the Codex CLI and sign in once with `codex login` using your ChatGPT account. Placeform detects the existing login; no subscription token is copied into the app. Geometry, typed commands, drawings, GLB exports, recording, and the prepared demo work without provider credentials. Project history is saved in this browser; export a project JSON or review ZIP for a portable backup. Imported images consume browser storage. Export if the save indicator reports a storage failure.

## Provider connections

Set secrets in `.dev.vars`, then restart the local server. For the hosted version, configure the same values as server secrets through Sites.

- `OPENAI_API_KEY`: paid OpenAI Realtime voice using `gpt-realtime-2.1`, a WebRTC connection, server-mediated SDP exchange, and the same validated action interpreter as typed commands. Optional `OPENAI_REALTIME_MODEL` override. Microphone access requires HTTPS or localhost. Sessions stop after five minutes; provider usage is billed separately from ChatGPT/Codex. Current pricing is linked in Connections.
- `AIAND_API_KEY`: AIand video API. The key owner must accept Video Service Terms in the AIand console. The app checks the live `/v1/videos/models` catalog for `minimaxai/minimax-h3`, verifies the 768p rate again before submitting, uploads first/last model frames, and requires the displayed Generate action. See `docs/video-research.md` for verified provider inputs and pricing. Unknown submission outcomes require history reconciliation before retrying; the app never automatically repeats a paid POST.

No long-lived key is sent to browser code or stored in project exports. `/api/status` reports only connection availability. The hosted site is intended to remain owner-only: its provider keys and video history belong to the key owner. In-memory rate limits are a prototype guard, not an account-level billing cap.

## A short design review

1. Explore the four concepts and their local evidence in Site.
2. Develop A in 3D. Type “Deepen the fins to 1.2 metres.” Click Lock facade and attempt another edit. Undo or redo with the toolbar or Cmd/Ctrl+Z.
3. Try “Use A’s massing, B’s facade, and C’s landscape” and “Show the entrance at sunset.” Connect voice for natural spoken instructions. Clicked elements and feature locks ground the voice session.
4. Open Site, search for a location, then drag a rectangle on the map. Release to begin research, four directions, and four images automatically. Search only moves the map. Use Move map to pan. Map options includes keyboard selection at the map center and GeoJSON export. Track progress, stop, or retry from the activity card.
5. Open the model before exporting the architectural review package. It contains seven vector SVG/PDF sheets, JSON specification, GeoJSON, source-backed brief, metre-scale GLB, and four actual model presentation views.
6. In Film, watch the bundled original walkthrough or prepare and record a current-revision shot. The four shots total 27 seconds. Verify live AIand price, review frames/prompt, then generate. Review completed video for architectural drift against the retained original clip.

## Research, concepts and model proposals in the UI

Open **Generate & review** from Concepts, Model, Drawings, Film, or Export. Site also offers optional research within its research disclosure. Local development uses the signed-in Codex CLI by default, with `codex exec` JSON events, isolated job directories, restricted tools, and the subscription's available allowance. Research browses primary sources; concept generation returns four named directions and palettes; image generation/editing uses the subscription image tool. No API keys are inherited by the Codex subprocess. The local adapter accepts localhost, same-origin requests with a per-server token.

Releasing a valid selection starts a fresh, undoable design for that boundary. Clicks, tiny drags, cancelled drags, panning, and location searches do not start generation. A new project needs only an optional name; choose its site on the map. Existing feature locks, research, directions, and images are cleared when a new site is selected; building dimensions and the active concept remain. No prepared demo images are substituted while generation is pending.

1. Research runs first and applies its brief and citations automatically.
2. Four locally grounded directions are created from that research and applied to the model and drawings.
3. Four fresh images run concurrently and appear in Concepts as they finish. No start or apply approvals are required for this automatic workflow.
4. The persistent activity card shows progress and the provider. Codex is preferred; when unavailable, the configured paid OpenAI API is used automatically. No available connection produces an actionable Retry state. Film, downloads, and exports stay separate.
5. A new map edit supersedes and requests cancellation of old work. Relevant manual edits, undo, or switching projects pause automatic application; camera changes are allowed. Successful outputs remain available after a partial failure, and Retry submits only missing outputs. Unknown submission outcomes require provider-history reconciliation before starting another design.
6. Browser reload recovers saved workflow stages and known provider jobs without resubmitting them. Workflow checkpoints and application receipts are stored in IndexedDB alongside standalone generation jobs. Storage is local to this browser; keep project exports for recovery.

**Generate & review** remains available for optional research extensions, individual image refinements, and model proposals. These standalone jobs retain their explicit review/apply controls and existing saved-job compatibility. Model proposals remain bounded by supported geometry and feature locks.

The hosted app cannot run your computer's Codex session. It uses the same UI with the **paid OpenAI API** option: GPT-5 mini and web search for research/text proposals, GPT-5 with GPT Image 2 for images. Responses run in background mode and are polled by ID; browser jobs and results use IndexedDB. Price information and request bounds appear before starting; token usage appears afterward. Automatic site generation uses the paid API when Codex is unavailable and displays that choice in its progress card. A submitted run never silently switches providers or retries an unknown paid submission. Voice and AIand video continue to use their separate APIs.

Local Codex jobs are saved under `~/.cache/placeform/<workspace-hash>/`. Up to four jobs run concurrently, with a 15-minute timeout. Stopping/restarting the local server interrupts active subscription jobs; their records identify the interruption and offer retry. Provider background responses are subject to provider retention; browser storage is local to the current browser and origin. Keep a project export for portable backups.

The four editable geometry recipes remain bounded parametric models. Generated palettes recolor their material families and update drawing legends; an image cannot introduce arbitrary new geometry. Use a model proposal for supported geometric changes. Legacy project imports remain available in Export for interoperability, but the normal research and generation journey requires no ZIP handoff.

Official integration references: [Codex SDK and local integrations](https://learn.chatgpt.com/docs/codex-sdk), [Responses background jobs](https://developers.openai.com/api/docs/guides/background), [image generation](https://developers.openai.com/api/docs/guides/image-generation), and [web search](https://developers.openai.com/api/docs/guides/tools-web-search).

Prepared images were generated with the built-in subscription image tool. Exact prompts/provenance are in `public/assets/manifest.json`. The bundled walkthrough is an original recording of the actual Three.js model, without AI video processing. OSM tiles and Wikimedia context photos retain on-screen attribution; source details are in `docs/place-research.md` and `lib/research.ts`.

## Validation

```sh
npm run typecheck
npm test
npm run build
npm audit
```

See `docs/verification.md` for the exercised browser journey and precise remaining limits.

## Scope

This is schematic architectural design, not construction or engineering documentation. The Portland study boundary is illustrative and existing occupation, ownership, zoning, utilities and parcel-specific flood status are unverified. The model represents equipment, operational zones, site access and context schematically. No noise, energy, cooling-water, carbon, ecological or flood-performance values are claimed. Four concepts are design-intent images; the detailed procedural model resolves their general vocabulary without claiming a literal photogrammetric reconstruction. Sun positions are art-directed; pedestrian navigation has no collision system. Drawings use project-local elevation axes and indicate their geographic long-axis bearing.
