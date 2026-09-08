# Placeform: AIand cinematic workflow research

Verified 2026-09-08 against public official sources. Research only: no credentials inspected, authenticated catalog requested, files uploaded, or paid jobs started. No checkout files changed.

## Decision

MiniMax H3 exists: MiniMax announced H3 on July 31, 2026 and open-sourced it August 3. Native model support includes 768p and a separate H3-Regenerate-2K stage. This does not establish a 2K AIand endpoint. [MiniMax announcement](https://www.minimax.io/blog/minimax-h3), [MiniMax technical release](https://www.minimax.io/news/minimax-h3-open-source).

AIand's English documentation names `minimaxai/minimax-h3`. Its Japanese translation still shows `minimax-h3`; resolve availability and exact IDs from the authenticated video catalog at runtime. Live organization entitlement, pricing, agreement, balance, and output quality remain unverified. [English API](https://docs.aiand.com/api/videos/), [Japanese API](https://docs.aiand.com/ja/api/videos/).

## Documented API contract

API origin: `https://api.aiand.com`. All paths below use Bearer authentication. [Authentication](https://docs.aiand.com/authentication/).

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/videos/models` | Video catalog/pricing |
| GET | `/v1/videos/acceptance` | Current agreement |
| POST | `/v1/files` | Multipart asset upload |
| POST | `/v1/videos` | Submit |
| GET | `/v1/videos/{id}` | Poll |
| GET | `/v1/videos/{id}/content` | MP4 bytes |
| GET | `/v1/videos?limit=20&after={id}` | History |

Request examples use verified field names; prompts and placeholder IDs below are original examples. [Videos contract](https://docs.aiand.com/api/videos/).

```json
{
  "model": "minimaxai/minimax-h3",
  "prompt": "Slow architectural dolly toward the entrance; retain the reference building shape and materials.",
  "seconds": 8,
  "aspect_ratio": "16:9",
  "image_reference": [
    { "file_id": "file-start", "role": "first_frame" },
    { "file_id": "file-end", "role": "last_frame" }
  ]
}
```

Alternative conditioning shape:

```json
{
  "model": "minimaxai/minimax-h3",
  "prompt": "Move the camera around the referenced building, preserving its design.",
  "seconds": 8,
  "aspect_ratio": "16:9",
  "references": {
    "images": [{ "file_id": "file-design" }],
    "videos": [{ "file_id": "file-motion" }],
    "audio": [{ "file_id": "file-sound" }]
  }
}
```

Validation: prompt ≤7000 characters; seconds 4–15; aspect ratios `Auto|21:9|16:9|4:3|1:1|3:4|9:16`. Conditioning shapes are mutually exclusive. Frame roles are unique and either works alone. References require an image/video anchor. Limits: images 8×30MiB; videos 2×50MiB; audio 3×15MiB; clips 2–15s. Output: 768p MP4/audio. [Videos](https://docs.aiand.com/api/videos/).

Upload multipart fields: `file` bytes and explicit `purpose=vision|video|audio`. Returned file metadata includes `id`, `object`, `bytes`, `created_at`, `filename`, `purpose`, `expires_at`. For this workflow, enforce the smaller video-generation limits above rather than the Files API's general 100MB upload ceiling. Image MIME types: PNG/JPEG/WebP/GIF; video: MP4/WebM/QuickTime; audio includes WAV/MP3/FLAC/OGG/WebM/MP4/M4A. Private uploaded file IDs are supported; no public hosting is needed. Files expire independently after 30 days. [Files API](https://docs.aiand.com/api/files/).

Documented job keys: `id,object,model,prompt,seconds,status,error,cost,currency,created_at,completed_at`. Statuses: `moderating,queued,in_progress,completed,failed,canceled`; unknown statuses remain active. Poll every 10–30s. [Videos](https://docs.aiand.com/api/videos/).

## Money, access, errors

Catalog pricing example: `{"resolution":"768p","per_second":"0.080000","currency":"usd"}`. Quote = rate × seconds; 8s at that example rate is $0.64. Successful completion charges; failed/timed-out/canceled jobs do not. Submission fixes the quote and requires balance covering all outstanding renders. Renders cannot be aborted. Finished records/output expire after 30 days. [Videos](https://docs.aiand.com/api/videos/).

Set `AIAND_API_KEY` on the application server, never in a browser bundle. Create an organization-scoped key through console Settings → API Keys. Its organization is inferred from the key, so inference requests do not need `X-Org-ID`. Key-management endpoints require console JWT and organization context. [Organization API keys](https://docs.aiand.com/organizations/api-keys/).

The person using the key must accept current Video Service Terms in the console playground. API keys cannot record agreement; `POST /v1/videos/acceptance` requires console login. [Videos agreement](https://docs.aiand.com/api/videos/#agreement).

`GET https://api.aiand.com/billing/balance` returns decimal strings `balance` and `currency`. This endpoint is outside `/v1`. It shows settled balance; queued/running render reservations are not deducted yet. Treat local estimates as advisory until the server accepts a job and returns its quote. [Balance API](https://docs.aiand.com/billing/balance/).

Video-specific codes: `400 invalid_request_error`, `403 agreement_required`, `402 insufficient_credits`, `404 model_not_found`, `429 concurrency_limit_exceeded`, `409 conflict`; asynchronous failures include `moderation_blocked` and `moderation_unavailable`. [Videos errors](https://docs.aiand.com/api/videos/#errors).

General error envelope: `{"error":{"message":"...","type":"...","param":null,"code":null}}`; code/param may be omitted or null. Handle `401 invalid_api_key`, `404 file_not_found`, `410 file_expired`, `429 rate_limit_exceeded`, and provider transport/server errors. Retry safe reads using bounded backoff. [Error reference](https://docs.aiand.com/errors/).

## Proposed implementation (engineering recommendations)

1. Build a server-owned AIand adapter with typed upload, model listing, agreement check, submit, poll, and content methods. Keep provider origin configured internally; allow no arbitrary user-supplied proxy URL.
2. At export setup, fetch the actual video catalog. Enable H3 only if its exact ID is returned. Show provider/model/resolution and a decimal-derived total for the selected clip count and durations. If unavailable, give a real unavailable state; never replace it silently with Hailuo or a mocked success.
3. Turn each saved camera shot into an approved prompt plus frame assets. Use first/last frames for a specified camera move; use references when preserving a building or material identity across multiple views matters. Store the user's chosen conditioning mode explicitly.
4. Render frame assets from the real scene at a consistent aspect ratio. Attach asset hashes, project revision, camera transforms, coordinate origin, selected model, pricing snapshot, and shot order to a local job record. Strip editor UI from reference renders.
5. Validate file size, MIME type, media duration, role uniqueness, and counts before upload. Because AIand's contract does not promise acceptance of every Files MIME type at the engine layer, normalize MVP captures to PNG/JPEG and motion references to MP4.
6. Before a paid request, present a concrete review: thumbnails, prompts, lengths, aspect ratio, selected model, and total estimate. The underlying workflow needs key, accepted terms, available model, and sufficient spendable credits. Do not silently submit as a side effect of editing a shot.
7. Persist a local submission intent before POST, then provider ID and quoted cost immediately on acceptance. No documented idempotency key or webhook was found. Therefore do not automatically replay an uncertain POST. Reconcile through job history and mark ambiguity for review to prevent duplicate charges.
8. Use a durable poller at 15–30s intervals. Persist upstream status verbatim alongside normalized UI state; unknown statuses remain pending. Reconnect clients to stored jobs after reload. Show errors from real provider results and preserve already completed shots when another fails.
9. On completion, stream authenticated MP4 bytes into application-owned storage and expose an authorized media URL to the client. Persist actual provider quote, currency, completion time, and media checksum. A video tag cannot carry the provider Bearer header directly.
10. Offer individual downloads and an optional final local composition step for transitions/title/audio. Keep AI generation and clip editing distinct in saved metadata so a user can trace what was actually generated.

Quality evaluation is still pending. A useful paid pilot, once specifically authorized, would compare one first-frame job and one first/last-frame job using the same architecture, camera move, and duration. Assess geometry retention, facade/text fidelity, motion consistency, audio suitability, first/last-frame matching, and actual render time. No quality claim is justified by the docs alone.

## Three.js / MapLibre / Terra Draw cross-check

MapLibre's current official Three.js example uses a `custom` layer with `renderingMode:'3d'`, a shared map canvas/WebGL context, `renderer.autoClear=false`, and `renderer.resetState()` before drawing. Coordinates use `MercatorCoordinate.fromLngLat` plus `meterInMercatorCoordinateUnits()`. Its current render callback accesses `args.defaultProjectionData.mainMatrix`; do not blindly reuse old `(gl,matrix)` snippets across major versions. The example is pinned to MapLibre 6.8.0 and Three 0.169.0; these are example versions, not a claim about the newest compatible release. [Official Three.js example](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-using-threejs/).

Terra Draw's core adapter guide uses `new TerraDrawMapLibreGLAdapter({map})`, passed into `new TerraDraw({adapter,modes})`. The adapter is a separate `terra-draw-maplibre-gl-adapter` package; no `lib` parameter is shown. The library support table currently claims MapLibre v4/v5. That differs from MapLibre's current example version, so verify installed package peer/types and run a smoke test before upgrading the repo. [Adapter guide](https://github.com/JamesLMilner/terra-draw/blob/main/guides/3.ADAPTERS.md), [Library compatibility](https://github.com/JamesLMilner/terra-draw).

MapLibre separately documents `@watergis/maplibre-gl-terradraw` as a ready-made control with point/line/polygon/rectangle/circle/freehand/select modes and `map.addControl`. A custom product toolbar can instead drive core Terra Draw directly. [Official drawing example](https://maplibre.org/maplibre-gl-js/docs/examples/draw-geometries-with-terra-draw/).
