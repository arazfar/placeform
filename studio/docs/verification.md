# Verification — 8 September 2026

## Automated checks

- TypeScript strict check: passed.
- Oxlint: passed for application code. Untouched generated UI primitives are excluded. The imperative Three.js/MapLibre integration is deliberately outside React Compiler; stable engine effects consume current refs. Native images are retained for data/blob imports, and original model recordings are silent films.
- Fourteen Node tests: passed. They cover typed/voice-tool action validation, lock enforcement including massing recipe locks, atomic mixing, rejected ambiguous/invalid edits, site containment and bearing, SVG/XML escaping and dimensions, all four geometry recipes, rejected invalid imports, image deduplication across undo history, generation fingerprints, atomic AI proposals under locks, and generated palette validation/persistence.
- Additional model authoring check: 32 combinations of concept, roof, and minimum/default height yielded finite geometry. Roof-envelope metadata agreed with mesh bounds to within 0.000001m; maximum approximately 141,000 triangles.
- Production build: passed using React 19.2.8, vinext beta.9, Vite 8.2.2 and the Cloudflare runtime.
- npm audit: zero reported vulnerabilities after compatible dependency updates.

## Actual browser journey

- Four prepared concept images loaded; inspected the concept composition and 3D exterior against the approved A reference.
- Typed “Deepen the fins to 1.2 metres”: model/spec changed from 0.85m to 1.20m. Lock facade blocked a later depth edit. Undo restored prior dimensions and locks; redo restored the later edit.
- Drew a polygon with actual map clicks. Boundary and building overlays rendered, GeoJSON retained five ring coordinates, and the long axis was 90 degrees. Undo updated both the specification and Terra Draw geometry. Coordinate search worked. The live Nominatim address endpoint returned Portland results.
- Created a second project in San Francisco, reloaded the page, and verified its identity, coordinates, revision and pending-research state persisted. Portland precedents were marked as references requiring local research.
- Exported a research task ZIP. Imported an explicitly labeled QA research fixture after review, reloaded, and verified its source and “IMPORTED · VERIFY SOURCE” label. Imported an image, reviewed it, reloaded, and verified the compressed image remained available through the deduplicated image store. QA fixtures are not part of the prepared project or published source.
- Exported an actual architectural review ZIP: seven valid XML SVG drawings, seven-page A3 vector PDF, specification, GeoJSON, cited brief, 9.7MB GLB, and four presentation PNGs. GLB header, 72 mesh groups, 24 materials and six textures were inspected. All seven PDF pages were rasterized and visually reviewed; a missing roof sheet caused by an unescaped SVG label was fixed.
- Inspected pedestrian daylight/dusk views and the film contact sheet. Recorded all four actual model camera paths in Chromium, concatenated them with ffmpeg, and verified the bundled 1280×720 H.264 MP4 plays for 27.03 seconds. Also exercised UI reference-frame export and UI recording to IndexedDB.
- Inspected desktop and 390px mobile layouts. No page-wide horizontal overflow; the process tabs scroll horizontally on small screens. Voice/typed controls remain fixed and available.
- Missing-provider requests returned explicit connection errors. The UI reported the unavailable live quote without enabling Generate. The browser's intentional HTTP 503 in that check is expected. Normal design use produced no console errors; Three's upstream Clock deprecation and GLB texture packing notices do not prevent rendering/export.

## Exact untested live capabilities

Credentials were unavailable during the initial demo build. They are now configured locally and as owner-private Sites secrets. See the generation update below for newly exercised live integrations.

No paid AIand job was submitted. Actual account catalog/balance/terms, upload acceptance, generated video, charged amount, provider job transitions, failed-job retry, reconciliation against real history, completed MP4 retrieval and architectural drift in AI output remain unverified. Provider IDs, endpoint mappings and documented inputs were checked against current primary documentation; the app requires a live catalog price before submission. The bundled film is the original model recording, not a claim of a completed AIand generation.

## Practical limits

This is a local-browser-persisted, owner-private architectural prototype. Large assets or many projects can still exhaust browser storage; portable JSON/ZIP exports provide recovery. Browser history and recordings do not synchronize across devices. WebGL and a browser MediaRecorder encoder are required for model recording. The editor supports the exposed procedural design vocabulary; other forms can be explored as generated images inside the UI, while model proposals remain within the four parametric recipes. Pedestrian movement has no collision constraints. Lighting is art-directed, not a solar simulation. Context, equipment, security and floor levels are schematic; land-use, utility, acoustic, cooling-water, energy, flood, carbon and ecological performance remain unresolved.

