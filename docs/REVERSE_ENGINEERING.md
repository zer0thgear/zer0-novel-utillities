# Reverse-engineering NovelAI's image API

This project is an unofficial, third-party frontend for NovelAI's image generation service, built entirely by observing and testing the real API — none of what's below comes from official API documentation for third-party developers (NovelAI doesn't publish one). This document exists so the next person attempting something similar doesn't have to re-derive all of it from scratch. If you improve on any of this or find something's gone stale, please open a PR.

Nothing here required special access, an internal contact, or a leak of any kind. Everything was found via: reading the public (if incomplete) Swagger spec, patching `fetch`/`XMLHttpRequest` in a browser console while using NovelAI's own web client, reading NovelAI's own published user-facing documentation, and cross-checking community open-source API wrapper libraries against live behavior rather than trusting them outright.

## The most important lesson

**Every "fact" below was wrong at least once before it was verified live.** Across the sessions that built this app:

- A hardcoded request parameter (`skip_cfg_above_sigma`) turned out to force on a feature ("Variety+") NovelAI's own client only enables when a user explicitly opts in — this silently made every generation non-reproducible against NovelAI's own frontend for months before it was caught.
- A well-established, multi-project community formula for NovelAI's Anlas pricing turned out to be stale by ~33% at some resolutions.
- A "Quality Tags" and "UC Preset" implementation that looked reasonable (and even had textually-correct content for one specific model/level combination) turned out to implement an entirely different *mechanism* than NovelAI's own client — a boolean toggle appending visible text, vs. NovelAI's actual hidden, multi-level, per-model preset system.

None of these were caught by code review or by "this looks right." They were caught by **comparing actual output against NovelAI's own live frontend, byte-for-byte where possible.** If you're extending this app or building your own: don't trust a value (yours, a community project's, or something you half-remember) until you've checked it against a real, current response from NovelAI's live service. Their API changes without changelog entries.

## Where to look things up

- **Swagger/OpenAPI spec**: `https://api.novelai.net/docs`. Note this host itself is stale/deprecated for actually *calling* `/ai/*` endpoints (see below) — it's still useful for the endpoint list and schemas, but don't trust its enum lists as exhaustive (e.g. it's missing V4/V4.5/V5 model IDs entirely).
  - The rendered Swagger UI page doesn't expose a fetchable `/docs/openapi.json` or similar — the spec JSON is embedded inline inside `https://api.novelai.net/docs/swagger-ui-init.js`. Fetch that file as text and search it for the endpoint path or schema name you're looking for; the whole spec is one long JSON literal inside a `<script>`-equivalent JS file.
- **docs.novelai.net** — NovelAI's own end-user documentation. Usually written for people using novelai.net directly, not API consumers, but some pages (`/en/image/qualitytags/`, `/en/image/undesiredcontent/`) turned out to document exact internal behavior (literal preset tag text) more precisely and more reliably than reverse-engineering could have gotten on its own.
- **Community API wrapper projects** (e.g. `Aedial/novelai-api`, `HanaokaYuzu/NovelAI-API` on GitHub) — useful for request/response *shape*, terrible as a source of truth for *values that can drift* (pricing constants, preset text). Cross-check anything numeric or textual you copy from one of these against a live response before shipping it.
- **Live request interception** — patch `window.fetch` and/or `XMLHttpRequest.prototype.open/send` before triggering an action on novelai.net's own frontend, log the request body. This worked reliably for most endpoints in this project's history. It reliably **failed** for two specific things: the real `/ai/generate-image` call novelai.net's own client makes (the actual call appears to happen in a context — likely a Worker — that a page-level monkey-patch can't observe), and consequently the exact request shape for NovelAI's real hidden preset system (`ucPresetId`/`qualityPresetId` fields noted but never captured). When interception fails, try the official docs route above before giving up.

## Core facts

### Host and auth

- Use `https://image.novelai.net` for all `/ai/*` and `/user/*` endpoints. `https://api.novelai.net` is stale for these — it returns `400 {"message":"Please refresh NovelAI.net. If using a third-party tool, update to the image URL."}`, a real, explicit signal from NovelAI's backend.
- `Authorization: Bearer <persistent API key>` (the `pst-...` key from Account Settings) works for image generation and most `/user/*` endpoints. A few endpoints are session-token-only and reject the persistent key with `401 {"message":"Usage of persistent access tokens is not allowed for this endpoint"}` (e.g. `/user/clientsettings`) — don't assume every endpoint behaves like `/user/subscription`.

### Generation

- `POST /ai/generate-image` (single response) and `POST /ai/generate-image-stream` (SSE, delivers intermediate preview frames then a final image) take an identical request body: `{ input, model, action, parameters }`. This envelope has been stable across V3 → V4 → V4.5 → V5; don't assume a new model generation means a new request shape.
- The non-streaming response is a **ZIP file** (magic bytes `PK`), not a raw image — this is also true for `/ai/augment-image` and `/ai/upscale`. Always check for the ZIP signature before assuming the bytes are directly decodable as an image.
- Determinism-critical parameters that are easy to get wrong because they don't correspond to any obvious UI control on NovelAI's basic interface: `skip_cfg_above_sigma` (must be `null` unless deliberately replicating NovelAI's opt-in "Variety+" feature — never hardcode a nonzero value), `prefer_brownian` (`true`) and `deliberate_euler_ancestral_bug` (`false`) affect the noise sampler for ancestral/SDE samplers. Getting any of these wrong doesn't error — it silently produces a different (but plausible-looking) image for the same seed.
- Every image NovelAI's server returns has full generation metadata embedded in the PNG file itself, as `tEXt` chunks: `Title`, `Description` (composed positive prompt), `Software`, `Source` (model name + hash — doesn't distinguish e.g. V5 Full vs Curated), `Generation_time`, and `Comment` (a JSON blob with the complete parameter set, including the same `v4_prompt`/`v4_negative_prompt` structure used in requests). No API call needed to read this — just parse the PNG chunks client-side.

