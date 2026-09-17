'use client';

import { useState } from 'react';
import { useGenerate } from '@/hooks/useGenerate';
import { useSessionStore } from '@/store/sessionStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  NovelAIGenerateRequest,
  NovelAIModel,
  NovelAISampler,
  NovelAINoiseSchedule,
} from '@/types/novelai';
import { CharacterPromptsEditor } from './CharacterPromptsEditor';
import { CharacterPositionCanvas } from './CharacterPositionCanvas';
import { BasePromptsEditor } from './BasePromptsEditor';
import { AccountStatusBar } from './AccountStatusBar';
import { composeWithTidbits } from '@/lib/promptTidbits';
import { joinPromptParts } from '@/lib/promptText';
import { calculateAnlasCost } from '@/lib/anlasCost';
import { useSubscription } from '@/hooks/useSubscription';
import {
  composeWithQuality,
  composeNegativeWithUc,
  getAvailableQualityLevels,
  getAvailableUcLevels,
  QUALITY_LEVEL_LABELS,
  UC_LEVEL_LABELS,
  QualityLevel,
  UcLevel,
} from '@/lib/naiPresets';

// ─── Constants ───────────────────────────────────────────────────────────────

const MODELS: { value: NovelAIModel; label: string }[] = [
  { value: 'nai-diffusion-5-full', label: 'NAI Diffusion V5 Full' },
  { value: 'nai-diffusion-5-curated', label: 'NAI Diffusion V5 Curated' },
  { value: 'nai-diffusion-4-5-full', label: 'NAI Diffusion V4.5 Full' },
  { value: 'nai-diffusion-4-curated-preview', label: 'NAI Diffusion V4 Curated' },
  { value: 'nai-diffusion-4-full-preview', label: 'NAI Diffusion V4 Full' },
  { value: 'nai-diffusion-3', label: 'NAI Diffusion V3 (Anime)' },
  { value: 'nai-diffusion-furry-3', label: 'NAI Diffusion V3 (Furry)' },
];

