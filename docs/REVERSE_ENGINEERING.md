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

**The Opus allowance, as NovelAI's client reads it** (from its bundle, 2026-09-18):
- `timeUntilNextPercent` is misnamed: it's seconds *per* 1% of refill (a rate), not a countdown. The client's debug override labels it "Sec / %", and shows `round(86400 / timeUntilNextPercent, 1)` as "Currently refills at [0]% per day". A typical value is ~7,900 s, about 11% a day.
- Images remaining are an estimate: `round(17.3 × percent)`, so about 1,730 when full. It uses the same factor for the refill rate ("~[1] images").
- The shown percent is 0 while `isNegative`, and isn't capped at 100 in the "More Info" dialog. At 100% or more, it says "Recovery is paused above 100%." The low-usage banner appears under 5% or when negative.

One practical gotcha: this endpoint is only fetched once per page load in most implementations (this one included) — it does not update itself after a generation. If you need to confirm an actual charge happened, fetch it fresh rather than trusting a cached/displayed value that predates the generation.

### Generation

- `POST /ai/generate-image` (single response) and `POST /ai/generate-image-stream` (SSE, delivers intermediate preview frames then a final image) take an identical request body: `{ input, model, action, parameters }`. This envelope has been stable across V3 → V4 → V4.5 → V5; don't assume a new model generation means a new request shape.
- **Model IDs**: only V4 *Curated* carries `-preview` (`nai-diffusion-4-curated-preview`). V4 Full is `nai-diffusion-4-full`, and `nai-diffusion-4-full-preview` is rejected ("Validation error: model … doesn't exist"). Inpainting IDs aren't always "base + `-inpainting`": V4 Curated's is `nai-diffusion-4-curated-inpainting`, and V5 Curated has none (`nai-diffusion-5-curated-inpainting` doesn't exist), so NovelAI's client inpaints V5 Curated with `nai-diffusion-4-5-curated-inpainting`. **Presets follow the model actually sent**: that V5 Curated inpaint gets V4.5 Curated's quality text (`…, very aesthetic, masterpiece, no text, -0.8::feet::, rating:general`) and V4.5 Curated's UC lists, not V5's. A level V4.5 Curated doesn't have (Light quality, Furry Focus UC) means no preset. This was confirmed on 2026-09-18 from novelai.net's own outgoing request: its page calls `window.fetch` for `/ai/generate-image-stream` with a `FormData` whose `request` part is the JSON body, so a `fetch` wrapper can read it. Its displayed and IndexedDB-stored inpaint results carry no metadata, because they're composited client-side, so the request is the only place to see this. `GET /ai/generate-image/suggest-tags?model=…` is a free way to check an ID: unknown models return 400 "Model not found".
- The non-streaming response is a **ZIP file** (magic bytes `PK`), not a raw image — this is also true for `/ai/augment-image` and `/ai/upscale`. Always check for the ZIP signature before assuming the bytes are directly decodable as an image.
- Determinism-critical parameters that are easy to get wrong because they don't correspond to any obvious UI control on NovelAI's basic interface: `skip_cfg_above_sigma` (must be `null` unless deliberately replicating NovelAI's opt-in "Variety+" feature — never hardcode a nonzero value), `prefer_brownian` (`true`) and `deliberate_euler_ancestral_bug` (`false`) affect the noise sampler for ancestral/SDE samplers. Getting any of these wrong doesn't error — it silently produces a different (but plausible-looking) image for the same seed.
- **Don't send `qualityToggle`.** NovelAI's current client never sends it: it migrated the old boolean to `qualityPresetId` and composes quality tags client-side. The server still reads it, though. On 2026-09-18, with an otherwise identical request (V5 Full, seed 1234567, quality Standard, UC Heavy), `qualityToggle: true` gave an image about 2 levels brighter on average than novelai.net's (max 9/255 on an 8×12 block-mean grid). Leaving it out, or sending `false`, matched novelai.net's image exactly on that grid. Other fields its client sends that we don't made no measurable difference: `params_version: 4` (we send 3), `tag_hint_qt` / `tag_hint_uc_preset` (numeric preset hints), `straight_alpha`, and `stream: "msgpack"` on the stream endpoint.
- **Request fields now mirror novelai.net's own (captured 2026-09-18).** This app sends:
  - `params_version: 4`.
  - The named presets `qualityPresetId` / `ucPresetId`, plus their numeric hints `tag_hint_qt` / `tag_hint_uc_preset` (none 0, standard 1, heavy 2, light 3, humanFocus 4, furryFocus 5). The preset *text* is still composed client-side.
  - `straight_alpha: true` on V5, which is NovelAI's default setting.
  - `autoSmea: false` and `normalize_reference_strength_multiple: true` on V4+, plus `legacy_v3_extend: false` everywhere.
  - `inpaintImg2ImgStrength: 1` on V4+ generations, and `add_original_image: true`.

  It no longer sends:
  - `ucPreset` (numeric).
  - `sm` / `sm_dyn` outside V3.
  - Empty `reference_*_multiple` arrays.
  - `skip_cfg_above_sigma` outside V3.

  It skips the transport-only `stream: "msgpack"` / `image_format: "webp"`. None of these changed the image: identical output with the old and new field sets.
- **V3 must not get the V4 caption fields.** `v4_prompt` or `v4_negative_prompt` on a `nai-diffusion-3` request gets a bare `500 Internal Server Error`. NovelAI omits both, along with `use_coords` and `legacy_uc`, for V3, and sends `skip_cfg_above_sigma: null` and `characterPrompts: []`.
- **The same request can produce a different image on a different day.** On 2026-09-18 an identical V5 Full request (same seed, prompt and parameters, same `model_hash` 0ADF9AB7) produced a visibly different image in the evening than in the morning, on novelai.net and in this app alike. The two still matched each other exactly. Always regenerate the reference image on novelai.net just before comparing; never reuse an old one.
- **Comparing images across runs:** exact pixel hashes now differ between two identical requests (tiny GPU-level noise), so compare downsampled grids instead: an 8×12 block mean, `imageSmoothingQuality: 'high'`. novelai.net also re-encodes the PNG it shows (one big IDAT, no `pHYs`, a larger file) from its msgpack stream. The pixels still compare fine, but file bytes and sizes won't match the API's PNG.
- Every image NovelAI's server returns has full generation metadata embedded in the PNG file itself, as `tEXt` chunks: `Title`, `Description` (composed positive prompt), `Software`, `Source` (model name + hash — doesn't distinguish e.g. V5 Full vs Curated), `Generation_time`, and `Comment` (a JSON blob with the complete parameter set, including the same `v4_prompt`/`v4_negative_prompt` structure used in requests). No API call needed to read this — just parse the PNG chunks client-side.
- **The same metadata is also hidden in the alpha channel** ("stealth" metadata). It survives what strips text chunks, such as the browser re-encoding an image copied to the clipboard, which is how novelai.net still imports a pasted image. Format, from NovelAI's client: one bit per pixel, the lowest bit of alpha, read **down each column in turn** (bit `i` is at row `i % height`, column `floor(i / height)`), each byte most significant bit first. It holds the ASCII marker `stealth_pngcomp`, a 32-bit big-endian length **in bits**, then gzipped UTF-8 JSON with the same fields as the text chunks (`Comment` is still a JSON string, and the key is `Generation time`, with a space). The client skips images over 16,777,216 px. It survives lossless formats only (PNG, or WebP whose alpha was kept losslessly).
- **Import checks `request_type`** in `Comment`: `Img2ImgRequest` and `NativeInfillingRequest` get "This image was generated using Image2Image (or Inpainting) and cannot be reproduced from its metadata." Vibe Transfer without encodings and Precise Reference get the same warning. An image with `req_type` (a Director Tools result) is not offered for import.
- **Every request image is prepared by the client before it's sent.** This covers Img2Img, Enhance, Variations, Inpaint and Edit. NovelAI's shared request step runs each one through the same function (`rX`), in this order:
  1. Decode the image exactly.
  2. If it carries the stealth marker (and is ≤16,777,216 px), map alpha 254 to 255 and 1 to 0.
  3. If its size differs from the request's `width`×`height`, resize it with **Pica** (`resizeBuffer`, `filter: "lanczos3"`, default options; Pica 9.0.1 and 10.0.3 both reproduce it bit for bit).
  4. Blend any transparency onto **white**, or onto nothing on V5 (the only model with `transparency`).
  5. Re-encode as PNG.

  The mask goes through the same step with a **black** background and nearest-neighbour resizing. The same step also turns SMEA off (`sm`/`sm_dyn`) and, when the request has no `extra_noise_seed`, sets it to **`seed − 1`**. **After** the image is prepared, it rounds any `width`/`height` that isn't a multiple of 64 to the nearest one (ties up). The image keeps the unrounded size and the server scales it the rest of the way. The server can't render a size that isn't a multiple of 64: 1248×1824 failed with a 500 on both endpoints ("Error generating image, an internal error occurred" on the stream), uncharged. Variations reuses the source image's own `extra_noise_seed` when it has one, because its parameters are copied from that image. Separately, loading an image into the canvas (Img2Img base, Inpaint, Edit) erases the stealth bits too.

  Verified 2026-09-18 in three ways. First, NovelAI's request for a pasted test image: 882 pixels at alpha 254 and 10 at alpha 1 came out as 255 and 0, and `extra_noise_seed` was `seed − 1` twice. Second, NovelAI's own resize, called in its page through webpack's require. Third, its whole prep step, run on a test image with the marker, alpha 1 and half-transparent pixels; this app's `lib/requestImage.ts` matches it pixel for pixel, resized or not, on white or transparent. NovelAI's request carries the image as a multipart `image` part (the JSON holds `"image": "image"`), and after the first upload it sends an `image_cache_secret_key` instead. This app sends base64 in the JSON, which the API still accepts.
- **Enhance, as NovelAI's client does it.**
  - **Scales:** an 832×1216 or 1216×832 image gets 1.5× and 1×. Other sizes get whichever of 2×, 1.5× and 1× stay ≤3,145,728 px and land on multiples of 64 (the step for every model). V5 (`maxEnhance`) adds **Max** for images under 2,516,582.4 px. The default is the first option (so Max on V5), or the last pick remembered per pixel count.
  - **Size:** the client resizes the source to the plain multiplication, rounded down, then rounds the request to multiples of 64. So **1.5× of 832×1216 sends a 1248×1824 image in a 1280×1856 request** (captured from novelai.net on 2026-09-18), and the result is 1280×1856.
  - **Max:** requests the image's own size with `upscaled_enhance: true`, and the server upscales. The client expects `min(2, √(3145728/px))`× back, e.g. 1467×2144 from 832×1216.
  - **Price:** the multiplied size rounded to the nearest multiple of 64 (ties up); for Max, a 32-aligned size within 3.1 MP (1440×2144 from 832×1216).
  - **Prompt:** only on V4.5 and V5 (`enhancePromptAdd`), and not for Max. Unless the prompt already contains "upscaled, blurry", it splices in the raw text `, -2::upscaled, blurry::,`, trailing comma included. It goes in at the `text:` section match (the match includes the character before `text:`) or at the end. The metadata NovelAI stores shows it without the trailing comma, but the request has it.
  - **Levels:** strength and noise per level are 0.2/0, 0.4/0, 0.5/0, 0.6/0 and 0.7/0.1.
  - **Live check (2026-09-18, V5 Full, 832×1216 source, 23 steps, level 3).** 1.5× charged 30 Anlas and returned 1280×1856. Max charged 38 Anlas and returned **1467×2144**. Both match NovelAI's displayed prices and this app's estimates, and 1467×2144 is the size NovelAI's client expects back from Max. Both requests matched what novelai.net sends for the same enhance.

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

Not published by NovelAI, but its web client computes every price locally. The formulas below were read from novelai.net's bundle on 2026-09-18 and checked against prices its UI displays, for example 832×1216 at 30 steps: V5 Curated 32, V4.5 Full 21.

```
pixels     = width * height
perSample  = ceil(2.951823174884865e-6 * pixels + 5.753298233447344e-7 * pixels * steps)
             * (sm && sm_dyn ? 1.4 : sm ? 1.2 : 1)
if V5:       perSample *= 1.5
perSample  = max(ceil(perSample * strength), 2)      // strength = img2img/enhance strength, else 1
free       = Opus && pixels <= 1048576 && steps <= 28 && !(V5 && usage.isNegative)
cost       = perSample * (n_samples - (free ? 1 : 0))
```

- **V3, V4, V4.5 and V5 share the curve, and V5 costs 1.5× more.** An earlier empirical fit used one curve for every model. It happened to match V5 but overstated V3/V4/V4.5 by about 1.5×.
- **img2img strength scales the price.** An earlier "confirmed live" note said it didn't. That check almost certainly happened at a size where the Opus allowance made everything read 0.
- **Only V5 has an Opus usage limit** (`usage.isNegative` on `/user/subscription`). Once it's used up, V5 stops being free; other models don't.
- **Upscale** (`/ai/upscale`) is a flat price by input size, with no Opus discount: ≤1 MP 1, ≤1.75 MP 2, ≤2.45 MP 3, ≤3.1 MP 4. NovelAI's own UI doesn't offer Upscale above 1 MP.
- **Director Tools** are priced as a 28-step V3 generation at the image's size clamped to 1–3.1 MP, so Opus gets them free at ≤1 MP. Background removal is 3× that plus 5, and never discounted. Pixel Snap is free.

### V5's automatic text section

"Put text in quotes" is done by novelai.net's **client**, not the server. Its last step before sending (after quality tags, the fur prefix and any Enhance addition) runs this when the model's `autoText` flag is set, which is **V5 only**:
1. **Collect** the quoted strings in the prompt's first mix part, then in each enabled character prompt. Characters go in reading order when `use_coords` is on: rows top to bottom, split where y jumps more than 0.1 or the row spans more than 0.15, then left to right. The quote pairs are `"…"`, `“…”`, `「…」`, `‘…’` and `'…'`. A `'` only opens after a space, comma, full stop or the start, and a closing `'` or `’` followed by a letter or digit is an apostrophe.
2. **Reverse for CJK:** if the gathered text is more than 30% CJK, each group's order is reversed.
3. **Append** `, teXt: <strings joined by blank lines>` to the first mix part.
4. **Skip entirely** if the prompt or any character prompt already has a `text:` section in any case, or nothing was quoted.

The capital X marks the section as automatic. The client's import strips a `teXt:` section again when it's exactly what would have been generated.

This app mirrors it in `lib/autoText.ts`, applied in `buildImageRequest` and stripped on import. Checked on 2026-09-19 in three ways:
- **Against NovelAI's own functions:** 20,000 random prompts through both, with 0 differences in adding or stripping.
- **Requests:** a captured novelai.net request matched this app's field for field (`…, no text, teXt: Hello World`).
- **Images:** same-seed generations on both sites (quoted and unquoted prompts) matched exactly on the block-mean grid.

### Variety+ (`skip_cfg_above_sigma`)

NovelAI's model table calls this `cfgDelay` and gives each model the sigma it starts from (`cfgDelaySigma`). The UI toggle is just on or off; its client turns that into the field's value on the way out:

- **Which models:** V4, V4.5 and V3 have `cfgDelay: true`; **V5 does not**, and its client *deletes* the field for any model without it (`PE(model).cfgDelay || delete parameters.skip_cfg_above_sigma`). Models that do have it send `null` when the toggle is off.
- **Starting sigma:** 58 on V4.5, 19 on V4 and V3.
- **Scaled by size:** just before sending, the sigma is multiplied by `√(⌊w/8⌋·⌊h/8⌋ / (104·152))` — the request's latent area against 832×1216's, on the models' 8-pixel latent grid. So 832×1216 (either way round) sends the bare 58 or 19.
- **After the 64 rounding:** the scaling uses the size actually sent. Asking for 1248×1824 on V4.5 sends `width: 1280, height: 1856` and `skip_cfg_above_sigma: 88.87784456804029`, which is 58 × √(160·232 / 15808).
- **On import,** the client divides the stored value back out, so what it shows is the model's own sigma again.

Confirmed on 2026-09-19 by reading the client and by three of its own captured requests (V4.5 at 1248×1824 on and off, V3 at 832×1216). This app mirrors it in `lib/variety.ts`; `buildImageRequest` applies the "null, or no field at all" rule. A same-seed V4.5 generation with Variety+ on matched novelai.net's to within PNG/WebP noise (largest row or column mean differing by 0.00007 of 255).

While reading that table: V5's `maxCharacters` is now **32**, not the 22 it launched with.

### The canvas and inpainting

Read from novelai.net's client on 2026-09-24, then checked against a captured inpaint request from its page (logged in, the send stopped before it reached the server) on 2026-09-24 and 2026-09-25.

**Flow.** Its canvas (Edit Image, Inpaint Image, Paint New Image) only has Save and Cancel. Saving puts the picture, and any mask, into the Image2Image panel on the main screen, which then offers Edit Image, Edit Inpainting Mask and Remove Inpainting Mask. Generating is the ordinary Generate, with the prompt and settings as they are.

**Strokes.** The canvas stamps along each segment every quarter of the brush size, `ceil(distance / max(1, avgSize * 0.25))` stamps, easing the size between the ends for pen pressure (`size * pressure`, pens only). A stroke is drawn to its own layer and composited once, so a translucent stroke doesn't darken where it overlaps itself. Brush tips are Round, SoftRound (a `blur(0.15 * size px)` filter) and Square. Defaults: draw and erase size 20 (5–100 in steps of 5), fill tolerance 15, blur intensity 50.

**Fill** is a scanline flood fill on the current layer, from the clicked pixel's RGBA, taking pixels within `tolerance` by straight-line distance over the four channels.

**The mask** is its own layer at an **eighth of the picture's size** (`scaleFactor: 8`, opacity 0.5, smoothing off). Its brush size is in those cells (4 to 50, default 4) and is drawn pixel-perfect: a cell is in when the corner nearest the stamp's centre is within the radius (`max(0, |dx| - 0.5)`, `max(0, |dy| - 0.5)`, distance ≤ radius); a square brush takes cells whose centre is inside. The request's mask is that layer scaled up by nearest neighbour, so it's always aligned to the 8-pixel latent grid.

**Inpainting strength.** The inpaint panel's Strength slider (0.01–1, default **1**, only on models whose table has `img2imgInpainting`: V4 and later) sets **`inpaintImg2ImgStrength`**, not `strength`. Its request prep then adds `img2img: { strength: inpaintImg2ImgStrength, color_correct: true }` when that's below 1, and deletes `img2img` otherwise. The price's strength factor is `mask ? inpaintImg2ImgStrength ?? 1 : image ? strength : 1`. The ordinary `strength` and `noise` (0.7 and 0 by default) still go along, from the Image2Image state. Before this, the app sent its inpaint slider as `strength` and a fixed `inpaintImg2ImgStrength: 0.69` with a matching `img2img` block.

**Other fields.** `add_original_image` defaults to true in every model's parameters, but `generateInfill` sets it to **false** on every inpaint, whatever the panel says (the capture confirms it), because it does that job itself (below). The request prep sets `color_correct: false` on any `img2img` action, and gives an inpaint no top-level `color_correct`. `sm` and `sm_dyn` are set false on an image request only on V3; later models have no SMEA, and the capture has neither field. The mask is prepared on black, without smoothing.

**Finishing the result** (`generateInfill`'s image callback; `lib/inpaintComposite.ts`). The server's picture isn't shown as it comes. The client makes a matte from the mask and pastes the result over the image it sent through it:
1. The mask at an eighth of the size (nearest), alpha thresholded at 155, transparent replaced with opaque black.
2. In its web worker (chunk 687): a square dilation of 4 cells, nearest-neighbour ×8, then its box blur (radius 20, 2 passes; a StackBlur-style multiply-and-shift per radius), then the red channel copied to alpha.
3. If the result carries the stealth marker, its alpha 254 → 255 and 1 → 0. Its alpha is multiplied by the matte (rounded); the original's by 255 − matte; then the two are blended with those as weights (the blend's alpha is `round(255 × min(1, a + b))`).
4. The result's alpha low bits (the stealth metadata) are copied back onto the composite, and its text chunks are written after the composite's IHDR (as iTXt; the app copies the chunks as they came, which reads the same).

So outside the dilated mask the image is exactly the original, and the new content fades in over about 40 pixels. The port was run beside NovelAI's own functions in its page, on an 832×1216 picture with and without a stealth marker, and the matte and composite matched byte for byte; `tests/inpaintComposite.test.ts` pins values taken from that run.

**Inpainting models' own capabilities** decide some fields, since they're what's sent: every inpainting model offers Variety+ except V5 Full's (V5 Curated inpaints with V4.5 Curated's, which does, so its request carries `skip_cfg_above_sigma: null`, the V5 toggle not existing); only V5 Full's has automatic text and transparency. Inpainting also gets the free Opus sample: its check is `!characterRef && width*height <= 1048576 && steps <= 28`.

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
- **CLIP specifics (V3)**: there's no shared pool. Each `|` part of a field has its own 225 limit, so a field's count is its largest part. `[`, `]`, `{`, `}` become spaces, not deleted. HTML entities are decoded twice, with the `html-entities` npm package (`&amp;amp;` → `&`). Whitespace collapses and everything is lowercased. Weight syntax isn't stripped, and no start/end tokens are counted. The vocabulary is OpenAI CLIP's `bpe_simple_vocab_16e6.txt`, and only its first 48,894 merges are used.
- **Qwen specifics**: nothing is stripped (braces and `1.5::` weights count), and there's no EOS. The pre-tokenizer regex is Qwen's, with `\s` written out as Unicode White_Space. Literal special tokens such as `<|endoftext|>` count as 1.

This app bundles the open Apache-2.0 equivalents: the T5 vocab from `google-t5/t5-base` and Qwen 3.5's `merges.txt`, in `public/tokenizers/`. It reimplements the counting in `lib/tokenizers/`. The CLIP merges come from OpenAI CLIP (MIT); their hash matches NovelAI's copy. The CLIP counter had 0 mismatches on the same corpus plus 32 HTML-entity and edge cases. Verified on 2026-09-18 by running NovelAI's own tokenizer worker in a logged-in novelai.net tab against a seeded 1,520-prompt corpus: tags, weights, unicode, emoji, whitespace edge cases, special tokens. **0 mismatches** for T5 or Qwen. The harness caught deliberate single-rule mutations (282 to 796 mismatches). Full-pipeline counts (quality tags, UC preset, a character) were also checked against the numbers NovelAI's UI displays.

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
