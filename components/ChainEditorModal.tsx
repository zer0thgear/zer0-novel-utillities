'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useSessionStore } from '@/store/sessionStore';
import { TagAutocompleteField } from '@/components/TagAutocompleteField';
import { useSubscription } from '@/hooks/useSubscription';
import { ReorderArrows } from '@/components/ReorderArrows';
import { opusStatus } from '@/lib/anlasCost';
import { defaultStep, DIRECTOR_TOOLS, EMOTIONS, planChain, STEP_KINDS } from '@/lib/chains';
import { EnhanceScale, scaleLabel } from '@/lib/enhance';
import { moveItem } from '@/lib/promptText';
import { Chain, ChainStep, NovelAIModel } from '@/types/novelai';

interface Props {
  /** The chain to edit, or null for a new one. */
  chain: Chain | null;
  onClose: () => void;
}

const ENHANCE_SCALE_CHOICES: EnhanceScale[] = [1, 1.5, 2, 'max'];

const selectCls =
  'rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200 outline-none border border-slate-700/60 focus:border-violet-500';

export function ChainEditorModal({ chain, onClose }: Props) {
  const form = useSettingsStore();
  const { subscription } = useSubscription();
  const [name, setName] = useState(chain?.name ?? '');
  const [steps, setSteps] = useState<ChainStep[]>(chain?.steps ?? []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const draft: Chain = { id: chain?.id ?? '', name, steps };
  // Priced for an image from the sidebar's current size and model.
  const plan = planChain(
    draft,
    { width: form.width, height: form.height, model: form.model, steps: form.steps },
    { formModel: form.model, formSteps: form.steps, ...opusStatus(subscription) },
  );
  const trimmed = name.trim();
  const nameTaken = form.chains.some((c) => c.id !== chain?.id && c.name.trim().toLowerCase() === trimmed.toLowerCase());

  const update = (i: number, patch: Partial<ChainStep>) =>
    setSteps((prev) => prev.map((s, j) => (j === i ? ({ ...s, ...patch } as ChainStep) : s)));

  function save() {
    if (!trimmed || nameTaken || steps.length === 0) return;
    const saved: Chain = { id: chain?.id ?? crypto.randomUUID(), name: trimmed, steps };
    form.set('chains', chain ? form.chains.map((c) => (c.id === chain.id ? saved : c)) : [...form.chains, saved]);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* The whole window scrolls on short screens, so steps never get squeezed out. */}
      <div className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <h2 className="text-sm font-bold text-slate-100">{chain ? 'Edit chain' : 'New chain'}</h2>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Chain name, e.g. Clean up & save"
          className="rounded bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 outline-none border border-slate-700 focus:border-violet-500"
        />
        {nameTaken && <p className="text-xs text-amber-400">Another chain already has that name.</p>}

        <div className="flex flex-col gap-1.5">
          {steps.map((step, i) => {
            const planned = plan.steps[i];
            return (
              <div key={i} className="flex flex-col gap-1.5 rounded-lg bg-slate-800/60 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="w-4 flex-shrink-0 text-xs text-slate-500">{i + 1}.</span>
                  <select
                    value={step.kind}
                    onChange={(e) =>
                      setSteps((prev) => prev.map((s, j) => (j === i ? defaultStep(e.target.value as ChainStep['kind']) : s)))
                    }
                    className={selectCls}
                  >
                    {STEP_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <span className={`ml-auto text-[11px] ${planned.cost > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                    {planned.cost > 0 ? `~${planned.cost}` : 'Free'}
                  </span>
                  <ReorderArrows index={i} count={steps.length} onMove={(d) => setSteps((prev) => moveItem(prev, i, d))} label="step" />
                  <button
                    type="button"
                    onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                    title="Remove step"
                    className="text-xs text-slate-600 transition-colors hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>

                <StepOptions step={step} onChange={(patch) => update(i, patch)} model={form.model} />
                {planned.problem && <p className="text-[11px] text-red-300">{planned.problem}</p>}
              </div>
            );
          })}
          {steps.length === 0 && <p className="text-xs italic text-slate-600">No steps yet.</p>}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Add step:</span>
          <div className="flex flex-wrap gap-1">
            {STEP_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setSteps((prev) => [...prev, defaultStep(k.value)])}
                className="rounded bg-slate-700 px-2 py-0.5 text-[11px] text-slate-200 transition-colors hover:bg-violet-600"
              >
                + {k.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          Estimate for a {form.width}×{form.height} image from the sidebar:{' '}
          <span className={plan.costPerImage > 0 ? 'text-amber-300' : 'text-emerald-400'}>
            {plan.costPerImage > 0 ? `~${plan.costPerImage} Anlas` : 'free'}
          </span>
          . Every run shows its real estimate and asks first if it isn&apos;t free.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!trimmed || nameTaken || steps.length === 0}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save chain
          </button>
        </div>
      </div>
    </div>
  );
}

/** The options for one step, matching the viewer's own panels. */
function StepOptions({
  step,
  onChange,
  model,
}: {
  step: ChainStep;
  onChange: (patch: Partial<ChainStep>) => void;
  model: NovelAIModel;
}) {
  const apiKey = useSessionStore((s) => s.apiKey);
  const row = 'flex flex-wrap items-center gap-2 pl-6 text-xs text-slate-400';
  switch (step.kind) {
    case 'tags':
      return (
        <div className="flex flex-col gap-1 pl-6">
          <TagAutocompleteField
            as="input"
            value={step.tags}
            onChange={(tags) => onChange({ tags })}
            model={model}
            apiKey={apiKey}
            placeholder="e.g. smile, looking at viewer"
            className="w-full rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200 outline-none border border-slate-700/60 focus:border-violet-500"
          />
          <p className="text-[11px] text-slate-500">
            Added to the prompt for the Enhance and Variations steps after this one. Your prompt in the sidebar
            isn&apos;t changed.
          </p>
        </div>
      );
    case 'enhance':
      return (
        <div className={row}>
          Level
          <select value={step.level} onChange={(e) => onChange({ level: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })} className={selectCls}>
            {[1, 2, 3, 4, 5].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          Scale
          <select
            value={String(step.scale)}
            onChange={(e) => onChange({ scale: e.target.value === 'max' ? 'max' : (Number(e.target.value) as 1 | 1.5 | 2) })}
            title="NovelAI offers 1.5× for its standard 832×1216 size; other sizes get the scales that land on multiples of 64 within 3.1 MP. Max is V5 only."
            className={selectCls}
          >
            {ENHANCE_SCALE_CHOICES.map((sc) => (
              <option key={String(sc)} value={String(sc)}>
                {scaleLabel(sc)}
              </option>
            ))}
          </select>
        </div>
      );
    case 'director':
      return (
        <div className={row}>
          <select value={step.tool} onChange={(e) => onChange({ tool: e.target.value as typeof step.tool })} className={selectCls}>
            {DIRECTOR_TOOLS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {step.tool === 'emotion' && (
            <select value={step.emotion ?? ''} onChange={(e) => onChange({ emotion: e.target.value })} className={selectCls}>
              <option value="" disabled>
                Emotion…
              </option>
              {EMOTIONS.map((em) => (
                <option key={em} value={em}>
                  {em}
                </option>
              ))}
            </select>
          )}
          {(step.tool === 'colorize' || step.tool === 'emotion') && (
            <>
              <input
                type="text"
                value={step.prompt ?? ''}
                onChange={(e) => onChange({ prompt: e.target.value })}
                placeholder={step.tool === 'colorize' ? 'Prompt (optional)' : 'Extra prompt (optional)'}
                className="min-w-0 flex-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200 outline-none border border-slate-700/60 focus:border-violet-500"
              />
              <label className="flex items-center gap-1">
                Defry
                <select value={step.defry ?? 0} onChange={(e) => onChange({ defry: Number(e.target.value) })} className={selectCls}>
                  {[0, 1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      );
    case 'pixelSnap':
      return (
        <div className={row}>
          Palette
          <select value={step.palettize} onChange={(e) => onChange({ palettize: e.target.value as typeof step.palettize })} className={selectCls}>
            <option value="off">Off</option>
            <option value="auto">Auto</option>
            <option value="custom">Custom</option>
          </select>
          {step.palettize === 'custom' && (
            <input
              type="number"
              min={2}
              max={256}
              value={step.colors ?? 64}
              onChange={(e) => onChange({ colors: Math.min(256, Math.max(2, Number(e.target.value))) })}
              className="w-14 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-200 outline-none border border-slate-700/60"
            />
          )}
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={step.avoidOverRefining ?? false}
              onChange={(e) => onChange({ avoidOverRefining: e.target.checked })}
              className="accent-violet-500"
            />
            Coarser
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={step.upscale ?? false} onChange={(e) => onChange({ upscale: e.target.checked })} className="accent-violet-500" />
            Scale back up
          </label>
        </div>
      );
    case 'variations':
      return <p className="pl-6 text-[11px] text-slate-500">Makes 3 variants of the image; must be the last step.</p>;
    default:
      return null;
  }
}
