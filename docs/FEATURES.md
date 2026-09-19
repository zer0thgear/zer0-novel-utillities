# Features

A tour of what the app does. For setup, see the [README](../README.md). For how its NovelAI behavior was worked out, see [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md).

The app talks to NovelAI directly from your browser with your own API key. Its requests match what novelai.net itself sends, down to the preset text and hidden fields, so the same seed and settings give the same image as NovelAI's own site.

## Models

V5 Full and Curated, V4.5 Full and Curated, V4 Full and Curated, and V3 (Anime and Furry). The sidebar only offers the options a model actually supports: presets, character prompts, transparency, SMEA and so on.

## Writing prompts

- **Base prompts.** Keep several prompts side by side and pick one (**Single**), or tick several to generate one image each (**Batch**), grouped together in history. Reorder them with the arrows.
- **Characters** (V4 and later). Each character gets its own prompt and negative, and can be turned on or off (up to 22 at once on V5, 6 on V4/V4.5). **Use Coordinates** places them on a drag-and-drop position canvas.
- **Negative prompt.** The main negative prompt, under Base Prompts. Each character also has its own.
- **Tidbits.** Small toggleable pieces attached to a prompt or character, appended when enabled. They're trimmed and joined with ", ", never producing double commas.
- **Tidbit Library.** Reusable pieces, shared everywhere:
  - **Link** an entry as a tidbit, or reference it inline by writing `__Label__`. Editing an entry updates every place that uses it.
  - **Random entries** hold one option per line and roll a new one for each request. The roll is remembered on the image, so Enhance or Inpaint on it later doesn't re-roll.
  - An unknown `__name__` is flagged before generating, with the choice to send it anyway as literal text.
- **Tag autocomplete.** NovelAI's own tag suggestions appear as you type, with a relevance dot, in every prompt field. Library labels are suggested after `__`. Only typing brings them up; moving the cursor, pasting or undoing doesn't.
- **Emphasis.** Ctrl+↑ / Ctrl+↓ adds or removes `{}` / `[]` around the tag under the cursor or the selection. The weight bar sets an exact weight (`1.3::tag::`).
- **Token counter.** A bar under each field shows how much of NovelAI's token limit you're using, counted exactly as NovelAI does:
  - V5: 1471 tokens (Full) or 703 (Curated). V4/V4.5: 512.
  - The base prompt and characters share one budget.
  - V3: 225 per `|` part, not shared.

## Prompt modifiers

Fur mode, NSFW, Transparent background (V5), **Quality Tags** and **UC presets** (Light, Heavy, Human Focus and so on). They're applied exactly as NovelAI's own site applies them, including placement before a `text:` section and the automatic `nsfw` negative on Full models.

## Generating

- **Generation settings:** size presets or a custom size, steps, CFG (prompt guidance), sampler, noise schedule, CFG rescale, seed, and SMEA on V3.
- **Copies:** 2–4 images from one prompt, as one **Batch** request or **Queued** one after another. Queued copies can each use the free Opus allowance and roll wildcards separately.
- **Img2Img:** use any history image, or a dropped or pasted one, as the base, with strength and noise sliders.
- **Streaming mode** shows live preview frames while the image renders.
- **Cost estimates** on every paid button, calculated with NovelAI's own price formulas (including the free Opus allowance). The live Anlas balance and the Opus usage meter sit at the top of the sidebar. The meter shows roughly how many free images are left, how fast it refills, and when it will be full, using NovelAI's own estimate of about 17.3 images per 1%.

## X/Y sweeps

**Sweep** generates a grid that varies one or two things:
- **What can vary:** CFG, steps, sampler, seed, or the options of a random wildcard.
- **What stays fixed:** the seed and every other wildcard roll, so only the swept values differ.
- **Before it runs:** it shows how many images and how much Anlas the grid will take.
- **Afterwards:** the results open as a labelled grid, which you can save as one PNG.

## Working with an image

From the viewer:
- **Enhance**: levels 1–5, at the scales NovelAI offers for the image's size (1×, 1.5×, 2×, or Max on V5, which lets NovelAI upscale it to about 3 MP). Enhance, Inpaint and Edit render with the sidebar's prompt, as NovelAI does; in Batch mode they use the prompt the image was made from.
- **Variations**: three variants in one batch.
- **Upscale**: 2× (images up to 1 MP).
- **Director Tools**: Remove background, Line art, Sketch, Colorize, Emotion, Declutter, and Pixel Snap (runs locally, free).
- **Inpaint** (paint a mask) and **Edit** (paint over the image).
- **Chain**: run a saved chain (see below).
- **Reuse**: load the image's prompt and settings back into the sidebar, exactly as written, without doubling up quality tags.
- **Use as Base**, **Use this seed**, **Metadata** (read the image's embedded generation data), **Download**.
- **Hold: Original**: compare an edited image with its source.

Actions NovelAI can't perform on an image, such as renders past about 3.1 MP, are disabled with the reason shown.

## Chained actions

A chain is a saved list of steps (Enhance, Upscale, Director Tool, Pixel Snap, Variations, Download), each applied to the previous step's result.
- **Add Tags:** a step that adds tags to the prompt for the Enhance and Variations steps after it, for that run only. Your prompt in the sidebar isn't changed, but the images record the tags they were made with.
- **Running a chain:** use **Chain** in the viewer, or set **After each Generate** to offer it on every new image (batches and sweeps included).
- **Costs:** every run is priced step by step before it starts, and anything that isn't free asks first. Chains that can't work are caught up front, for example Upscale above 1 MP.
- **While it runs:** steps go one at a time, with a Stop button and a clear message if a step fails. Generate waits until the chain is done.
- **Results:** each step's image is kept in history, grouped under the chain's name.

## Presets

Save the current settings and modifiers under a name, and load them back in one click. Optionally include prompts, characters and the negative prompt. The seed is never saved.

## Import & export

- **Images.** Drop or paste an image anywhere to import its NovelAI metadata or use it as an img2img base. Pasted images work too: when copying strips the metadata, it's read from the copy NovelAI hides in the image's transparency. Images made with Image2Image or Inpainting are flagged, as on NovelAI, since their metadata can't reproduce them. You pick which parts to load: prompt, characters, negative, settings or seed. Prompts and characters can be appended to what you have, instead of replacing it. **Clean Imports** strips `[]`/`{}` and tidies spacing.
- **Files.** Import / Export saves any selection of prompts, characters, library entries, presets, chains and settings to a JSON file. On import, you choose per list whether to add to or replace what you have. Library links are kept intact, and duplicates are merged.

## History

The session history groups batches, sweeps and chains, and **Download ZIP** saves the whole session. **Clear Session** asks first. Like NovelAI's own site, history lives in memory only. The page warns before you close or refresh it with images unsaved.

## Settings that persist

Your settings, prompts, characters, Tidbit Library, presets and chains are saved in the browser (localStorage), as is the API key. Don't use the app on a shared computer.
