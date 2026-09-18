'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiKeyModal } from '@/components/ApiKeyModal';
import { PromptForm } from '@/components/PromptForm';
import { ImageViewer } from '@/components/ImageViewer';
import { HistoryStrip } from '@/components/ImageGrid';
import { DropZone } from '@/components/DropZone';
import { ChainRunner } from '@/components/ChainRunner';
import { useSessionStore } from '@/store/sessionStore';

export default function Home() {
  const apiKey = useSessionStore((s) => s.apiKey);
  const setApiKey = useSessionStore((s) => s.setApiKey);
  const hasImages = useSessionStore((s) => s.images.length > 0);
  const isGenerating = useSessionStore((s) => s.isLoading);

  // History is memory-only (like NovelAI's own), so a refresh or close loses
  // it. Ask first, but only when there's something to lose: images in
  // history, or a generation in flight. NovelAI doesn't warn on a fresh page.
  useEffect(() => {
    if (!hasImages && !isGenerating) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // still required by some Chromium versions to show the prompt
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasImages, isGenerating]);

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
      {apiKey && <DropZone />}
      {apiKey && <ChainRunner />}

      {/* ── Left panel: generation form ── */}
      <aside
        className="flex flex-shrink-0 flex-col bg-sidebar"
        style={{ width: panelWidth }}
      >
        <div className="flex flex-shrink-0 items-center border-b border-slate-800/80 px-5 py-4">
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