### Quality Tags / UC ("Undesired Content") Presets

NovelAI's current web client exposes these as hidden, multi-level, per-model presets (Quality: None/Light/Standard for V5, fewer levels for older models; UC: None/Light/Heavy/Furry Focus/Human Focus, varies by model) — selecting a level does **not** change the visible prompt text in NovelAI's own UI, meaning the actual injected tags can't be read by inspecting the DOM or a captured request (request interception failed for this, see above).

The literal tag text for every level and every model is fully documented, unadvertised, on **docs.novelai.net**: `/en/image/qualitytags/` and `/en/image/undesiredcontent/`. Reproducing these presets client-side (append/prepend the documented literal text) is not a hack — it's how these presets worked natively before NovelAI moved the expansion server-side, and produces the same generation as NovelAI's own preset since it's the same text NovelAI itself injects.

### Anlas pricing

Not published anywhere by NovelAI. The formula (for all "modern" models — V3 through V5):

```
r = max(width * height, 65536)
per_sample = max(ceil((A*r + B*r*steps) * smea_factor), 2)
opus_discount = isOpus && steps <= 28 && r <= 1024*1024   // subtracts exactly 1 sample's cost
cost = per_sample * (n_samples - (opus_discount ? 1 : 0))
```

As of 2026-09-17, `A = 4.9e-6`, `B = 8.55e-7` fit 4 real (resolution, steps) → cost data points read directly off novelai.net's own live cost preview (adjust the Settings panel, no generation needed to see the number) exactly. **These constants will drift.** If they look wrong, re-derive them the same way: pick two resolutions and two step counts, read the 4 resulting costs off NovelAI's own UI, solve the two linear equations. A community-sourced formula predicted 42 Anlas where the real cost was 63 — don't trust a copied formula without at least one live cross-check against a non-free (non-Opus-discounted) data point. `sm`/`sm_dyn` (SMEA) multipliers (1.2x / 1.4x) are carried over from that same community formula and were **not** independently re-verified — NovelAI's current web UI has no SMEA toggle at all to test against. Strength/noise (img2img) do **not** affect cost at all, confirmed live by dragging those sliders on NovelAI's own UI at a fixed resolution/step count and watching the displayed cost stay fixed.

### Tag autocomplete

`GET /ai/generate-image/suggest-tags?model=<model>&prompt=<partial tag text>` (bearer auth, works with the persistent key). `prompt` is the *current partial tag being typed*, not the whole prompt. Response: `{ tags: [{ tag, count, confidence }] }` — exact prefix matches come first (capped `count: 10000`, `confidence: 0`), followed by semantically related tags with real scores.

### Editing endpoints (Director Tools, Upscale, Variations)

- `POST /ai/augment-image` (multipart: an `image` file part + a `request` JSON part `{ req_type, use_new_shared_trial, width, height, image: "image", ...tool fields }`) handles Remove BG, Line Art, Sketch, Colorize, Emotion, Declutter. **Always send `use_new_shared_trial: false` and never send a `recaptcha_token`** — NovelAI's own client includes a reCAPTCHA flow tied to `use_new_shared_trial: true` (claiming a free-quota trial), but omitting it entirely and paying normally works fine and needs no CAPTCHA solving. This isn't a bypass; it's simply not opting into the free-trial-claim code path.
- "Pixel Snap" is **not a server call at all** — every guessed `req_type` value returns `400`. It's implemented purely client-side by NovelAI's own frontend (downscale + palette quantization + optional upscale-back); this project reimplements an approximation of the same idea in `lib/pixelSnap.ts`, not a byte-identical port (the real algorithm is unobservable — there's no request to intercept).
- `POST /ai/upscale` (multipart, `{"image":"image","model":"nai-diffusion-5-curated","declared_blur_sigma":0}`) — the `model` field is hardcoded to a dedicated upscaler model regardless of what generated the source image. No width/height in the request; it always upscales 2x.
- "Generate Variations" in NovelAI's UI is **not** a separate endpoint — it's `/ai/generate-image` with `action: "img2img"`, the source image, `strength: 0.8`, `noise: 0.1`, a fresh random seed, and `n_samples: 3`.

## Methodology notes for your own reverse-engineering

1. **Live-test against a real account, sparingly and with explicit budget tracking.** Every fact above that involved real Anlas cost was verified with the smallest, cheapest possible generation that could answer the question (low resolution, low step count), and cross-checked against what the account's own balance actually showed afterward, not just what a UI displayed (dashboard balances can be stale/cached client-side — fetch the account endpoint fresh if you need to confirm an actual charge).
2. **Prefer reading official docs and live UI behavior over guessing at request shapes.** Several of the wrong assumptions listed above were "reasonable-looking" values that nobody had actually checked against current behavior.
3. **A value being present in a widely-used community library is not the same as it being correct today.** These projects are valuable for *shape* (what fields exist, roughly how they nest) and often stale for *content* (specific numbers, specific strings) since NovelAI's actual service evolves without a public changelog for third-party integrators.
4. **When request interception fails, it's not necessarily a dead end.** The generation request itself resisted every attempt at page-level `fetch`/`XHR` patching in this project — but the same information (exact preset tag text) turned out to be published, just not where a first search would find it (NovelAI's own end-user docs, not developer docs).
