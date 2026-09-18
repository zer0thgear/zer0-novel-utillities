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

### Account info and the Anlas balance

`GET /user/subscription` (bearer auth, works with the persistent key) returns account/subscription info, including `tier` (0=Paper, 1=Tablet, 2=Scroll, 3=Opus), `usage: { percent, isNegative, timeUntilNextPercent }` (Opus's free-generation allowance — the "X% of Opus Generations remaining" bar on novelai.net), and:

```json
"trainingStepsLeft": { "fixedTrainingStepsLeft": 9245, "purchasedTrainingSteps": 15 }
```

**Despite the name, this is the Anlas balance**, not anything related to module/LoRA training. `fixedTrainingStepsLeft + purchasedTrainingSteps` is the exact number novelai.net's header shows. This was confirmed by opening NovelAI's own "Purchase Anlas" modal, which literally labels these same two numbers "Your Subscription Anlas" and "Your Paid Anlas" — there's no other field anywhere in `/user/subscription`, `/user/data`, or `/user/information` that holds this figure, and the field name actively points away from the right answer (there's also an unrelated `perks.moduleTrainingSteps` nearby that genuinely is about module training — don't confuse the two).

One practical gotcha: this endpoint is only fetched once per page load in most implementations (this one included) — it does not update itself after a generation. If you need to confirm an actual charge happened, fetch it fresh rather than trusting a cached/displayed value that predates the generation.

### Generation

- `POST /ai/generate-image` (single response) and `POST /ai/generate-image-stream` (SSE, delivers intermediate preview frames then a final image) take an identical request body: `{ input, model, action, parameters }`. This envelope has been stable across V3 → V4 → V4.5 → V5; don't assume a new model generation means a new request shape.
- **Model IDs**: only V4 *Curated* carries `-preview` (`nai-diffusion-4-curated-preview`). V4 Full is `nai-diffusion-4-full`, and `nai-diffusion-4-full-preview` is rejected ("Validation error: model … doesn't exist"). Inpainting IDs aren't always "base + `-inpainting`": V4 Curated's is `nai-diffusion-4-curated-inpainting`, and V5 Curated has none (`nai-diffusion-5-curated-inpainting` doesn't exist), so NovelAI's client inpaints V5 Curated with `nai-diffusion-4-5-curated-inpainting`. `GET /ai/generate-image/suggest-tags?model=…` is a free way to check an ID: unknown models return 400 "Model not found".
- The non-streaming response is a **ZIP file** (magic bytes `PK`), not a raw image — this is also true for `/ai/augment-image` and `/ai/upscale`. Always check for the ZIP signature before assuming the bytes are directly decodable as an image.
- Determinism-critical parameters that are easy to get wrong because they don't correspond to any obvious UI control on NovelAI's basic interface: `skip_cfg_above_sigma` (must be `null` unless deliberately replicating NovelAI's opt-in "Variety+" feature — never hardcode a nonzero value), `prefer_brownian` (`true`) and `deliberate_euler_ancestral_bug` (`false`) affect the noise sampler for ancestral/SDE samplers. Getting any of these wrong doesn't error — it silently produces a different (but plausible-looking) image for the same seed.
- **Don't send `qualityToggle`.** NovelAI's current client never sends it: it migrated the old boolean to `qualityPresetId` and composes quality tags client-side. The server still reads it, though. On 2026-09-18, with an otherwise identical request (V5 Full, seed 1234567, quality Standard, UC Heavy), `qualityToggle: true` gave an image about 2 levels brighter on average than novelai.net's (max 9/255 on an 8×12 block-mean grid). Leaving it out, or sending `false`, matched novelai.net's image exactly on that grid. Other fields its client sends that we don't made no measurable difference: `params_version: 4` (we send 3), `tag_hint_qt` / `tag_hint_uc_preset` (numeric preset hints), `straight_alpha`, and `stream: "msgpack"` on the stream endpoint.
- **Comparing images across runs:** exact pixel hashes now differ between two identical requests (tiny GPU-level noise), so compare downsampled grids instead: an 8×12 block mean, `imageSmoothingQuality: 'high'`. novelai.net also re-encodes the PNG it shows (one big IDAT, no `pHYs`, a larger file) from its msgpack stream. The pixels still compare fine, but file bytes and sizes won't match the API's PNG.
- Every image NovelAI's server returns has full generation metadata embedded in the PNG file itself, as `tEXt` chunks: `Title`, `Description` (composed positive prompt), `Software`, `Source` (model name + hash — doesn't distinguish e.g. V5 Full vs Curated), `Generation_time`, and `Comment` (a JSON blob with the complete parameter set, including the same `v4_prompt`/`v4_negative_prompt` structure used in requests). No API call needed to read this — just parse the PNG chunks client-side.

### Quality Tags / UC ("Undesired Content") Presets

NovelAI's current web client exposes these as hidden, multi-level, per-model presets (Quality: None/Light/Standard for V5, fewer levels for older models; UC: None/Light/Heavy/Furry Focus/Human Focus, varies by model) — selecting a level does **not** change the visible prompt text in NovelAI's own UI, meaning the actual injected tags can't be read by inspecting the DOM or a captured request (request interception failed for this, see above).

The literal tag text for every level and every model is fully documented, unadvertised, on **docs.novelai.net**: `/en/image/qualitytags/` and `/en/image/undesiredcontent/`. Reproducing these presets client-side (append/prepend the documented literal text) is not a hack — it's how these presets worked natively before NovelAI moved the expansion server-side, and produces the same generation as NovelAI's own preset since it's the same text NovelAI itself injects.

**Update (2026-09-18): NovelAI's client is the source of truth, not the docs. This app now follows the client.** The client's JS bundle has its own preset tables, and its request builder uses them: quality first, then `uc = ucPreset(model, ucPresetId, finalPrompt, uc)`. Where the client differs from the docs:
- Quality: V4.5 Full "Standard" has no leading `location`, and V4 Curated uses `best quality`, not `amazing quality`.
- UC lists: V4 Full and V4 Curated Heavy and Light end with `white blank page, blank page`. V3 Furry has its own Heavy and Light lists, not V3 Anime's, and no Human Focus.
- **`nsfw` in the UC**: on every non-Curated model (V3, V4 Full, V4.5 Full, V5 Full), whenever a UC preset other than None is selected, `nsfw, ` goes in front of the UC unless the final positive prompt contains "nsfw" (case-insensitive substring).
- **Placement**: on V4+, quality tags (and on V5, `transparent background` just before them) go before the first `text:` section (`/(?:^|\s|[,.:[\]{}、。])text:(?!:)/i`), so they aren't rendered as text, and only onto the first prompt-mix `|` part. The UC preset also goes on the first `|` part only. V3 appends quality to every `|` part, ahead of a trailing `:weight`.
- There is no removal of UC preset tags that also appear in the positive prompt. An earlier version of this app did that; it's gone.

The V5 and V4.5 Full UC lists and the V5, V4 Full and V3 quality texts already matched the docs. The app's one deliberate deviation is comma normalization at the joins (`joinPromptParts`), so no `,,` appears where NovelAI would produce one. After aligning, the app's token counts equal NovelAI's on V4.5 Full and V5 Curated with quality, UC preset and a character.

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

`GET /ai/generate-image/suggest-tags?model=<model>&prompt=<partial tag text>` (bearer auth, works with the persistent key). `prompt` is the *current partial tag being typed*, not the whole prompt. Response: `{ tags: [{ tag, count, confidence }] }` — exact prefix matches come first (capped `count: 10000`, `confidence: 0`), followed by semantically related tags with real scores. `model` genuinely changes the result set/order, not just a vocabulary filter on one shared list — double-check you're passing the exact model string the live UI is set to before comparing, a mismatch (e.g. `nai-diffusion-4-5-curated` vs `nai-diffusion-5-curated`) silently gives a different-looking but plausible result.

NovelAI's own client renders each suggestion as a chip with a small relevance dot. That dot's brightness tracks `count`, not `confidence` — confirmed by reading the dot's actual computed CSS color for a live response and comparing against that response's JSON (two tags with the same `confidence` but very different `count` had very different dot brightness). It also debounces roughly 500ms after the last keystroke before firing the request (timed by patching `window.fetch` on novelai.net itself and diffing the request timestamp against the triggering keystroke's `input` event, twice, for consistency).

### Prompt token counting

NovelAI counts prompt tokens entirely client-side, in a Web Worker that loads `https://novelai.net/tokenizer/compressed/<name>.def?v=2&static=true`. That file is proprietary compressed JSON, and it's served without CORS headers, so other origins can't use it. Which tokenizer and limit apply depends on the model:

| Models | Tokenizer | Limit |
| --- | --- | --- |
| V5 Full | Qwen 3.5, byte-level BPE (`qwen35_tokenizer.def`: 248,070 tokens, 247,587 merges, NFC) | 1471 |
| V5 Curated | same | 703 |
| V4 / V4.5 (all variants) | T5, SentencePiece Unigram (`t5_tokenizer.def`: the standard 32,100-piece T5 vocab) | 512 |
| V3 | CLIP BPE | 225 per prompt |

Details that matter for matching its numbers exactly:
- **One shared budget, not one per field.** For V4 and later, the base prompt and every enabled character's prompt draw on the same limit. The negative prompt and every character's negative share a second one. Disabled characters count 0.
- **Counted text is the composed text**: the quality preset is added to the base prompt and the UC preset to the negative, exactly as in the request (see the update above). Character fields are counted as typed.
- **Preprocessing**: inside `||a|b||` random groups only the longest option counts. The text is then split on single `|` (the old prompt-mix separator, at most 6 parts) and each part is counted separately. NovelAI's own `text:` macros are expanded first; this app has none.
- **T5 specifics**: `[`, `]`, `{`, `}` and every `-?\d*\.?\d*::` are stripped first. There is no normalizer, although the HF config lists a Precompiled one. The text is split on `/\s+/` without dropping empty strings, so a leading or trailing space costs a `▁` token. Every word gets a `▁` prefix. The Viterbi lattice walks UTF-16 code units. Every part includes EOS (`</s>`), so an empty field counts 1.
- **Qwen specifics**: nothing is stripped (braces and `1.5::` weights count), and there's no EOS. The pre-tokenizer regex is Qwen's, with `\s` written out as Unicode White_Space. Literal special tokens such as `<|endoftext|>` count as 1.

This app bundles the open Apache-2.0 equivalents: the T5 vocab from `google-t5/t5-base` and Qwen 3.5's `merges.txt`, in `public/tokenizers/`. It reimplements the counting in `lib/tokenizers/`. Verified on 2026-09-18 by running NovelAI's own tokenizer worker in a logged-in novelai.net tab against a seeded 1,520-prompt corpus: tags, weights, unicode, emoji, whitespace edge cases, special tokens. **0 mismatches** for T5 or Qwen. The harness caught deliberate single-rule mutations (282 to 796 mismatches). Full-pipeline counts (quality tags, UC preset, a character) were also checked against the numbers NovelAI's UI displays.

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
