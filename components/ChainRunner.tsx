'use client';

import { useEffect, useRef } from 'react';
import { useChainStore } from '@/store/chainStore';
import { useSessionStore } from '@/store/sessionStore';
import { useEnhance } from '@/hooks/useEnhance';
import { useUpscale } from '@/hooks/useUpscale';
import { useAugment } from '@/hooks/useAugment';
import { usePixelSnap } from '@/hooks/usePixelSnap';
import { useVariations } from '@/hooks/useVariations';
import { useSweepAround } from '@/hooks/useSweepAround';
import { useSubscription } from '@/hooks/useSubscription';
import { downloadImage } from '@/lib/imageUtils';
import { producesImage, stepLabel } from '@/lib/chains';
import { joinPromptParts } from '@/lib/promptText';
import { ChainStep, GeneratedImage } from '@/types/novelai';

// Pause between network steps, like queued Copies and sweeps.
const STEP_GAP_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs queued chains, one step at a time, and shows their progress, errors
 * and cost confirmations. Mounted once for the whole app, so there's only
 * ever one chain step in flight.
 */
export function ChainRunner() {
  const queueLength = useChainStore((s) => s.queue.length);
  const { enhance, error: enhanceError } = useEnhance();
  const { upscale, error: upscaleError } = useUpscale();
  const { augment, error: augmentError } = useAugment();
  const { snap, error: snapError } = usePixelSnap();
  const { generateVariations, error: variationsError } = useVariations();
  const { sweepAround, error: sweepError } = useSweepAround();
  const running = useRef(false);

  // The action hooks report failures through their own error state, which is
  // only visible after a re-render; this keeps the latest one reachable.
  const latestError = useRef<string | null>(null);
  latestError.current = enhanceError ?? upscaleError ?? augmentError ?? snapError ?? variationsError ?? sweepError ?? null;

  async function runStep(
    step: ChainStep,
    image: GeneratedImage,
    tags: string,
    onCell: (index: number, total: number) => void,
  ): Promise<GeneratedImage[] | null> {
    switch (step.kind) {
      case 'enhance':
        return enhance(image, step.level, step.scale, tags);
      case 'upscale':
        return upscale(image);
      case 'variations':
        return generateVariations(image, tags);
      case 'tags':
        return [image]; // runQueue collects these itself
      case 'sweep':
        return sweepAround(image, step.x, step.y, tags, {
          shouldStop: () => useChainStore.getState().stopRequested,
          onCell,
        });
      case 'director': {
        const options =
          step.tool === 'emotion'
            ? { prompt: `${(step.emotion ?? 'neutral').toLowerCase()};;${step.prompt ?? ''}`, defry: step.defry ?? 0 }
            : step.tool === 'colorize'
              ? { prompt: step.prompt || undefined, defry: step.defry ?? 0 }
              : undefined;
        return augment(image, step.tool, options);
      }
      case 'pixelSnap':
        return snap(image, {
          palettize: step.palettize,
          colors: step.colors,
          avoidOverRefining: step.avoidOverRefining,
          upscale: step.upscale,
        });
      case 'download':
        downloadImage(image);
        return [image];
    }
  }

  async function runQueue() {
    const store = useChainStore.getState;
    const session = useSessionStore.getState;
    let done = 0;
    let failure: string | undefined;

    for (let job = store().takeNext(); job; job = store().takeNext()) {
      const { chain } = job;
      let current = session().images.find((img) => img.id === job.imageId);
      if (!current) continue; // removed from history while queued
      const runId = crypto.randomUUID();
      // From Add Tags steps, for this run's later steps only.
      let tags = '';
      done++;

      for (let i = 0; i < chain.steps.length; i++) {
        if (store().stopRequested) break;
        const step = chain.steps[i];
        const label = stepLabel(step);
        const progress = {
          name: chain.name,
          image: done,
          images: Math.max(store().queuedTotal, done),
          step: i + 1,
          steps: chain.steps.length,
          label,
        };
        store().setProgress(progress);
        // A sweep reports each of its images as it goes.
        const onCell = (index: number, total: number) =>
          store().setProgress({ ...progress, label: `${label} (${index} of ${total})` });

        if (step.kind === 'tags') {
          tags = joinPromptParts(tags, step.tags);
          continue;
        }
        const result = await runStep(step, current, tags, onCell);
        if (!result) {
          await sleep(0); // let the hook's error state render
          failure = `"${chain.name}" stopped at step ${i + 1} of ${chain.steps.length} (${label})${
            latestError.current ? `: ${latestError.current}` : '.'
          }`;
          break;
        }
        if (producesImage(step)) {
          session().updateImages(
            result.map((img) => img.id),
            { batchId: runId, chain: { runId, chainId: chain.id, name: chain.name, step: i + 1, total: chain.steps.length, label } },
          );
        }
        current = result[0];

        const next = chain.steps[i + 1];
        const local = (s: ChainStep) => s.kind === 'pixelSnap' || s.kind === 'download' || s.kind === 'tags';
        if (next && !local(next) && !store().stopRequested) await sleep(STEP_GAP_MS);
      }
      if (failure || store().stopRequested) break;
    }
    store().finish(failure);
  }

  useEffect(() => {
    if (queueLength === 0 || running.current) return;
    running.current = true;
    runQueue().finally(() => {
      running.current = false;
    });
    // runQueue reads everything it needs from the stores as it goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueLength]);

  return (
    <>
      <ChainProgressBar />
      <ChainConfirmModal />
    </>
  );
}

function ChainProgressBar() {
  const progress = useChainStore((s) => s.progress);
  const stopRequested = useChainStore((s) => s.stopRequested);
  const stop = useChainStore((s) => s.stop);
  const error = useChainStore((s) => s.error);
  const clearError = useChainStore((s) => s.clearError);
  if (!progress && !error) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 flex justify-center px-4 phone:top-14 phone:bottom-auto short:top-2">
      {progress ? (
        <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-lg border border-violet-700/50 bg-slate-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
          <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-violet-400" />
          <span className="min-w-0 truncate text-slate-300">
            <span className="font-semibold text-violet-300">{progress.name}</span>
            {progress.images > 1 && ` · image ${progress.image} of ${progress.images}`}
            {` · step ${progress.step} of ${progress.steps}: ${progress.label}`}
          </span>
          <button
            type="button"
            onClick={stop}
            disabled={stopRequested}
            title="Stop after the current step"
            className="flex-shrink-0 rounded bg-slate-700 px-2 py-0.5 font-semibold text-slate-200 transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {stopRequested ? 'Stopping…' : 'Stop'}
          </button>
        </div>
      ) : (
        <div className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-lg border border-red-700/50 bg-red-950/90 px-3 py-2 text-xs text-red-200 shadow-xl">
          <span className="min-w-0">{error}</span>
          <button type="button" onClick={clearError} className="flex-shrink-0 text-red-400 hover:text-red-200">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function ChainConfirmModal() {
  const pending = useChainStore((s) => s.pending);
  const confirm = useChainStore((s) => s.confirm);
  const cancel = useChainStore((s) => s.cancel);
  const { subscription } = useSubscription();

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, cancel]);

  if (!pending) return null;
  const { chain, imageIds, plans, total, auto } = pending;
  const problems = [...new Set(plans.flatMap((p) => p.problems))];
  const balance = subscription
    ? subscription.trainingStepsLeft.fixedTrainingStepsLeft + subscription.trainingStepsLeft.purchasedTrainingSteps
    : null;
  const count = imageIds.length;
  const sameForAll = plans.every((p) => p.costPerImage === plans[0].costPerImage);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && cancel()}
    >
      <div className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <h2 className="text-sm font-bold text-slate-100">
          {auto ? `Run "${chain.name}" on ${count === 1 ? 'the new image' : `the ${count} new images`}?` : `Run "${chain.name}"?`}
        </h2>

        <ol className="flex flex-col gap-1 text-xs">
          {plans[0].steps.map((s, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 rounded bg-slate-800/60 px-2.5 py-1.5">
              <span className="text-slate-300">
                {i + 1}. {s.label}
                <span className="ml-1.5 text-slate-600">
                  → {s.width}×{s.height}
                </span>
              </span>
              <span className={s.cost > 0 ? 'text-amber-300' : 'text-emerald-400'}>
                {s.cost > 0 ? `~${s.cost} Anlas` : 'Free'}
              </span>
            </li>
          ))}
        </ol>
        {count > 1 && (
          <p className="text-[11px] text-slate-500">
            {sameForAll ? 'Per image, as listed.' : 'Listed for the first image; sizes differ, so the total adds each image up.'}
          </p>
        )}

        {problems.length > 0 && (
          <ul className="flex flex-col gap-1 rounded border border-red-700/40 bg-red-950/40 px-2.5 py-2 text-xs text-red-300">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {balance !== null && total > balance && (
          <p className="text-xs text-red-300">
            That&apos;s more than your {balance.toLocaleString()} Anlas; it would stop partway.
          </p>
        )}
        <p className="text-[11px] text-slate-500">
          Steps run one at a time; you can stop between steps. Estimates use NovelAI&apos;s own price formulas.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-600"
          >
            {auto ? 'Skip' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={problems.length > 0}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {total > 0 ? `Run — ~${total} Anlas` : 'Run — Free'}
          </button>
        </div>
      </div>
    </div>
  );
}