## In-app generation update

- A real local `codex login status` verified ChatGPT subscription authentication. A local Vite adapter runs isolated `codex exec` jobs, strips API keys from the subprocess, disables shell/multi-agent tools, and uses the existing ChatGPT login. The hosted Worker reports Codex as unavailable and exposes the paid API option.
- Browser: started real geofence research, reloaded while running, recovered the job, reviewed seven primary-source records and applied the brief as an undoable project version. Generated and applied four local concept directions, then generated and applied all four images through subscription jobs. The batch generated the three missing images without repeating A. No prepared asset was substituted for a failed generation.
- Browser: generated a model proposal to lower height from 16m to 14m. Applying it updated the model heading and specification to 14m; Undo restored the 16m version. Palette changes update model materials and drawing legends; ungenerated images use a labeled placeholder.
- Live OpenAI fallback: GPT-5 mini background proposal completed with 670 input and 461 output tokens; GPT-5 / GPT Image 2 background image completed at 1536×1024 (main-model usage 2,618 input and 1,544 output tokens). Images incur separate image-generation billing; recorded main-model tokens are not an all-inclusive invoice. Both image paths were visually inspected.
- Security/recovery: a cross-origin local request returned HTTP 403. A real queued Codex job was cancelled immediately and its saved record returned cancelled. Node checks cover stale site/design fingerprints, camera-only changes, atomic rejection of locked or out-of-range edits, malformed palettes, and saved-project restoration. Local job files are private, and returned image paths must resolve inside their specific Codex thread or job directory.
- All generated QA projects/results live in the QA browser and private local job storage, not the prepared demo assets or committed source. Real credentials remain excluded from Git and browser bundles.

- Live voice verification: opened a real `gpt-realtime-2.1` WebRTC session with the server-held key. Sent prerecorded test speech as PCM audio over the Realtime data channel; received the editable transcript “Deepen the facade fins to 1.2 meters,” a real `update_design` function call, a model change from 0.85m to 1.2m at revision 9, and spoken confirmation. Stopped the paid session afterward. This verifies speech interpretation, function routing and feedback; physical microphone capture and acoustic quality were not tested. The temporary speech file and browser overrides were removed.

## Automatic site design workflow

- Typecheck, 27 Node tests, targeted Oxlint checks, and production build pass. Workflow coverage includes stage dependencies, concurrent images, automatic application, stale runs, cancellation during submission, reload receipts, undo, project changes, missing connections, uncertain submissions, and retrying only failed outputs.
- Browser QA with controlled provider responses: a coordinate drag paused for 1.8 seconds submitted nothing until release, then research, directions, and four images completed without an approval dialog. Reload retained all six results without new submissions. Midpoint insertion/drag likewise waited for release and produced exactly one six-output workflow; map panning submitted nothing.
- Browser QA also verified coordinate-search selection automatically uses the paid API fallback when Codex is unavailable, displays the paid provider, and applies all six outputs without approval. Generated search boundaries use the map editor’s supported coordinate precision and remain editable.
- Progress appears in the generation toolbar so it does not cover map handles. Film and export actions remain separate. The browser check used mocked generation results; no live provider generation or billing was exercised for this change.

## Drag selection and simpler Site workspace

This update replaces the earlier corner-click editor and search-triggered workflow described above. Search now moves the map; releasing a valid rectangular selection starts the existing workflow.

- All 34 Node tests pass. Seven added tests cover normalized rectangles, pointer ownership, cancellation, minimum drag size, geographic bounds, location context, and selection at the map center. Typecheck, targeted Oxlint, production build, and `git diff --check` pass.
- An isolated browser test page rendered the real SiteMap without provider callbacks. Forward and reverse drags each committed once on release. A click, tiny drag, Move map drag, and coordinate search committed nothing. A drag released beyond the map edge committed one clamped rectangle. A selection after coordinate search used the new location. Resetting the external boundary recentered the map and cleared the search.
- A small valid selection displayed both success feedback and the building-containment warning. The keyboard-accessible map-center selection produced a valid boundary and closed Map options.
- The main Site page was inspected at 390px and 1280px widths with no page-wide horizontal overflow. Research and site details start collapsed. Idle voice controls are hidden on Site; active voice sessions retain their controls. The new-project dialog asks only for an optional name and directs the user to the map.
- The temporary test route and browser tab were removed. No live generation, provider billing, or physical touch-device testing was performed for this update.
