# Features

A tour of what the app does. For setup, see the [README](../README.md). For how its NovelAI behavior was worked out, see [REVERSE_ENGINEERING.md](REVERSE_ENGINEERING.md).

The app talks to NovelAI directly from your browser with your own API key. Its requests match what novelai.net itself sends, down to the preset text and hidden fields, so the same seed and settings give the same image as NovelAI's own site.

## Models

V5 Full and Curated, V4.5 Full and Curated, V4 Full and Curated, and V3 (Anime and Furry). The sidebar only offers the options a model actually supports: presets, character prompts, transparency, SMEA and so on.

## Writing prompts

- **Base prompts.** Keep several prompts side by side and pick one (**Single**), or tick several to generate one image each (**Batch**), grouped together in history. Reorder them with the arrows.
- **Characters** (V4 and later). Each character gets its own prompt and negative, and can be turned on or off (up to 32 at once on V5, 6 on V4/V4.5). Each folds down to a one-line summary, and **Fold all** folds the whole list; folds are remembered. There's an Add at both ends of the list. Once you have four or more, a filter narrows the list by name or prompt text, or to **Active only**. Characters you aren't using can go in the **Archive**: they're kept, but out of the list and never sent, until you restore them. **Use Coordinates** places them on a drag-and-drop position canvas, where clicking a marker jumps to that character.
- **Negative prompt.** The main negative prompt, under Base Prompts. Each character also has its own. Both take tidbits, the same as a positive prompt does.
- **Tidbits.** Small toggleable pieces attached to a prompt, a character or a negative prompt, appended when enabled. They're trimmed and joined with ", ", never producing double commas. An off one is dimmed and struck through, and the list folds away with a count of how many are on.
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

Fur mode, NSFW, Transparent background (V5), **Quality Tags** and **UC presets** (Light, Heavy, Human Focus and so on). They're applied exactly as NovelAI's own site applies them, including placement before a `text:` section and the automatic `nsfw` negative on Full models. On V5, text in quotes (`holding a sign that says "Hello World"`) is added as a text section automatically, as on NovelAI's site, unless you've written a `text:` section yourself.

## Generating

