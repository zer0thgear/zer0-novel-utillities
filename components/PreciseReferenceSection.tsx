'use client';

import { useRef, useState } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { NovelAIModel } from '@/types/novelai';
import { createReference } from '@/lib/imageUtils';
import { modelShortName } from '@/lib/models';
import {
  KIND_DESCRIPTION,
  MAX_REFERENCES,
  PreciseReference,
  prefersSameOutfit,
  REFERENCE_PRICE,
  referenceCaps,
  ReferenceKind,
  referenceKind,
  referencesFor,
  withSameOutfit,
} from '@/lib/preciseReference';
import { ReorderArrows } from './ReorderArrows';

// NovelAI's labels, in its list's order. Outfit is V5 only.
const KINDS: { kind: ReferenceKind; label: string }[] = [
  { kind: 'characterAndStyle', label: 'Character & Style' },
  { kind: 'character', label: 'Character' },
  { kind: 'style', label: 'Style' },
  { kind: 'outfit', label: 'Outfit' },
];

interface Props {
  /** The model a generation would use (Medium already switched to High). */
  model: NovelAIModel;
  /** An Image2Image base with a mask is set: generating inpaints. */
  inpainting: boolean;
}

/** Precise Reference: images that guide a generation's character, style or
 *  outfit. Sent with every generation that uses the sidebar's settings. */
export function PreciseReferenceSection({ model, inpainting }: Props) {
  const references = useSessionStore((s) => s.references);
  const { addReferences, updateReference, removeReference, moveReference } = useSessionStore();
  const [open, setOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const caps = referenceCaps(model);
  const sent = referencesFor(references, model, { inpainting });
  const room = MAX_REFERENCES - references.length;

  async function add(files: FileList | null) {
    const images = Array.from(files ?? []).filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (images.length === 0) return;
    addReferences(await Promise.all(images.map((f) => createReference(f, f.name))));
    setOpen(true);
  }

  // NovelAI's warnings, in its words where it has them.
  const notes: string[] = [];
  if (references.length > 0) {
    if (!caps) {
      notes.push(`Precise Reference works on V5 and V4.5, so nothing here is sent on ${modelShortName(model)}.`);
    } else if (inpainting && !caps.inpainting) {
      notes.push('Inpainting is not supported while using a precise reference. The precise reference image will be ignored.');
    } else {
      if (!caps.outfits && references.some((r) => r.enabled && r.description === 'costume')) {
        notes.push("Outfit references aren't supported by this model and will be skipped.");
      }
      const styleStrength = references
        .filter((r) => r.enabled && referenceKind(r.description) !== 'character' && r.description !== 'costume')
        .reduce((sum, r) => sum + r.strength, 0);
      if (inpainting && styleStrength > 0.8) {
        notes.push('Having Style References during Inpaint with too much Strength may lead to distortion.');
      }
    }
  }

  const summary =
    references.length === 0
      ? 'None'
      : `${sent.length} sent` + (sent.length ? ` · +${sent.length * REFERENCE_PRICE} Anlas per image` : '');

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700/40 bg-slate-800/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Precise Reference
        </span>
        {!open && <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{summary}</span>}
        <span className="flex-shrink-0 text-xs text-slate-500">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-slate-700/40 p-3">
          <p className="text-xs text-slate-500">
            Add a reference image for a character, style or outfit. Each one sent costs {REFERENCE_PRICE} Anlas per image.
          </p>
          {notes.map((n) => (
            <p key={n} className="text-xs text-amber-400/90">
              {n}
            </p>
          ))}

          {references.map((ref, i) => (
            <ReferenceCard
              key={ref.id}
              reference={ref}
              index={i}
              count={references.length}
              outfits={caps?.outfits ?? true}
              fidelity={caps?.fidelity ?? false}
              strengthMax={caps?.strengthMax ?? 5}
              onChange={(patch) => updateReference(ref.id, patch)}
              onMove={(dir) => moveReference(ref.id, dir === 'up' ? -1 : 1)}
              onRemove={() => removeReference(ref.id)}
            />
          ))}

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={room <= 0}
            title={room <= 0 ? `NovelAI takes up to ${MAX_REFERENCES} references` : 'Or drop or paste an image anywhere'}
            className="self-start text-xs text-slate-500 transition-colors hover:text-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Add reference images
          </button>
        </div>
      )}
    </div>
  );
}

interface CardProps {
  reference: PreciseReference;
  index: number;
  count: number;
  outfits: boolean;
  fidelity: boolean;
  strengthMax: number;
  onChange: (patch: Partial<PreciseReference>) => void;
  onMove: (direction: 'up' | 'down') => void;
  onRemove: () => void;
}

function ReferenceCard({ reference: ref, index, count, outfits, fidelity, strengthMax, onChange, onMove, onRemove }: CardProps) {
  const kind = referenceKind(ref.description);
  const sameOutfit = outfits ? prefersSameOutfit(ref.description) : null;
  const slider = (label: string, value: number, max: number, set: (v: number) => void, title?: string) => (
    <label className="flex items-center gap-2 text-xs text-slate-400" title={title}>
      <span className="w-14 flex-shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={0.05}
        value={Math.min(value, max)}
        onChange={(e) => set(Number(e.target.value))}
        className="w-full accent-violet-500"
      />
      <span className="w-8 flex-shrink-0 text-right">{value.toFixed(2)}</span>
    </label>
  );

  return (
    <div
      className={`flex gap-2.5 rounded-lg border border-slate-700/40 bg-slate-900/40 p-2 transition-opacity ${
        ref.enabled ? '' : 'opacity-50'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ref.url}
        alt={ref.name}
        title={`${ref.name} (${ref.width}×${ref.height})`}
        className="h-16 w-16 flex-shrink-0 rounded object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <select
            value={kind}
            onChange={(e) => onChange({ description: KIND_DESCRIPTION[e.target.value as ReferenceKind] })}
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-xs text-slate-200 outline-none focus:border-violet-500"
          >
            {KINDS.map((k) => (
              <option key={k.kind} value={k.kind} disabled={k.kind === 'outfit' && !outfits}>
                {k.label}
                {k.kind === 'outfit' && !outfits ? ' (V5 only)' : ''}
              </option>
            ))}
          </select>
          <label className="flex flex-shrink-0 cursor-pointer items-center gap-1 text-[11px] text-slate-500" title="Send this reference">
            <input
              type="checkbox"
              checked={ref.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
              className="h-3.5 w-3.5 accent-violet-500"
            />
            On
          </label>
          <ReorderArrows index={index} count={count} onMove={onMove} label="reference" />
          <button
            type="button"
            onClick={onRemove}
            title="Remove"
            className="flex-shrink-0 px-1 text-xs text-slate-500 transition-colors hover:text-red-400"
          >
            ✕
          </button>
        </div>
        {sameOutfit !== null && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={sameOutfit}
              onChange={(e) => onChange({ description: withSameOutfit(ref.description, e.target.checked) })}
              className="h-3.5 w-3.5 accent-violet-500"
            />
            Prefer same outfit
          </label>
        )}
        {slider(
          'Strength',
          ref.strength,
          strengthMax,
          (strength) => onChange({ strength }),
          'Higher follows the reference more closely; lower leaves more room',
        )}
        {fidelity && slider('Fidelity', ref.fidelity, 1, (v) => onChange({ fidelity: v }))}
      </div>
    </div>
  );
}
