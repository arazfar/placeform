# Model cinema verification — 8 September 2026

New films are rendered from immutable snapshots of the active Three.js model, independently of the selected concept image. The output is a silent 24-second, 1920 × 1080 sequence at 24 fps. Local generation makes no AIand requests.

## Automated validation

- TypeScript, Oxlint, production build and all 72 Node tests passed.
- Camera tests cover all four models, per-instance collision bounds, architecture-only framing, all sampled detail sightlines, finite poses, eased starts, site rotation, transition intervals and the final hold.
- Snapshot tests verify independently owned geometry and materials and source identity after changing or disposing the original model.
- Tests also cover interrupted jobs, malformed or mismatched history, MP4 preference, WebM fallback, and unsupported encoders.

## Real browser and export checks

Used headed Chromium through Playwright against the local development app. No provider generation was mocked or billed: all four reviewed films came from real Three.js frames and the browser H.264 encoder.

| Concept | Decoded frames | Duration | Resolution | Frame rate | Packet timestamps |
| --- | ---: | ---: | --- | --- | --- |
| A — Terrace Commons | 576 | 24.000 s | 1920 × 1080 | 24 fps | Verified |
| B — Folded Horizon | 576 | 24.000 s | 1920 × 1080 | 24 fps | Verified |
| C — Civic Dune | 576 | 24.000 s | 1920 × 1080 | 24 fps | Verified |
| D — Lantern Spine | 576 | 24.000 s | 1920 × 1080 | 24 fps | Verified |

FFprobe decoded each final film and verified every packet presentation timestamp against its frame index. The ZIP video bytes match the direct download. Each ZIP contains its GLB, specification, sequence, source manifest and thumbnail, and every source identity agrees. Restored GLBs retain all original model parts (A: 174; B: 478; C: 523; D: 76) and instance counts. Bounds match exactly except for approximately 6e-8 metres of GLTF floating-point conversion on C.

- Changed from A to B during A's render; the completed film and export remained A, revision 1.
- Rendered a saved D take while B was selected; the completed video remained D, revision 4.
- Forced storage quota failure only when writing the completed video. A warning remained visible and the full 576-frame video was still downloadable. Reload marked the unsaved take interrupted.
- Cancelled an active render; history recorded cancelled. Reloaded during another active render; its history recovered as interrupted, without a partial video marked complete.
- Preview rendered a moving canvas and cancellation removed it. Stale scene handles were rejected after model selection changed.
- Forced actual WebGL context loss on an isolated cinematic renderer; the next frame failed with an actionable error, and resources were disposed.
- Confirmed legacy cached video retrieval using a QA cache fixture, without a provider request. Live AIand history retrieval was not exercised.
- Played the final D film through to 24 seconds in Chromium with zero dropped playback frames. Reviewed contact sheets for all four films and dense samples across the orbit/detail dissolve.
- At a 390 px viewport, document width remained 390 px and generation stayed available.

## Visual refinements

The first pass exposed an initially zero-sized hidden model canvas, low approach framing, excessive fill light, and tree-obscured detail targets. Film now mounts its source canvas with explicit dimensions, elevates wide paths to expose roof geometry, uses more directional light with restrained fill, and checks facade sightlines. A second review found that Lantern Spine's named entrance canopy was being selected as a facade target; the planner now filters by semantic facade type. A corrected D film was generated and reviewed.

The images retain the existing procedural model's geometry and materials, including its stylized landscaping and schematic interiors. Lighting and choreography improve presentation without inventing detail or implying photoreal reconstruction. H.264 was exercised in Chromium; VP9 selection and unsupported-browser handling were tested through controlled capability responses, not a second physical browser.

Local QA artifacts are ignored by Git under `output/playwright/`: `cinematic-A.mp4` through `cinematic-D.mp4`, matching ZIP packages, review contact sheets, transition samples, and `video-verification.json`. These are verification outputs, not application assets.