- **Generation settings:** size presets or a custom size, steps, CFG (prompt guidance), sampler, noise schedule, CFG rescale, seed, and SMEA on V3.
- **Variety+** (under Advanced settings) holds guidance back until the shapes have formed, for more varied and more saturated images, at some cost to how closely they follow the prompt. It's offered on the models NovelAI offers it on — V4, V4.5 and V3, but not V5 — and the strength it sends scales with the image size exactly as NovelAI's does.
- **Copies:** 2–4 images from one prompt, as one **Batch** request or **Queued** one after another. Queued copies can each use the free Opus allowance and roll wildcards separately.
- **Img2Img:** use any history image, or a dropped or pasted one, as the base, with strength and noise sliders. The base panel has **Edit Image** and **Inpaint** buttons that open the canvas on it.
- **Inpainting:** once a mask is set the base panel says so, and Generate inpaints with the sidebar's prompt on the model's inpainting model (V5 Curated uses V4.5 Curated's, as NovelAI does). **Strength** is NovelAI's inpainting strength (1 repaints the masked area from scratch; V3 has none). The result is pasted over the original through a feathered edge, exactly as novelai.net finishes an inpaint, so nothing outside the mask changes and there's no hard seam; it keeps the result's metadata. The mask stays set, so you can generate again or tweak it with **Edit Mask**. A base from a history image replays that image's wildcard rolls, and its results can be compared with it using Hold: Original.
- **Streaming mode** shows live preview frames while the image renders.
- **Inspect request** (under Advanced settings) shows the exact JSON the next Generate would POST, after every step that shapes it — quality tags, wildcards, V5's text section, the size rounding — with the image data shortened and a button to copy it. Handy for comparing against what novelai.net sends.
- **Tab title:** like NovelAI's, it spins (◰◳◲◱) while images generate and shows ✓ when a run finishes while you're on another tab.
- **Retries:** a rate limit, a gateway error or a dropped connection is retried up to three times, waiting 2s, 5s then 12s (or whatever `Retry-After` asks for). The Generate button says what it's waiting on, so a long pause doesn't look like a hang. If it still fails, a run of many images — queued copies, a batch of prompts, a sweep — skips that one image and carries on, and tells you how many it lost. Anything retrying can't fix, like a bad key or a request NovelAI rejects, stops the run straight away.
- **Cost estimates** on every paid button, calculated with NovelAI's own price formulas (including the free Opus allowance). The live Anlas balance and the Opus usage meter stay pinned to the top of the sidebar as it scrolls, above the prompt tab bar. The meter shows roughly how many free images are left, how fast it refills, and when it will be full, using NovelAI's own estimate of about 17.3 images per 1%. Clicking the Anlas line collapses the meter away, leaving just the balance; the choice is remembered. Next to the balance it shows what this session has actually been charged, counted from the balance itself rather than from our estimates (buying more Anlas moves the baseline up instead of counting as a refund).

## X/Y sweeps

**Sweep** generates a grid that varies one or two things:
- **What can vary:** CFG, CFG rescale, steps, sampler, seed, tags, or the options of a random wildcard.
- **Tags:** a comma-separated list of tags to try, each added where quality tags go. A weighted group stays one value: `{open mouth, teeth}`, `[blush]` or `1.3::looking at viewer, wink::`. A "(none)" baseline (on by default) keeps the prompt as-is for comparison.
- **What stays fixed:** the seed and every other wildcard roll, so only the swept values differ.
- **Before it runs:** it shows how many images and how much Anlas the grid will take.
- **Afterwards:** the results open as a labelled grid, with the shared seed, which you can save as one PNG.
- **Saved setups:** name a pair of axes and load it again later. The same list is available in the Sweep dialog and in a chain's Sweep step, and it travels in Import / Export.

## Keyboard

- **Ctrl+Enter** (⌘+Enter) generates, from anywhere — including mid-prompt, where it beats the tag suggestion list's own Enter.
- **← / →** step through the session's images, newest to oldest. They stay out of the way while you're typing, and while a dialog is open.
- **Esc** goes from one of a batch's images back to its grid.
- **Ctrl+↑ / Ctrl+↓** in any prompt field adds or removes emphasis around the tag under the cursor.

## Working with an image

From the viewer:
- **Enhance**: levels 1–5, at the scales NovelAI offers for the image's size (1×, 1.5×, 2×, or Max on V5, which lets NovelAI upscale it to about 3 MP). It renders with the sidebar's prompt, as NovelAI does; in Batch mode it uses the prompt the image was made from.
- **Variations**: three variants in one batch.
- **Upscale**: 2× (images up to 1 MP).
- **Director Tools**: Remove background, Line art, Sketch, Colorize, Emotion, Declutter, and Pixel Snap (runs locally, free).
- **Inpaint** and **Edit**: open the canvas (below). Saving brings you back here with the image set as the Image2Image base, as on novelai.net, so you can adjust the prompt and settings and generate with the usual Generate button.
- **Chain**: run a saved chain (see below).
- **Reuse**: load the image's prompt and settings back into the sidebar, exactly as written, without doubling up quality tags.
- **Use as Base**, **Use this seed**, **Metadata** (read the image's embedded generation data), **Download**.
- **Hold: Original**: compare an edited image with its source.

Actions NovelAI can't perform on an image, such as renders past about 3.1 MP, are disabled with the reason shown.

## The canvas

**Edit Image** paints over the picture; **Inpaint** marks what to regenerate. Both save back to the Image2Image base in the sidebar rather than generating from the canvas.

- **Smooth strokes at any speed.** Every position the pointer passed through is used, and stamps are laid every quarter of the brush size between them, as NovelAI's canvas does, so a fast flick draws a solid line instead of dots. A translucent stroke stays even where it crosses itself.
- **Edit tools:** Draw (round, soft or square tip, with opacity), Erase (takes paint off, back to the picture underneath), Fill (a patch of similar colour, with a tolerance), Smudge (drags colour like wet paint), Blur, and a colour Pick (or hold Alt). Pen pressure changes the size on a pen.
- **The inpainting mask** is drawn on the 8-pixel latent grid with NovelAI's own pixel-perfect brush (default 4 cells, circle or square), so the mask sent is the same shape its canvas would make. Draw Mask, Erase Mask, and Fill to fill an area you've outlined. The mask's opacity is adjustable.
- **Your work is kept.** Paint stays on its own layer, so reopening Edit Image lets you carry on or erase it; Edit Mask reopens the mask.
- **Keys:** B draw, E erase, G fill, S smudge, R blur, I pick, [ and ] size, Ctrl+Z / Ctrl+Shift+Z undo and redo, Esc cancel.

## Chained actions

A chain is a saved list of steps (Enhance, Upscale, Director Tool, Pixel Snap, Variations, Sweep, Download), each applied to the previous step's result.
- **Sweep:** regenerates the image from its own prompt, seed and settings, one image per combination of the step's axes (any sweep axis except wildcards), so you can see what changing each would do. It must be the last step, and its images open as a grid.
- **Add Tags:** a step that adds tags to the prompt for the Enhance, Variations and Sweep steps after it, for that run only. Your prompt in the sidebar isn't changed, but the images record the tags they were made with.
- **Running a chain:** use **Chain** in the viewer, or set **After each Generate** to offer it on every new image (batches and sweeps included). With a batch open as a grid, **Chain all N** runs one on every image in it, priced for the whole group before it starts.
- **Costs:** every run is priced step by step before it starts, and anything that isn't free asks first. Chains that can't work are caught up front, for example Upscale above 1 MP.
- **While it runs:** steps go one at a time, with a Stop button and a clear message if a step fails. Generate waits until the chain is done.
- **Results:** each step's image is kept in history, grouped under the chain's name.

## Presets

Save the current settings and modifiers under a name, and load them back in one click. Optionally include prompts, characters and the negative prompt. The seed is never saved.

## Import & export

- **Images.** Drop or paste an image anywhere to import its NovelAI metadata or use it as an img2img base. Pasted images work too: when copying strips the metadata, it's read from the copy NovelAI hides in the image's transparency. Images made with Image2Image or Inpainting are flagged, as on NovelAI, since their metadata can't reproduce them. You pick which parts to load: prompt, characters, negative, settings or seed. Prompts and characters can be appended to what you have, instead of replacing it. **Clean Imports** strips `[]`/`{}` and tidies spacing.
- **Files.** Import / Export saves any selection of prompts, characters, library entries, presets, chains, sweep setups and settings to a JSON file. On import, you choose per list whether to add to or replace what you have. Library links are kept intact, and duplicates are merged.

## History

The session history groups batches, sweeps and chains, and **Download ZIP** saves the whole session. **Filter** takes tags the way a prompt is written: comma-separated, each one a phrase, all of them required. `blue hair, smile` finds images with both tags — not ones with "blue eyes" and "black hair". It looks in the prompt as written (so not the quality tags every image shares) and in each character's prompt, plus the model and the chain or sweep an image came from. A number matches a seed exactly. **Select** turns the thumbnails into tick boxes, so a chosen set (or everything the filter left) can be downloaded as a ZIP or removed together. Clicking a group's header shows the whole group on the canvas as a grid, as NovelAI does, and a new multi-image batch (or Variations) opens that way. Click an image in the grid to open it with all its actions. **Esc**, **← Batch of N**, or clicking the image itself goes back to the grid, and hovering an image gives quick Download, Copy and Use seed buttons. **Pin** an image (📌 on its thumbnail, or in a batch grid on hover) and **Clear Session** keeps it; the confirmation says how many will stay, and offers nothing to clear when everything is pinned. **Clear Session** asks first. Like NovelAI's own site, history lives in memory only. The page warns before you close or refresh it with images unsaved.

## On a phone

On a narrow screen, or a phone turned on its side, the page becomes one screen, as novelai.net's own phone layout does. The image fills it, and a bar along the bottom holds **Prompt**, **Generate** (with Sweep) and **History**.

- **Prompt** opens the whole sidebar as a sheet over the image. Close it and it keeps everything as it was, scroll position included. Generate is on the bar either way, and starting a generation closes the sheet so you see the image arrive.
- **History** opens the history as a sheet of thumbnails, three across; picking one shows it and closes the sheet. With no hover on a touch screen, pins show on every thumbnail, and removing goes through **Select**.
- The image's actions are one row that scrolls sideways. The canvas and Director Tools put their tools under the picture, with Undo and Redo first. Drawing, the Hold: Original button and dragging character positions all work by touch.
- Text fields are 16px on touch screens, so iPhone Safari doesn't zoom in when you tap one.

## Settings that persist

Your settings, prompts, characters, Tidbit Library, presets and chains are saved in the browser (localStorage), as is the API key. Don't use the app on a shared computer.
