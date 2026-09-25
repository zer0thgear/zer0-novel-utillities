'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiKeyModal } from '@/components/ApiKeyModal';
import { PromptForm } from '@/components/PromptForm';
import { ImageViewer } from '@/components/ImageViewer';
import { HistoryStrip } from '@/components/ImageGrid';
import { DropZone } from '@/components/DropZone';
import { ChainRunner } from '@/components/ChainRunner';
import { TitleStatus } from '@/components/TitleStatus';
import { useSessionStore } from '@/store/sessionStore';
import { PhoneLayoutContext } from '@/components/PhoneLayout';

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

  // Phones: one screen with a bottom bar; the form and history open over
  // the image as sheets. A closed sheet is parked just below the screen, not
  // hidden: it stays mounted (nothing typed is lost, the scroll is kept), and
  // the dialogs it opens (Sweep, a wildcard warning after Generate on the
  // bar) are fixed to the screen, so they still show.
  const [sheet, setSheet] = useState<'prompt' | 'history' | null>(null);
  const toggleSheet = (which: 'prompt' | 'history') => setSheet((s) => (s === which ? null : which));
  const [generateSlot, setGenerateSlot] = useState<HTMLElement | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const barObserver = useRef<ResizeObserver | null>(null);
  const barRef = useCallback((el: HTMLElement | null) => {
    barObserver.current?.disconnect();
    if (!el) return;
    setBarHeight(el.offsetHeight);
    barObserver.current = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    barObserver.current.observe(el);
  }, []);

  // Starting a generation shows the image it's making, and picking one from
  // the history shows that image.
  useEffect(
    () =>
      useSessionStore.subscribe((state, prev) => {
        if (state.isLoading && !prev.isLoading) setSheet(null);
        else if (state.focusedImageId !== prev.focusedImageId || state.focusedGroupId !== prev.focusedGroupId) {
          setSheet((s) => (s === 'history' ? null : s));
        }
      }),
    [],
  );

  return (
    <PhoneLayoutContext.Provider value={{ generateSlot }}>
    <main
      className="flex h-dvh overflow-hidden bg-slate-950 text-slate-100 phone:flex-col"
      style={{ '--panel-w': `${panelWidth}px`, '--bar-h': `${barHeight}px` } as React.CSSProperties}
    >
      <ApiKeyModal />
      <TitleStatus />
      {apiKey && <DropZone />}
      {apiKey && <ChainRunner />}

      {/* ── Phone header ── */}
      <div className="flex h-12 flex-shrink-0 items-center border-b border-slate-800/80 bg-sidebar px-4 wide:hidden short:hidden">
        <h1 className="text-base font-bold tracking-tight">
          <span className="text-violet-400">NAI</span> Image Generator
        </h1>
      </div>

      {/* ── Left panel: generation form (a sheet on a phone) ── */}
      <aside
        className={`flex flex-col bg-sidebar wide:w-(--panel-w) wide:flex-shrink-0 ${PHONE_SHEET} ${
          sheet === 'prompt' ? 'phone:top-12 short:top-0' : 'phone:top-full'
        }`}
      >
        <div className="flex flex-shrink-0 items-center border-b border-slate-800/80 px-5 py-4 phone:hidden">
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
        className="w-1 flex-shrink-0 cursor-col-resize bg-slate-800/80 hover:bg-violet-500/50 transition-colors phone:hidden"
      />

      {/* ── Center: image viewer ── */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden phone:pb-(--bar-h)">
        <ImageViewer />
      </section>

      {/* ── Right: collapsible history strip (a sheet on a phone) ── */}
      <div
        className={`flex phone:bg-slate-950 ${PHONE_SHEET} ${sheet === 'history' ? 'phone:top-12 short:top-0' : 'phone:top-full'}`}
      >
        <HistoryStrip />
      </div>

      {/* ── Phone bar: Prompt, Generate, History ── */}
      <nav
        ref={barRef}
        className="fixed inset-x-0 bottom-0 z-20 flex items-end gap-2 border-t border-slate-800/80 bg-slate-900 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] wide:hidden"
      >
        <PhoneBarButton label="Prompt" active={sheet === 'prompt'} onClick={() => toggleSheet('prompt')}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
        </PhoneBarButton>
        <div ref={setGenerateSlot} className="min-w-0 flex-1">
          {!apiKey && (
            <button
              type="button"
              onClick={() => setApiKey('')}
              className="w-full rounded-xl bg-violet-600 py-3 text-sm font-bold text-white"
            >
              Enter API Key
            </button>
          )}
        </div>
        <PhoneBarButton label="History" active={sheet === 'history'} onClick={() => toggleSheet('history')}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </PhoneBarButton>
      </nav>
    </main>
    </PhoneLayoutContext.Provider>
  );
}

/** A phone sheet: the space between the header and the bar (the whole
 *  height above the bar on its side, where there's no header). It's above the
 *  bar in z-order (they don't overlap), so the dialogs it opens, which sit in
 *  its stacking context, cover the bar too. */
const PHONE_SHEET = 'phone:fixed phone:inset-x-0 phone:z-30 phone:h-[calc(100dvh-3rem-var(--bar-h))] short:h-[calc(100dvh-var(--bar-h))]';

function PhoneBarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-12 w-14 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold transition-colors ${
        active ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-300'
      }`}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {children}
      </svg>
      {label}
    </button>
  );
}
