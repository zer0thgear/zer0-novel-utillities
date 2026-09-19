'use client';

import { useRef, useState } from 'react';
import { useGenerate } from '@/hooks/useGenerate';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  BasePrompt,
  GeneratedImage,
  NovelAIGenerateRequest,
  NovelAIModel,
  NovelAISampler,
  NovelAINoiseSchedule,
} from '@/types/novelai';
import { CharacterPromptsEditor } from './CharacterPromptsEditor';
import { CharacterPositionCanvas } from './CharacterPositionCanvas';
import { BasePromptsEditor } from './BasePromptsEditor';
import { AccountStatusBar } from './AccountStatusBar';
import { TidbitLibrarySection } from './TidbitLibrarySection';
import { PresetsSection } from './PresetsSection';
import { ChainsSection } from './ChainsSection';
import { useChainLauncher } from '@/hooks/useChainLauncher';
import { useChainBusy } from '@/store/chainStore';
import { TransferSection } from './TransferSection';
import { TagAutocompleteField } from './TagAutocompleteField';
import { analyzeWildcards, resolveRequestPrompts, ResolvedRequestPrompts } from '@/lib/wildcards';
import { axisInfo, SweepAxis, sweepCells } from '@/lib/sweeps';
import { SAMPLERS } from '@/lib/samplers';
import { MODELS, modelShortName } from '@/lib/models';
import { SweepModal } from './SweepModal';
import { buildImageRequest, composeFinalPrompts, formSampling, isV3Model, promptSource, randomSeed } from '@/lib/imageRequest';
import { blobToBase64 } from '@/lib/imageUtils';
import { eraseStealthMarks } from '@/lib/requestImage';
import { calculateAnlasCost, opusStatus } from '@/lib/anlasCost';
import { useSubscription } from '@/hooks/useSubscription';
import { useTokenCounts } from '@/hooks/useTokenCounts';
import { TokenMeter } from './TokenMeter';
import {
  getAvailableQualityLevels,
  getAvailableUcLevels,
  QUALITY_LEVEL_LABELS,
  UC_LEVEL_LABELS,
  QualityLevel,
  UcLevel,
} from '@/lib/naiPresets';

// ─── Constants ───────────────────────────────────────────────────────────────

const NOISE_SCHEDULES: { value: NovelAINoiseSchedule; label: string }[] = [
  { value: 'native', label: 'Native' },
  { value: 'karras', label: 'Karras' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'polyexponential', label: 'Polyexponential' },
];

const SIZE_PRESETS = [
  { width: 832, height: 1216, label: 'Portrait' },
  { width: 1216, height: 832, label: 'Landscape' },
  { width: 1024, height: 1024, label: 'Square' },
  { width: 1024, height: 1536, label: 'Lg Portrait' },
  { width: 1536, height: 1024, label: 'Lg Landscape' },
  { width: 1472, height: 1472, label: 'Lg Square' },
];

// ─── Shared input classes ─────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none border border-slate-700 focus:border-violet-500 transition-colors';

const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400';

// ─── Component ───────────────────────────────────────────────────────────────

