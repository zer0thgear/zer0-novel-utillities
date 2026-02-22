'use client';

import { ApiKeyModal } from '@/components/ApiKeyModal';
import { PromptForm } from '@/components/PromptForm';
import { ImageGrid } from '@/components/ImageGrid';
import { useSessionStore } from '@/store/sessionStore';

export default function Home() {
  const apiKey = useSessionStore((s) => s.apiKey);
  const setApiKey = useSessionStore((s) => s.setApiKey);

  return (
    <main className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <ApiKeyModal />

      {/* ── Left panel: generation form ── */}
      <aside className="flex w-[380px] flex-shrink-0 flex-col border-r border-slate-800/80 bg-slate-900/40">
        <div className="flex flex-shrink-0 items-center border-b border-slate-800/80 bg-slate-900/80 px-5 py-4 backdrop-blur-sm">
          <h1 className="text-base font-bold tracking-tight">
            <span className="text-violet-400">NAI</span> Image Generator
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!apiKey ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <p className="text-sm text-slate-500">
                Enter your NovelAI API key to get started.
              </p>
              <button
                onClick={() => setApiKey('')}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
              >
                Enter API Key
              </button>
            </div>
          ) : (
            <PromptForm />
          )}
        </div>
      </aside>

      {/* ── Right panel: image gallery ── */}
      <section className="flex flex-1 flex-col overflow-hidden p-5">
        <ImageGrid />
      </section>
    </main>
  );
}
