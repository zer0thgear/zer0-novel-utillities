'use client';

import { useCallback, useState } from 'react';
import { ApiKeyModal } from '@/components/ApiKeyModal';
import { PromptForm } from '@/components/PromptForm';
import { ImageViewer } from '@/components/ImageViewer';
import { HistoryStrip } from '@/components/ImageGrid';
import { useSessionStore } from '@/store/sessionStore';

export default function Home() {
  const apiKey = useSessionStore((s) => s.apiKey);
  const setApiKey = useSessionStore((s) => s.setApiKey);

  const [panelWidth, setPanelWidth] = useState(380);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMove = (ev: MouseEvent) => {
      setPanelWidth(Math.min(700, Math.max(260, startWidth + ev.clientX - startX)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  return (
    <main className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <ApiKeyModal />

      {/* ── Left panel: generation form ── */}
      <aside
        className="flex flex-shrink-0 flex-col bg-slate-900/40"
        style={{ width: panelWidth }}
      >
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

      {/* ── Resize handle ── */}
      <div
        onMouseDown={startResize}
        className="w-1 flex-shrink-0 cursor-col-resize bg-slate-800/80 hover:bg-violet-500/50 transition-colors"
      />

      {/* ── Center: image viewer ── */}
      <section className="flex flex-1 flex-col overflow-hidden">
        <ImageViewer />
      </section>

      {/* ── Right: collapsible history strip ── */}
      <HistoryStrip />
    </main>
  );
}
