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
import { BasePromptsEditor } from './BasePromptsEditor';

// ─── Constants ───────────────────────────────────────────────────────────────

const MODELS: { value: NovelAIModel; label: string }[] = [
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

const BASE_NEGATIVE_TAGS = [
  'nsfw', 'lowres', 'artistic error', 'film grain', 'scan artifacts',
  'worst quality', 'bad quality', 'jpeg artifacts', 'very displeasing',
  'chromatic aberration', 'dithering', 'halftone', 'screentone',
  'multiple views', 'logo', 'too many watermarks', 'negative space', 'blank page',
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
  const [promptTab, setPromptTab] = useState<'prompts' | 'characters'>('prompts');
  const { generate, error, clearError } = useGenerate();
  const { apiKey, setApiKey, isLoading, setIsLoading } = useSessionStore();

  // Batch status: null when idle, set during a batch run
  const [batchStatus, setBatchStatus] = useState<{ current: number; total: number } | null>(null);

  // ── Request builder ────────────────────────────────────────────────────

  function buildRequest(promptText: string, seed: number): NovelAIGenerateRequest {
    const activeCharacters = form.characters.filter((c) => c.enabled);
    const hasCharacters = activeCharacters.length > 0;

    // ── Prefix assembly (order: fur dataset → nsfw → prompt) ──────────────────
    const prefixes: string[] = [];
    if (form.furMode) prefixes.push('fur dataset');
    if (form.nsfwMode) prefixes.push('nsfw');
    const prefixedText =
      prefixes.length > 0 ? `${prefixes.join(', ')}, ${promptText}` : promptText;

    // ── Quality tag suffix ─────────────────────────────────────────────────────
    // 'no text' is only appended when 'Text:' is absent from ALL base prompts
    // and ALL character prompts (case-sensitive per spec).
    let finalText = prefixedText;
    if (form.qualityTags) {
      const hasTextToken =
        form.basePrompts.some((p) => p.text.includes('Text:')) ||
        form.characters.some((c) => c.prompt.includes('Text:'));
      finalText =
        prefixedText +
        ', very aesthetic, masterpiece' +
        (hasTextToken ? '' : ', no text');
    }

    // ── Base negative captions prefix ─────────────────────────────────────────
    // Tags already present (case-insensitive) in any base or character positive
    // prompt are omitted to avoid redundancy, mirroring the 'no text' pattern.
    const baseNegPrompt = (() => {
      if (!form.baseNegativeCaptions) return form.negativePrompt;
      const searchText = [
        ...form.basePrompts.map((p) => p.text),
        ...form.characters.map((c) => c.prompt),
      ].join(' ').toLowerCase();
      const tags = BASE_NEGATIVE_TAGS.filter((t) => !searchText.includes(t.toLowerCase()));
      if (tags.length === 0) return form.negativePrompt;
      return form.negativePrompt
        ? `${tags.join(', ')}, ${form.negativePrompt}`
        : tags.join(', ');
    })();

    return {
      input: finalText,
      model: form.model,
      action: 'generate',
      parameters: {
        width: form.width,
        height: form.height,
        scale: form.scale,
        sampler: form.sampler,
        steps: form.steps,
        n_samples: 1,
        ucPreset: 0,
        qualityToggle: form.qualityToggle,
        sm: form.smea,
        sm_dyn: form.smeaDyn,
        dynamic_thresholding: false,
        controlnet_strength: 1,
        legacy: false,
        add_original_image: false,
        cfg_rescale: form.cfgRescale,
        noise_schedule: form.noiseSchedule,
        skip_cfg_above_sigma: 59.04722600415217,
        seed,
        negative_prompt: baseNegPrompt,
        reference_image_multiple: [],
        reference_information_extracted_multiple: [],
        reference_strength_multiple: [],
        // V4 fields — only included when at least one character is active
        ...(hasCharacters && {
          params_version: 3,
          use_coords: form.useCoords,
          v4_prompt: {
            caption: {
              base_caption: finalText,
              char_captions: activeCharacters.map((c) => ({
                char_caption: c.prompt,
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
          characterPrompts: activeCharacters.map((c) => ({
            prompt: c.prompt,
            uc: c.uc,
            center: c.center,
            enabled: c.enabled,
          })),
        }),
      },
    };
  }

  // ── Submit handler ─────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (form.promptMode === 'single') {
      const selected = form.basePrompts.find((p) => p.selected);
      if (!selected?.text.trim()) return;

      const seed = form.seed === 0 ? Math.floor(Math.random() * 4294967295) : form.seed;
      setIsLoading(true);
      await generate(buildRequest(selected.text, seed));
      setIsLoading(false);
    } else {
      // Batch mode — generate one image per selected prompt sequentially
      const selectedPrompts = form.basePrompts.filter((p) => p.selected && p.text.trim());
      if (selectedPrompts.length === 0) return;

      setIsLoading(true);
      setBatchStatus({ current: 0, total: selectedPrompts.length });

      for (let i = 0; i < selectedPrompts.length; i++) {
        setBatchStatus({ current: i + 1, total: selectedPrompts.length });
        const seed = form.seed === 0 ? Math.floor(Math.random() * 4294967295) : form.seed;
        const ok = await generate(buildRequest(selectedPrompts[i].text, seed));
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

  function buttonLabel() {
    if (batchStatus) return `Generating ${batchStatus.current} of ${batchStatus.total}…`;
    if (isLoading) return 'Generating…';
    if (form.promptMode === 'batch' && batchCount > 1) return `Generate (${batchCount})`;
    return 'Generate';
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

      {/* Prompt modifiers — collapsible */}
      <div className="overflow-hidden rounded-lg border border-slate-700/40 bg-slate-800/40">
        <button
          type="button"
          onClick={() => setShowModifiers((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Prompt Modifiers
            {(form.furMode || form.nsfwMode || form.qualityTags || form.baseNegativeCaptions) && (
              <span className="ml-1.5 normal-case font-normal text-violet-400">
                ({[form.furMode && 'Fur', form.nsfwMode && 'NSFW', form.qualityTags && 'Quality', form.baseNegativeCaptions && 'Neg'].filter(Boolean).join(', ')})
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
                <span className="text-xs font-semibold text-slate-400">Quality Tags</span>
                <p className="text-xs text-slate-600">
                  Appends "very aesthetic, masterpiece, no text"
                </p>
              </div>
              <input
                type="checkbox"
                checked={form.qualityTags}
                onChange={(e) => form.set('qualityTags', e.target.checked)}
                className="h-4 w-4 accent-violet-500"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-slate-400">Base Negative Captions</span>
                <p className="text-xs text-slate-600">Prepends quality negative tags to base UC</p>
              </div>
              <input
                type="checkbox"
                checked={form.baseNegativeCaptions}
                onChange={(e) => form.set('baseNegativeCaptions', e.target.checked)}
                className="h-4 w-4 accent-violet-500"
              />
            </label>
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
            onChange={(basePrompts) => form.set('basePrompts', basePrompts)}
            onModeChange={(promptMode) => form.set('promptMode', promptMode)}
          />
        ) : (
          <>
            <CharacterPromptsEditor
              characters={form.characters}
              onChange={(characters) => form.set('characters', characters)}
            />
            {form.characters.length > 0 && (
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
            )}
          </>
        )}
      </div>

      {/* Negative Prompt — always visible */}
      <div>
        <label className={labelCls}>Negative Prompt</label>
        <textarea
          value={form.negativePrompt}
          onChange={(e) => form.set('negativePrompt', e.target.value)}
          rows={3}
          className={`${inputCls} resize-y`}
        />
      </div>

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

      {/* Size presets + manual inputs */}
      <div>
        <label className={labelCls}>Size</label>
        <div className="flex flex-wrap gap-1.5 mb-2.5">
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
              value={form.width}
              onChange={(e) => form.set('width', Number(e.target.value))}
              step={64}
              min={64}
              max={2048}
              className={inputCls}
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-600">Height</p>
            <input
              type="number"
              value={form.height}
              onChange={(e) => form.set('height', Number(e.target.value))}
              step={64}
              min={64}
              max={2048}
              className={inputCls}
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
        <input
          type="number"
          value={form.seed}
          onChange={(e) => form.set('seed', Number(e.target.value))}
          min={0}
          className={inputCls}
        />
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