export function PromptForm() {
  const form = useSettingsStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showModifiers, setShowModifiers] = useState(false);
  const [showNegativePrompt, setShowNegativePrompt] = useState(false);
  const [showGenSettings, setShowGenSettings] = useState(true);
  const [promptTab, setPromptTab] = useState<'prompts' | 'characters'>('prompts');
  // Marks where the sticky tab bar naturally sits. Switching tabs while the bar
  // is pinned (scrolled down into settings) would otherwise swap content that's
  // entirely above the viewport, so we jump back to the top of the editor.
  const tabAnchorRef = useRef<HTMLDivElement>(null);

  function switchPromptTab(tab: 'prompts' | 'characters') {
    setPromptTab(tab);
    const anchor = tabAnchorRef.current;
    const scroller = anchor?.closest('.overflow-y-auto');
    if (anchor && scroller && anchor.getBoundingClientRect().top < scroller.getBoundingClientRect().top) {
      anchor.scrollIntoView({ block: 'start' });
    }
  }
  const [showPositionCanvas, setShowPositionCanvas] = useState(false);
  const [img2imgStrength, setImg2imgStrength] = useState(0.7);
  const [img2imgNoise, setImg2imgNoise] = useState(0);
  // "Copies" — generate 2-4 images from one prompt in a single shot (true
  // batch, n_samples > 1, real extra Anlas cost) or queued back-to-back as
  // separate single-image calls (each can independently land inside the free
  // Opus allowance, unlike a batch which only gets one free sample). Only
  // offered in single-prompt mode — combining with the existing multi-prompt
  // "Batch" mode would multiply scope for little benefit.
  const [copies, setCopies] = useState(1);
  const [copiesMode, setCopiesMode] = useState<'batch' | 'queue'>('batch');
  const { generate, error, clearError } = useGenerate();
  const { apiKey, setApiKey, isLoading, setIsLoading, img2imgSource, setImg2imgSource } = useSessionStore();
  const { subscription } = useSubscription();
  const tokens = useTokenCounts(form);
  const launchChain = useChainLauncher();
  // A running chain has an image request in flight; Generate waits for it.
  const chainBusy = useChainBusy();

  /** Wraps generate() to collect every image a run makes, for the auto chain. */
  function collectingGenerate() {
    const made: GeneratedImage[] = [];
    const gen = async (...args: Parameters<typeof generate>) => {
      const result = await generate(...args);
      if (result) made.push(...result);
      return result;
    };
    return { made, gen };
  }

  /** Offers the "after each Generate" chain on a run's new images. */
  function offerAutoChain(made: GeneratedImage[]) {
    const chain = form.chains.find((c) => c.id === form.autoChainId);
    if (chain && made.length > 0) launchChain(chain, made, true);
  }

  // Batch status: null when idle, set during a batch run
  const [batchStatus, setBatchStatus] = useState<{ current: number; total: number } | null>(null);

  // ── Request builder ────────────────────────────────────────────────────

  /** Rolls this prompt's wildcards once, for one request. */
  function resolveFor(prompt: BasePrompt): ResolvedRequestPrompts {
    return resolveRequestPrompts(prompt, form.characters, form.negativePrompt, form.tidbitLibrary);
  }

  function buildRequest(
    resolved: ResolvedRequestPrompts,
    seed: number,
    baseImageB64?: string,
    nSamples = 1,
    // A sweep cell's values, replacing the form's for this one request.
    overrides: { scale?: number; cfgRescale?: number; steps?: number; sampler?: NovelAISampler } = {},
  ): NovelAIGenerateRequest {
    const { input, negativePrompt } = composeFinalPrompts(form, resolved);
    return buildImageRequest({
      input,
      negativePrompt,
      model: form.model,
      action: baseImageB64 ? 'img2img' : 'generate',
      characters: resolved.characters,
      useCoords: form.useCoords,
      presets: { quality: form.qualityPreset, uc: form.ucPreset },
      parameters: {
        ...formSampling(form, overrides),
        // NovelAI sends this default on V4+ generations only.
        ...(form.model.startsWith('nai-diffusion-3') || form.model.startsWith('nai-diffusion-furry-3')
          ? {}
          : { inpaintImg2ImgStrength: 1 }),
        // An img2img base keeps its own size rather than the form's.
        ...(baseImageB64 && img2imgSource ? { width: img2imgSource.width, height: img2imgSource.height } : {}),
        n_samples: nSamples,
        // NovelAI sends true for plain generations too.
        add_original_image: true,
        seed,
        ...(baseImageB64 ? { strength: img2imgStrength, noise: img2imgNoise, image: baseImageB64 } : {}),
      },
    });
  }

  // ── Submit handler ─────────────────────────────────────────────────────

  // The base prompts a Generate click would send.
  const targetPrompts =
    form.promptMode === 'single'
      ? form.basePrompts.filter((p) => p.selected).slice(0, 1)
      : form.basePrompts.filter((p) => p.selected && p.text.trim());
  const wildcards = analyzeWildcards(targetPrompts, form.characters, form.negativePrompt, form.tidbitLibrary);
  // Non-null while the "unknown wildcard" confirmation is open.
  const [unknownRefs, setUnknownRefs] = useState<string[] | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || chainBusy) return;
    // Unknown __refs__ are warned about rather than blocked: a tag may
    // legitimately look like one, and it's then sent as literal text.
    if (wildcards.unknown.length > 0) {
      setUnknownRefs(wildcards.unknown);
      return;
    }
    await runGeneration();
  };

  async function runGeneration() {
    setUnknownRefs(null);
    const { made, gen } = collectingGenerate();
    await generateAll(gen);
    offerAutoChain(made);
  }

  /** The Img2Img base, stealth metadata erased as NovelAI's canvas does on
   *  loading it (the rest of its preparation happens as it's sent). */
  async function img2imgBaseB64() {
    return img2imgSource ? blobToBase64(await eraseStealthMarks(img2imgSource.blob)) : undefined;
  }

  async function generateAll(gen: typeof generate) {
    const baseImageB64 = await img2imgBaseB64();

    if (form.promptMode === 'single') {
      const selected = form.basePrompts.find((p) => p.selected);
      if (!selected?.text.trim()) return;

      if (copies > 1 && copiesMode === 'batch') {
        // True batch — one request, n_samples > 1, real extra Anlas cost.
        // One request means one prompt, so every copy shares one wildcard roll.
        const seed = form.seed === 0 ? randomSeed() : form.seed;
        const resolved = resolveFor(selected);
        setIsLoading(true);
        await gen(
          buildRequest(resolved, seed, baseImageB64, copies),
          { batchId: crypto.randomUUID(), forceStandard: true, wildcardPicks: resolved.picks, source: promptSource(form, resolved) },
        );
        setIsLoading(false);
      } else if (copies > 1 && copiesMode === 'queue') {
        // Queued — separate single-image calls in a row, each with its own
        // fresh seed so they're not near-duplicates, each independently
        // eligible for the free Opus allowance, each with its own roll.
        setIsLoading(true);
        setBatchStatus({ current: 0, total: copies });
        const batchId = crypto.randomUUID();

        for (let i = 0; i < copies; i++) {
          setBatchStatus({ current: i + 1, total: copies });
          const seed =
            form.seed === 0 ? randomSeed() : form.seed + i;
          const resolved = resolveFor(selected);
          const ok = await gen(buildRequest(resolved, seed, baseImageB64), { batchId, wildcardPicks: resolved.picks, source: promptSource(form, resolved) });
          if (!ok) break;
          if (i < copies - 1) await new Promise((r) => setTimeout(r, 1500));
        }

        setIsLoading(false);
        setBatchStatus(null);
      } else {
        const seed = form.seed === 0 ? randomSeed() : form.seed;
        const resolved = resolveFor(selected);
        setIsLoading(true);
        await gen(buildRequest(resolved, seed, baseImageB64), { wildcardPicks: resolved.picks, source: promptSource(form, resolved) });
        setIsLoading(false);
      }
    } else {
      // Batch mode — generate one image per selected prompt sequentially
      const selectedPrompts = form.basePrompts.filter((p) => p.selected && p.text.trim());
      if (selectedPrompts.length === 0) return;

      setIsLoading(true);
      setBatchStatus({ current: 0, total: selectedPrompts.length });
      // One history group for the whole run, like Copies.
      const batchId = crypto.randomUUID();

      for (let i = 0; i < selectedPrompts.length; i++) {
        setBatchStatus({ current: i + 1, total: selectedPrompts.length });
        const seed = form.seed === 0 ? randomSeed() : form.seed;
        const resolved = resolveFor(selectedPrompts[i]);
        const ok = await gen(buildRequest(resolved, seed, baseImageB64), {
          batchId,
          wildcardPicks: resolved.picks,
          source: promptSource(form, resolved),
        });
        if (!ok) break; // stop batch on error
      }

      setIsLoading(false);
      setBatchStatus(null);
    }
  }

  // ── X/Y sweep ──────────────────────────────────────────────────────────

  const [showSweep, setShowSweep] = useState(false);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepStopping, setSweepStopping] = useState(false);
  // Checked between requests, so Stop lets the in-flight image finish.
  const sweepStopRef = useRef(false);

  async function runSweep(x: SweepAxis, y?: SweepAxis) {
    setShowSweep(false);
    const selected = form.basePrompts.find((p) => p.selected);
    if (!selected?.text.trim()) return;

    const cells = sweepCells(x, y);
    const xInfo = axisInfo(x, form.tidbitLibrary);
    const yInfo = y ? axisInfo(y, form.tidbitLibrary) : undefined;
    const sweepId = crypto.randomUUID();
    const seed = form.seed === 0 ? randomSeed() : form.seed;
    // Roll every wildcard once and replay that across the grid, so the only
    // thing changing between cells is what's being swept.
    const baseline = resolveFor(selected);
    const baseImageB64 = await img2imgBaseB64();

    const { made, gen } = collectingGenerate();
    sweepStopRef.current = false;
    setSweepRunning(true);
    setIsLoading(true);
    for (let i = 0; i < cells.length; i++) {
      if (sweepStopRef.current) break;
      const cell = cells[i];
      setBatchStatus({ current: i + 1, total: cells.length });
      const resolved = resolveRequestPrompts(
        selected, form.characters, form.negativePrompt, form.tidbitLibrary, baseline.picks, cell.force,
      );
      const ok = await gen(
        buildRequest(resolved, cell.seed ?? seed, baseImageB64, 1, {
          scale: cell.scale,
          cfgRescale: cell.cfgRescale,
          steps: cell.steps,
          sampler: cell.sampler,
        }),
        {
          batchId: sweepId,
          wildcardPicks: resolved.picks, source: promptSource(form, resolved),
          sweep: { id: sweepId, x: xInfo, xIndex: cell.xIndex, y: yInfo, yIndex: cell.yIndex },
        },
      );
      if (!ok) break;
      if (i < cells.length - 1 && !sweepStopRef.current) await new Promise((r) => setTimeout(r, 1500));
    }
    setIsLoading(false);
    setBatchStatus(null);
    setSweepRunning(false);
    setSweepStopping(false);
    offerAutoChain(made);
  }

  // What a request with the form's settings costs (SMEA is only sent on V3;
  // an img2img base prices by its own size and the strength used).
  const costInput = (steps: number, nSamples: number) => ({
    model: form.model,
    width: img2imgSource ? img2imgSource.width : form.width,
    height: img2imgSource ? img2imgSource.height : form.height,
    steps,
    smea: isV3Model(form.model) && form.smea,
    smeaDyn: isV3Model(form.model) && form.smeaDyn,
    nSamples,
    strength: img2imgSource ? img2imgStrength : undefined,
    ...opusStatus(subscription),
  });

  function sweepCostFor(steps: number): number | null {
    if (!subscription) return null;
    return calculateAnlasCost(costInput(steps, 1));
  }

  // ── Derived button state ───────────────────────────────────────────────

  const hasValidPrompt = form.basePrompts.some((p) => p.selected && p.text.trim());
  const batchCount =
    form.promptMode === 'batch'
      ? form.basePrompts.filter((p) => p.selected && p.text.trim()).length
      : 0;

  const useCopies = form.promptMode === 'single' && copies > 1;
  const anlasCost = calculateAnlasCost(costInput(form.steps, useCopies && copiesMode === 'batch' ? copies : 1));
  const costPerImage =
    batchCount > 1 ? anlasCost * batchCount :
    useCopies && copiesMode === 'queue' ? anlasCost * copies :
    anlasCost;

  function buttonLabel() {
    if (batchStatus) return `Generating ${batchStatus.current} of ${batchStatus.total}…`;
    if (chainBusy) return 'Chain running…';
    if (isLoading) return 'Generating…';
    const base =
      form.promptMode === 'batch' && batchCount > 1 ? `Generate (${batchCount})` :
      useCopies ? `Generate (${copies})` :
      'Generate';
    if (!subscription) return base; // cost estimate needs tier info to know about the Opus discount
    return costPerImage > 0 ? `${base} — ~${costPerImage} Anlas` : `${base} — Free`;
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* API key strip */}
      <div className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-xs border border-slate-700/50">
        <span className="text-slate-500">API key active</span>
        <button
          type="button"
          onClick={() => setApiKey('')}
          className="text-slate-600 hover:text-red-400 transition-colors"
        >
          Change key
        </button>
      </div>

      <AccountStatusBar />

      {/* Error banner */}
      {error && (
        <div className="flex items-start justify-between gap-2 rounded-lg bg-red-900/30 border border-red-700/40 px-3 py-2 text-xs text-red-300">
          <span>{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="flex-shrink-0 text-red-500 hover:text-red-300 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Base image — set via "Use as Base" on a generated image */}
      {img2imgSource && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-violet-700/40 bg-violet-950/20 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img2imgSource.url}
              alt="Base image"
              className="h-10 w-10 flex-shrink-0 rounded object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-violet-300">Img2Img base image</p>
              <p className="text-xs text-slate-500">
                {img2imgSource.width}×{img2imgSource.height} — output locked to this size
              </p>
            </div>
            <button
              type="button"
              onClick={() => setImg2imgSource(null)}
              className="flex-shrink-0 text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
              Remove
            </button>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex flex-1 items-center gap-2 text-xs text-slate-400">
              <span className="w-14 flex-shrink-0">Strength</span>
              <input
                type="range"
                min={0.1}
                max={0.99}
                step={0.01}
                value={img2imgStrength}
                onChange={(e) => setImg2imgStrength(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
              <span className="w-8 flex-shrink-0 text-right">{img2imgStrength.toFixed(2)}</span>
            </label>
            <label className="flex flex-1 items-center gap-2 text-xs text-slate-400">
              <span className="w-14 flex-shrink-0">Noise</span>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={img2imgNoise}
                onChange={(e) => setImg2imgNoise(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
              <span className="w-8 flex-shrink-0 text-right">{img2imgNoise.toFixed(2)}</span>
            </label>
          </div>
        </div>
      )}

      {/* Prompt modifiers — collapsible */}
      <div className="overflow-hidden rounded-lg border border-slate-700/40 bg-slate-800/40">
        <button
          type="button"
          onClick={() => setShowModifiers((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Prompt Modifiers
            {(form.furMode || form.nsfwMode || form.transparentBg || form.qualityPreset !== 'none' || form.ucPreset !== 'none') && (
              <span className="ml-1.5 normal-case font-normal text-violet-400">
                ({[
                  form.furMode && 'Fur',
                  form.nsfwMode && 'NSFW',
                  form.transparentBg && 'Alpha',
                  form.qualityPreset !== 'none' && `Quality: ${QUALITY_LEVEL_LABELS[form.qualityPreset]}`,
                  form.ucPreset !== 'none' && `UC: ${UC_LEVEL_LABELS[form.ucPreset]}`,
                ].filter(Boolean).join(', ')})
              </span>
            )}
          </span>
          <span className="text-slate-500 text-xs">{showModifiers ? '▾' : '▸'}</span>
        </button>

        {showModifiers && (
          <div className="divide-y divide-slate-700/40 border-t border-slate-700/40">
            <label className="flex cursor-pointer items-center justify-between px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-slate-400">Fur Mode</span>
                <p className="text-xs text-slate-600">Prepends &quot;fur dataset&quot;</p>
              </div>
              <input
                type="checkbox"
                checked={form.furMode}
                onChange={(e) => form.set('furMode', e.target.checked)}
                className="h-4 w-4 accent-violet-500"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-slate-400">NSFW</span>
                <p className="text-xs text-slate-600">Prepends &quot;nsfw&quot; (after fur dataset)</p>
              </div>
              <input
                type="checkbox"
                checked={form.nsfwMode}
                onChange={(e) => form.set('nsfwMode', e.target.checked)}
                className="h-4 w-4 accent-violet-500"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-slate-400">Transparent BG</span>
                <p className="text-xs text-slate-600">Adds &quot;transparent background&quot; before the quality tags (V5 only)</p>
              </div>
              <input
                type="checkbox"
                checked={form.transparentBg}
                onChange={(e) => form.set('transparentBg', e.target.checked)}
                className="h-4 w-4 accent-violet-500"
              />
            </label>
            <div className="flex items-center justify-between px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-slate-400">Quality Tags</span>
                <p className="text-xs text-slate-600">
                  NovelAI&apos;s own hidden quality preset for the selected model
                </p>
              </div>
              <select
                value={form.qualityPreset}
                onChange={(e) => form.set('qualityPreset', e.target.value as QualityLevel)}
                className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-200 outline-none focus:border-violet-500"
              >
                {getAvailableQualityLevels(form.model).map((level) => (
                  <option key={level} value={level}>
                    {QUALITY_LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-slate-400">UC Preset</span>
                <p className="text-xs text-slate-600">NovelAI&apos;s own hidden undesired-content preset</p>
              </div>
              <select
                value={form.ucPreset}
                onChange={(e) => form.set('ucPreset', e.target.value as UcLevel)}
                className="rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-slate-200 outline-none focus:border-violet-500"
              >
                {getAvailableUcLevels(form.model).map((level) => (
                  <option key={level} value={level}>
                    {UC_LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Prompt editor tab bar — a direct child of the form (not nested with the
          tab content) so it stays pinned under the header for the whole scroll,
          not just while the prompt list is on screen. */}
      <div ref={tabAnchorRef} className="-mb-4" />
      {/* -top-5 cancels the scroll container's p-5, which sticky otherwise
          honors, leaving a gap under the header for content to peek through. */}
      <div className="sticky -top-5 z-20 -mx-5 border-b border-slate-800/80 bg-sidebar px-5 py-2">
        <div className="flex overflow-hidden rounded-md border border-slate-700 text-xs">
          <button
            type="button"
            onClick={() => switchPromptTab('prompts')}
            className={`flex-1 py-1.5 transition-colors ${
              promptTab === 'prompts'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Base Prompts
          </button>
          <button
            type="button"
            onClick={() => switchPromptTab('characters')}
            className={`flex-1 py-1.5 transition-colors ${
              promptTab === 'characters'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Characters
            {form.characters.length > 0 && (
              <span className="ml-1 opacity-70">({form.characters.length})</span>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* Tab content */}
        {promptTab === 'prompts' ? (
          <BasePromptsEditor
            basePrompts={form.basePrompts}
            promptMode={form.promptMode}
            model={form.model}
            onChange={(basePrompts) => form.set('basePrompts', basePrompts)}
            onModeChange={(promptMode) => form.set('promptMode', promptMode)}
            tokens={tokens}
          />
        ) : (
          <>
            <CharacterPromptsEditor
              characters={form.characters}
              onChange={(characters) => form.set('characters', characters)}
              maxEnabled={form.model.startsWith('nai-diffusion-5') ? 22 : 6}
              model={form.model}
              tokens={tokens}
            />
            {form.characters.length > 0 && (
              <>
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-2.5">
                  <div>
                    <span className="text-xs font-semibold text-slate-400">Use Coordinates</span>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Place characters at their specified X/Y positions
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.useCoords}
                    onChange={(e) => form.set('useCoords', e.target.checked)}
                    className="h-4 w-4 accent-violet-500"
                  />
                </label>
                {form.useCoords && (
                  <button
                    type="button"
                    onClick={() => setShowPositionCanvas(true)}
                    className="rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-2.5 text-xs font-semibold text-slate-400 transition-colors hover:border-violet-500/60 hover:text-violet-300"
                  >
                    Open Position Canvas
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Copies — 2-4 images from one prompt, either a real batch (n_samples,
          extra Anlas cost) or queued back-to-back single generations (each
          independently eligible for the free Opus allowance). */}
      {form.promptMode === 'single' && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-2.5">
          <div>
            <span className="text-xs font-semibold text-slate-400">Copies</span>
            <p className="text-xs text-slate-600">
              {copiesMode === 'queue'
                ? 'Queued one at a time, ~1.5s apart'
                : copies > 1 && wildcards.usesRandom
                  ? 'One request, so all copies share one wildcard roll — use Queue to roll each'
                  : 'One batch request, all at once'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-slate-700 text-xs">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCopies(n)}
                  className={`w-7 py-1.5 transition-colors ${
                    copies === n ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {copies > 1 && (
              <div className="flex overflow-hidden rounded-lg border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setCopiesMode('batch')}
                  title="One request, n_samples > 1 — real extra Anlas cost, generates simultaneously"
                  className={`px-2 py-1.5 transition-colors ${
                    copiesMode === 'batch' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Batch
                </button>
                <button
                  type="button"
                  onClick={() => setCopiesMode('queue')}
                  title="Separate single-image calls in a row — each can land inside the free Opus allowance"
                  className={`px-2 py-1.5 transition-colors ${
                    copiesMode === 'queue' ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Queue
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showPositionCanvas && (
        <CharacterPositionCanvas
          characters={form.characters}
          onChange={(characters) => form.set('characters', characters)}
          onClose={() => setShowPositionCanvas(false)}
          aspectRatio={form.width / form.height}
        />
      )}

      {/* Negative Prompt — collapsible, shows a one-line preview when closed.
          Base Prompts tab only: characters carry their own per-character
          negatives in each card's "Negative" sub-tab. */}
      {promptTab === 'prompts' && (
        <div className="overflow-hidden rounded-lg border border-slate-700/40 bg-slate-800/40">
          <button
            type="button"
            onClick={() => setShowNegativePrompt((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
          >
            <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Negative Prompt
            </span>
            {!showNegativePrompt && (
              <span className="min-w-0 flex-1 truncate text-xs normal-case font-normal text-slate-600">
                {form.negativePrompt || 'None'}
              </span>
            )}
            <span className="flex-shrink-0 text-xs text-slate-500">{showNegativePrompt ? '▾' : '▸'}</span>
          </button>

          {showNegativePrompt && (
            <div className="border-t border-slate-700/40 p-3">
              <TagAutocompleteField
                as="textarea"
                rows={3}
                value={form.negativePrompt}
                onChange={(text) => form.set('negativePrompt', text)}
                model={form.model}
                apiKey={apiKey}
                className={`${inputCls} resize-y`}
              />
              {tokens && (
                <div className="mt-2">
                  <TokenMeter
                    own={tokens.negative}
                    others={tokens.characterUcTotal}
                    othersLabel="Character negatives"
                    budget={tokens.budget}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <TidbitLibrarySection model={form.model} />

      <PresetsSection />

      <ChainsSection />

      <TransferSection />

      {/* Generation settings — collapsible; open by default so nothing already
          relied upon disappears, but collapsible to cut down sidebar scroll
          once dialed in. */}
      <div className="overflow-hidden rounded-lg border border-slate-700/40 bg-slate-800/40">
        <button
          type="button"
          onClick={() => setShowGenSettings((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Generation Settings
            {!showGenSettings && (
              <span className="ml-1.5 normal-case font-normal text-violet-400">
                {modelShortName(form.model)}
                {' · '}
                {img2imgSource ? img2imgSource.width : form.width}×{img2imgSource ? img2imgSource.height : form.height}
                {' · '}{form.steps} steps
              </span>
            )}
          </span>
          <span className="text-slate-500 text-xs">{showGenSettings ? '▾' : '▸'}</span>
        </button>

        {showGenSettings && (
      <div className="flex flex-col gap-4 border-t border-slate-700/40 p-3">
      {/* Model */}
      <div>
        <label className={labelCls}>Model</label>
        <select
          value={form.model}
          onChange={(e) => form.set('model', e.target.value as NovelAIModel)}
          className={inputCls}
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Size presets + manual inputs — locked to the base image's size when one is set */}
      <div>
        <label className={labelCls}>
          Size
          {img2imgSource && <span className="ml-1.5 normal-case font-normal text-violet-400">(locked to base image)</span>}
        </label>
        <div className={`flex flex-wrap gap-1.5 mb-2.5 ${img2imgSource ? 'opacity-40 pointer-events-none' : ''}`}>
          {SIZE_PRESETS.map((preset) => (
            <button
              key={`${preset.width}x${preset.height}`}
              type="button"
              onClick={() => {
                form.set('width', preset.width);
                form.set('height', preset.height);
              }}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                form.width === preset.width && form.height === preset.height
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-xs text-slate-600">Width</p>
            <input
              type="number"
              value={img2imgSource ? img2imgSource.width : form.width}
              onChange={(e) => form.set('width', Number(e.target.value))}
              step={64}
              min={64}
              max={2048}
              disabled={!!img2imgSource}
              className={`${inputCls} disabled:opacity-40`}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-600">Height</p>
            <input
              type="number"
              value={img2imgSource ? img2imgSource.height : form.height}
              onChange={(e) => form.set('height', Number(e.target.value))}
              step={64}
              min={64}
              max={2048}
              disabled={!!img2imgSource}
              className={`${inputCls} disabled:opacity-40`}
            />
          </div>
        </div>
      </div>

      {/* Steps & CFG Scale */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 flex justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span>Steps</span>
            <span className="text-violet-400 normal-case font-normal">{form.steps}</span>
          </label>
          <input
            type="range"
            min={1}
            max={50}
            value={form.steps}
            onChange={(e) => form.set('steps', Number(e.target.value))}
            className="w-full accent-violet-500"
          />
        </div>
        <div>
          <label className="mb-1.5 flex justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span>CFG Scale</span>
            <span className="text-violet-400 normal-case font-normal">{form.scale.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min={1}
            max={10}
            step={0.1}
            value={form.scale}
            onChange={(e) => form.set('scale', Number(e.target.value))}
            className="w-full accent-violet-500"
          />
        </div>
      </div>

      {/* Sampler & Noise Schedule */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Sampler</label>
          <select
            value={form.sampler}
            onChange={(e) => form.set('sampler', e.target.value as NovelAISampler)}
            className={inputCls}
          >
            {SAMPLERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Schedule</label>
          <select
            value={form.noiseSchedule}
            onChange={(e) => form.set('noiseSchedule', e.target.value as NovelAINoiseSchedule)}
            className={inputCls}
          >
            {NOISE_SCHEDULES.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Seed */}
      <div>
        <label className={labelCls}>
          Seed{' '}
          <span className="text-slate-600 normal-case font-normal tracking-normal">
            (0 = generate randomly)
          </span>
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={form.seed}
            onChange={(e) => form.set('seed', Number(e.target.value))}
            min={0}
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            onClick={() => form.set('seed', 0)}
            title="Reset to random"
            className="flex-shrink-0 rounded-lg bg-slate-800 border border-slate-700 px-2.5 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
          >
            ↺
          </button>
        </div>
      </div>
      </div>
        )}
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors self-start"
      >
        <span>{showAdvanced ? '▾' : '▸'}</span>
        Advanced settings
      </button>

      {showAdvanced && (
        <div className="flex flex-col gap-3 rounded-lg bg-slate-800/40 p-4 border border-slate-700/40">
          {/* SMEA */}
          <label className="flex cursor-pointer items-center justify-between">
            <span className="text-xs text-slate-400">SMEA</span>
            <input
              type="checkbox"
              checked={form.smea}
              onChange={(e) => {
                form.set('smea', e.target.checked);
                if (!e.target.checked) form.set('smeaDyn', false);
              }}
              className="h-4 w-4 accent-violet-500"
            />
          </label>

          {/* SMEA DYN — only enabled when SMEA is on */}
          <label
            className={`flex items-center justify-between ${
              form.smea ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
            }`}
          >
            <span className="text-xs text-slate-400">SMEA DYN</span>
            <input
              type="checkbox"
              checked={form.smeaDyn}
              disabled={!form.smea}
              onChange={(e) => form.set('smeaDyn', e.target.checked)}
              className="h-4 w-4 accent-violet-500 disabled:cursor-not-allowed"
            />
          </label>

          {/* CFG Rescale */}
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>CFG Rescale</span>
              <span className="text-violet-400">{form.cfgRescale.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={form.cfgRescale}
              onChange={(e) => form.set('cfgRescale', Number(e.target.value))}
              className="w-full accent-violet-500"
            />
          </div>

          {/* Streaming Mode */}
          <label className="flex cursor-pointer items-center justify-between border-t border-slate-700/40 pt-3">
            <div>
              <span className="text-xs text-slate-400">Streaming Mode</span>
              <p className="text-xs text-slate-600">
                Uses /generate-image-stream; shows intermediate preview frames
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.streamingMode}
              onChange={(e) => form.set('streamingMode', e.target.checked)}
              className="h-4 w-4 accent-violet-500"
            />
          </label>
        </div>
      )}

      {/* Generate button — sticky at the bottom of the scroll container.
          -bottom-5/-mb-5 cancel the container's p-5, same as the tab bar, so
          it sits flush against the bottom edge with nothing peeking under it. */}
      <div className="sticky -bottom-5 -mx-5 -mb-5 border-t border-slate-800/80 bg-slate-900/95 px-5 py-3 backdrop-blur-sm">
        {wildcards.unknown.length > 0 && (
          <p className="mb-2 text-xs text-amber-400" title="No Tidbit Library entry has this label">
            Unknown wildcard{wildcards.unknown.length > 1 ? 's' : ''}: {wildcards.unknown.join(', ')}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading || chainBusy || !hasValidPrompt}
            className="min-w-0 flex-1 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white transition-colors hover:bg-violet-500 active:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {buttonLabel()}
          </button>
          {sweepRunning ? (
            <button
              type="button"
              onClick={() => {
                sweepStopRef.current = true;
                setSweepStopping(true);
              }}
              disabled={sweepStopping}
              title="Stop the sweep after the image in progress"
              className="flex-shrink-0 rounded-xl bg-slate-700 px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {sweepStopping ? 'Stopping…' : 'Stop'}
            </button>
          ) : (
            form.promptMode === 'single' && (
              <button
                type="button"
                onClick={() => setShowSweep(true)}
                disabled={isLoading || chainBusy || !hasValidPrompt}
                title="X/Y sweep: compare settings or wildcard options side by side"
                className="flex-shrink-0 rounded-xl bg-slate-700 px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sweep
              </button>
            )
          )}
        </div>
      </div>

      {showSweep && (
        <SweepModal
          defaults={{ scale: form.scale, cfgRescale: form.cfgRescale, steps: form.steps, sampler: form.sampler, seed: form.seed }}
          randomEntries={wildcards.randomEntries}
          unknownRefs={wildcards.unknown}
          costFor={sweepCostFor}
          onRun={runSweep}
          onClose={() => setShowSweep(false)}
        />
      )}

      {unknownRefs && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setUnknownRefs(null)}
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                Unknown wildcard{unknownRefs.length > 1 ? 's' : ''}
              </h2>
              <p className="mt-2 text-xs text-slate-400">
                No Tidbit Library entry is labelled{' '}
                {unknownRefs.map((r, i) => (
                  <span key={r}>
                    {i > 0 && ', '}
                    <code className="rounded bg-slate-800 px-1 text-amber-300">{r}</code>
                  </span>
                ))}
                , so {unknownRefs.length > 1 ? 'they' : 'it'} will be sent to NovelAI as literal text.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setUnknownRefs(null)}
                className="flex-1 rounded-lg bg-slate-700 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={runGeneration}
                className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
              >
                Generate Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
