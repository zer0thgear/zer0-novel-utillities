# NovelAI Image Frontend

A custom Next.js frontend for [NovelAI](https://novelai.net)'s image generation API. Generates images via NAI's API using your own account key, with support for V3 through V5 models, per-character V4/V5 prompts with freeform positioning, prompt tidbits, batch/queued generation, Director Tools, drag-and-drop metadata import, and tag autocomplete.

See [`docs/FEATURES.md`](docs/FEATURES.md) for a tour of everything it does.

This is an unofficial, third-party client. See [`docs/REVERSE_ENGINEERING.md`](docs/REVERSE_ENGINEERING.md) for how its API behavior was figured out, and for reference if you're building something similar.

## Prerequisites

- [Node.js](https://nodejs.org) 18+ (or Bun/pnpm/yarn)
- A NovelAI account with an active subscription and API key

## Getting Your API Key

1. Log in to [novelai.net](https://novelai.net)
2. Go to **Account Settings** → **API Key** and copy your persistent key (starts with `pst-...`)

## Setup & Development

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Enter your API key when prompted to start generating.

## Production Build

```bash
# Build for production
npm run build

# Start the production server
npm start
```

## Architecture

This app calls `https://image.novelai.net` **directly from the browser** — there is no server-side proxy route. Your API key is sent straight from your browser to NovelAI's servers and is never seen by anything this project's author operates. It's stored in `localStorage`, so don't use this on a shared or public machine, and don't deploy a build of it somewhere your key could be exposed to others.

## Project Structure

```
app/
  page.tsx                  # Main layout (sidebar + viewer + history)
  layout.tsx
components/
  PromptForm.tsx             # Prompt editor, generation settings, Generate button
  BasePromptsEditor.tsx       # Single/Batch base prompts, tidbits
  CharacterPromptsEditor.tsx  # Per-character V4/V5 prompt editor
  TagAutocompleteField.tsx    # Shared suggest-tags autocomplete (textarea/input)
  CharacterPositionCanvas.tsx # Freeform character position picker (V5)
  ImageViewer.tsx             # Focused image + Edit/Inpaint/Tools/Variations/Upscale/Enhance/Metadata
  ImageGrid.tsx                # Session history strip, groups batch/queue runs visually
  ImageCard.tsx
  InpaintModal.tsx / EditModal.tsx / DirectorToolsModal.tsx
  MetadataModal.tsx           # Reads a NovelAI image's embedded generation metadata
  SweepModal.tsx / SweepGridModal.tsx  # X/Y sweep setup, and the labelled results grid
  PresetsSection.tsx          # Save/load named setting presets
  ChainsSection.tsx / ChainEditorModal.tsx  # Saved chained actions (Enhance → Upscale → …)
  ChainRunner.tsx             # Runs chains one step at a time; progress, errors, cost confirm
  TransferModal.tsx / TransferSection.tsx  # Selective import/export to a JSON file
  ImportModal.tsx             # Image import/reuse window (drop, paste, Reuse)
  WeightBar.tsx               # Emphasis weight slider (Ctrl+↑/↓)
  TokenMeter.tsx              # Per-field token usage bar (shared budget)
  DropZone.tsx                 # Drag-and-drop: import metadata, or use as img2img base
  AccountStatusBar.tsx        # Live Anlas balance + Opus usage meter
  ApiKeyModal.tsx
hooks/
  useGenerate.ts               # Generation (standard + SSE streaming)
  useEnhance.ts / useInpaint.ts / useEdit.ts / useVariations.ts / useUpscale.ts / useAugment.ts
  usePixelSnap.ts               # Client-side only — see docs/REVERSE_ENGINEERING.md
  useSubscription.ts            # Account/Anlas/Opus usage
  useTagSuggestions.ts          # Live tag autocomplete
  useTokenCounts.ts             # Live prompt token counts for the editor
  useChainLauncher.ts           # Prices a chain for some images and queues it
store/
  settingsStore.ts              # Persisted generation settings (Zustand + localStorage)
  sessionStore.ts               # In-memory session state (images, loading, API key)
  chainStore.ts                 # Chain queue, progress and pending confirmation
lib/
  anlasCost.ts                  # NovelAI's own Anlas price formulas (generate, upscale, tools)
  naiPresets.ts                 # Quality Tags / UC Preset literal text, per model
  naiMetadata.ts                # PNG metadata (tEXt chunk) parsing
  tagAutocomplete.ts            # Prompt-segment extraction for autocomplete
  promptTidbits.ts              # Tidbit ↔ library linking helpers
  promptText.ts                 # Prompt fragment joining (comma/whitespace rules)
  wildcards.ts                  # __Label__ references + random wildcards, resolved once per request
  sweeps.ts                     # X/Y sweep axes → per-image cells
  sweepGridImage.ts             # Renders a sweep grid as one labelled PNG
  samplers.ts / models.ts       # Sampler and model lists shared across the UI
  presets.ts                    # Saved presets: which settings they capture
  chains.ts                     # Chain steps, validation, per-step price plan, import parsing
  transfer.ts                   # Import/export file format, validation, re-linking
  emphasis.ts                   # {}/[]/w::text:: emphasis parsing and stepping
  imageRequest.ts               # Builds every /ai/generate-image request
  tokenCount.ts                 # Per-model tokenizer + limit, NovelAI's counting rules
  tokenizers/                   # T5 Unigram and Qwen 3.5 BPE token counters
  pixelSnap.ts                  # Client-side pixel-art filter
  imageUtils.ts / imageDb.ts
types/
  novelai.ts                    # API request/response types
public/tokenizers/              # Apache-2.0 tokenizer data (see its README)
scripts/
  build-tokenizers.mjs          # Regenerates public/tokenizers/ from Hugging Face files
docs/
  FEATURES.md                   # What the app does, feature by feature
  REVERSE_ENGINEERING.md        # How this app's API behavior was reverse-engineered
```

## Notes

- Images are stored in memory only and are cleared on page refresh.
- The API key is stored in `localStorage` — do not use this on a shared or public machine.
