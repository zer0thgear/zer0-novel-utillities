# NovelAI Image Frontend

A custom Next.js frontend for [NovelAI](https://novelai.net)'s image generation API. Generates images via NAI's API using your own account key, with support for v4 character prompts, batch generation, and live streaming previews.

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

Open [http://localhost:3000](http://localhost:3000) in your browser. Enter your API key in the sidebar to start generating.

## Production Build

```bash
# Build for production
npm run build

# Start the production server
npm start
```

## Project Structure

```
app/
  api/
    generate/          # Proxy route for standard image generation
    generate-stream/   # Proxy route for SSE streaming generation
  page.tsx             # Main layout (sidebar + gallery)
  layout.tsx
components/
  PromptForm.tsx       # Prompt editor, settings, and generate button
  BasePromptsEditor.tsx    # Single/Batch base prompt management
  CharacterPromptsEditor.tsx  # Per-character v4 prompt editor (max 6)
  ImageGrid.tsx        # Session gallery with streaming preview
  ImageCard.tsx        # Individual image card with lightbox
hooks/
  useGenerate.ts       # Generation logic (standard + SSE streaming)
store/
  settingsStore.ts     # Persisted settings (Zustand + localStorage)
  sessionStore.ts      # In-memory session state (images, loading, API key)
lib/
  imageUtils.ts        # ZIP extraction, download helpers
types/
  novelai.ts           # API request/response types
```

## Notes

- Images are stored in memory only and are cleared on page refresh
- The API key is stored in `localStorage` — do not use this on a shared or public machine
- The proxy routes (`/api/generate*`) keep your API key server-side and avoid CORS issues