const SAMPLERS: { value: NovelAISampler; label: string }[] = [
  { value: 'k_euler', label: 'Euler' },
  { value: 'k_euler_ancestral', label: 'Euler Ancestral' },
  { value: 'k_dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
  { value: 'k_dpmpp_2m', label: 'DPM++ 2M' },
  { value: 'k_dpmpp_2m_sde', label: 'DPM++ 2M SDE' },
  { value: 'k_dpmpp_sde', label: 'DPM++ SDE' },
  { value: 'ddim_v3', label: 'DDIM V3' },
];

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

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function PromptForm() {
  const form = useSettingsStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showModifiers, setShowModifiers] = useState(false);
  const [showNegativePrompt, setShowNegativePrompt] = useState(false);
  const [showGenSettings, setShowGenSettings] = useState(true);
  const [promptTab, setPromptTab] = useState<'prompts' | 'characters'>('prompts');
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

  // Batch status: null when idle, set during a batch run
  const [batchStatus, setBatchStatus] = useState<{ current: number; total: number } | null>(null);

  // ── Request builder ────────────────────────────────────────────────────

  function buildRequest(promptText: string, seed: number, baseImageB64?: string, nSamples = 1): NovelAIGenerateRequest {
    const activeCharacters = form.characters.filter((c) => c.enabled);
    const charPrompt = (c: (typeof activeCharacters)[number]) => composeWithTidbits(c.prompt, c.tidbits);

    // ── Prefix assembly (order: fur dataset → nsfw → prompt) ──────────────────
    const prefixes: string[] = [];
    if (form.furMode) prefixes.push('fur dataset');
    if (form.nsfwMode) prefixes.push('nsfw');
    const prefixedText = joinPromptParts(...prefixes, promptText);

    // ── Quality preset suffix (verbatim per-model text, see lib/naiPresets.ts) ──
    let finalText = composeWithQuality(prefixedText, form.model, form.qualityPreset);
    if (form.transparentBg) finalText = joinPromptParts(finalText, 'transparent background');

    // ── UC preset prefix — tags already present (case-insensitive) in any base
    // or character positive prompt are skipped to avoid contradicting the user.
    const positiveSearchText = [
      ...form.basePrompts.map((p) => composeWithTidbits(p.text, p.tidbits)),
      ...form.characters.map((c) => charPrompt(c)),
    ].join(' ').toLowerCase();
    const baseNegPrompt = composeNegativeWithUc(form.negativePrompt, form.model, form.ucPreset, positiveSearchText);

    return {
      input: finalText,
      model: form.model,
      action: baseImageB64 ? 'img2img' : 'generate',
      parameters: {
        params_version: 3,
        width: baseImageB64 && img2imgSource ? img2imgSource.width : form.width,
        height: baseImageB64 && img2imgSource ? img2imgSource.height : form.height,
        scale: form.scale,
        sampler: form.sampler,
        steps: form.steps,
        n_samples: nSamples,
        ucPreset: 0,
        qualityToggle: form.qualityToggle,
        sm: form.smea,
        sm_dyn: form.smeaDyn,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        add_original_image: !!baseImageB64,
        cfg_rescale: form.cfgRescale,
        noise_schedule: form.noiseSchedule,
        skip_cfg_above_sigma: null,
        use_coords: form.useCoords,
        deliberate_euler_ancestral_bug: false,
        prefer_brownian: true,
        seed,
        ...(baseImageB64 ? { strength: img2imgStrength, noise: img2imgNoise, image: baseImageB64 } : {}),
        negative_prompt: baseNegPrompt,
        reference_image_multiple: [],
        reference_information_extracted_multiple: [],
        reference_strength_multiple: [],
        v4_prompt: {
          caption: {
            base_caption: finalText,
            char_captions: activeCharacters.map((c) => ({
              char_caption: charPrompt(c),
              centers: [c.center],
            })),
          },
          use_coords: form.useCoords,
          use_order: true,
        },
        v4_negative_prompt: {
          caption: {
            base_caption: baseNegPrompt,
            char_captions: activeCharacters.map((c) => ({
              char_caption: c.uc,
              centers: [c.center],
            })),
          },
          legacy_uc: false,
        },
        legacy_uc: false,
        characterPrompts: activeCharacters.map((c) => ({
          prompt: charPrompt(c),
          uc: c.uc,
          center: c.center,
          enabled: c.enabled,
        })),
      },
    };
  }

  // ── Submit handler ─────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const baseImageB64 = img2imgSource ? await blobToBase64(img2imgSource.blob) : undefined;

    if (form.promptMode === 'single') {
      const selected = form.basePrompts.find((p) => p.selected);
      if (!selected?.text.trim()) return;
      const promptText = composeWithTidbits(selected.text, selected.tidbits);

      if (copies > 1 && copiesMode === 'batch') {
        // True batch — one request, n_samples > 1, real extra Anlas cost.
        const seed = form.seed === 0 ? Math.floor(Math.random() * 4294967295) : form.seed;
        setIsLoading(true);
        await generate(
          buildRequest(promptText, seed, baseImageB64, copies),
          { batchId: crypto.randomUUID(), forceStandard: true },
        );
        setIsLoading(false);
      } else if (copies > 1 && copiesMode === 'queue') {
        // Queued — separate single-image calls in a row, each with its own
        // fresh seed so they're not near-duplicates, each independently
        // eligible for the free Opus allowance.
        setIsLoading(true);
        setBatchStatus({ current: 0, total: copies });
        const batchId = crypto.randomUUID();

        for (let i = 0; i < copies; i++) {
          setBatchStatus({ current: i + 1, total: copies });
          const seed =
            form.seed === 0 ? Math.floor(Math.random() * 4294967295) : form.seed + i;
          const ok = await generate(buildRequest(promptText, seed, baseImageB64), { batchId });
          if (!ok) break;
          if (i < copies - 1) await new Promise((r) => setTimeout(r, 1500));
        }

        setIsLoading(false);
        setBatchStatus(null);
      } else {
        const seed = form.seed === 0 ? Math.floor(Math.random() * 4294967295) : form.seed;
        setIsLoading(true);
        await generate(buildRequest(promptText, seed, baseImageB64));
        setIsLoading(false);
      }
    } else {
      // Batch mode — generate one image per selected prompt sequentially
      const selectedPrompts = form.basePrompts.filter((p) => p.selected && p.text.trim());
      if (selectedPrompts.length === 0) return;

      setIsLoading(true);
      setBatchStatus({ current: 0, total: selectedPrompts.length });

      for (let i = 0; i < selectedPrompts.length; i++) {
        setBatchStatus({ current: i + 1, total: selectedPrompts.length });
        const seed = form.seed === 0 ? Math.floor(Math.random() * 4294967295) : form.seed;
        const promptText = composeWithTidbits(selectedPrompts[i].text, selectedPrompts[i].tidbits);
        const ok = await generate(buildRequest(promptText, seed, baseImageB64));
        if (!ok) break; // stop batch on error
      }

      setIsLoading(false);
      setBatchStatus(null);
    }
  };

  // ── Derived button state ───────────────────────────────────────────────

  const hasValidPrompt = form.basePrompts.some((p) => p.selected && p.text.trim());
  const batchCount =
    form.promptMode === 'batch'
      ? form.basePrompts.filter((p) => p.selected && p.text.trim()).length
      : 0;

  const useCopies = form.promptMode === 'single' && copies > 1;
  const anlasCost = calculateAnlasCost({
    width: img2imgSource ? img2imgSource.width : form.width,
    height: img2imgSource ? img2imgSource.height : form.height,
    steps: form.steps,
    smea: form.smea,
    smeaDyn: form.smeaDyn,
    nSamples: useCopies && copiesMode === 'batch' ? copies : 1,
    isOpus: subscription?.tier === 3,
  });
  const costPerImage =
    batchCount > 1 ? anlasCost * batchCount :
    useCopies && copiesMode === 'queue' ? anlasCost * copies :
    anlasCost;

  function buttonLabel() {
    if (batchStatus) return `Generating ${batchStatus.current} of ${batchStatus.total}…`;
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
                <p className="text-xs text-slate-600">Prepends "fur dataset"</p>
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
                <p className="text-xs text-slate-600">Prepends "nsfw" (after fur dataset)</p>
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
                <p className="text-xs text-slate-600">Appends &quot;transparent background&quot; (V5 only)</p>
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
                  NovelAI's own hidden quality preset for the selected model
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
                <p className="text-xs text-slate-600">NovelAI's own hidden undesired-content preset</p>
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

      {/* Prompt editor tabs */}
      <div className="flex flex-col gap-3">
        {/* Tab bar */}
        <div className="flex overflow-hidden rounded-md border border-slate-700 text-xs">
          <button
            type="button"
            onClick={() => setPromptTab('prompts')}
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
            onClick={() => setPromptTab('characters')}
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

        {/* Tab content */}
        {promptTab === 'prompts' ? (
          <BasePromptsEditor
            basePrompts={form.basePrompts}
            promptMode={form.promptMode}
            model={form.model}
            onChange={(basePrompts) => form.set('basePrompts', basePrompts)}
            onModeChange={(promptMode) => form.set('promptMode', promptMode)}
          />
        ) : (
          <>
            <CharacterPromptsEditor
              characters={form.characters}
              onChange={(characters) => form.set('characters', characters)}
              maxEnabled={form.model.startsWith('nai-diffusion-5') ? 22 : 6}
              model={form.model}
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
              {copiesMode === 'batch' ? 'One batch request, all at once' : 'Queued one at a time, ~1.5s apart'}
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

      {/* Negative Prompt — collapsible, shows a one-line preview when closed */}
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
            <textarea
              value={form.negativePrompt}
              onChange={(e) => form.set('negativePrompt', e.target.value)}
              rows={3}
              className={`${inputCls} resize-y`}
            />
          </div>
        )}
      </div>

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
                {form.model.includes('5') ? 'V5' : form.model.includes('4-5') ? 'V4.5' : form.model.includes('4') ? 'V4' : 'V3'}
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
          {/* Quality Toggle */}
          <label className="flex cursor-pointer items-center justify-between">
            <span className="text-xs text-slate-400">Quality Toggle</span>
            <input
              type="checkbox"
              checked={form.qualityToggle}
              onChange={(e) => form.set('qualityToggle', e.target.checked)}
              className="h-4 w-4 accent-violet-500"
            />
          </label>

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

      {/* Generate button — sticky at the bottom of the scroll container */}
      <div className="sticky bottom-0 -mx-5 border-t border-slate-800/80 bg-slate-900/95 px-5 py-3 backdrop-blur-sm">
        <button
          type="submit"
          disabled={isLoading || !hasValidPrompt}
          className="w-full rounded-xl bg-violet-600 py-3 text-sm font-bold text-white transition-colors hover:bg-violet-500 active:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {buttonLabel()}
        </button>
      </div>
    </form>
  );
}
