'use client';

import { useState } from 'react';
import { SweepAxisDraft } from '@/lib/sweeps';
import { saveSweepPreset, SweepPreset, sweepPresetSummary } from '@/lib/sweepPresets';
import { useSettingsStore } from '@/store/settingsStore';

interface Props {
  x: SweepAxisDraft;
  y: SweepAxisDraft;
  onLoad: (preset: SweepPreset) => void;
}

/** Loading, saving and deleting named sweep setups. Shown above both axis
 *  editors — the Sweep dialog's and a chain's Sweep step's — so a grid set up
 *  in one is available in the other. */
export function SweepPresetBar({ x, y, onLoad }: Props) {
  const presets = useSettingsStore((s) => s.sweepPresets);
  const set = useSettingsStore((s) => s.set);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');

  function save() {
    if (!name.trim()) return;
    set('sweepPresets', saveSweepPreset(presets, name, x, y));
    const saved = presets.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
    setSelected(saved?.id ?? '');
    setNaming(false);
    setName('');
  }

  const chosen = presets.find((p) => p.id === selected);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Saved setups</span>
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            const preset = presets.find((p) => p.id === e.target.value);
            if (preset) onLoad(preset);
          }}
          disabled={presets.length === 0}
          className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 disabled:opacity-50"
        >
          <option value="">{presets.length === 0 ? 'None saved yet' : 'Load a setup…'}</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name} — {sweepPresetSummary(preset)}
            </option>
          ))}
        </select>
        {chosen ? (
          <button
            type="button"
            onClick={() => {
              set(
                'sweepPresets',
                presets.filter((p) => p.id !== chosen.id),
              );
              setSelected('');
            }}
            title={`Delete "${chosen.name}"`}
            className="flex-shrink-0 rounded px-1.5 py-1 text-xs text-slate-500 transition-colors hover:bg-red-700 hover:text-white"
          >
            Delete
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setNaming((v) => !v);
              setName('');
            }}
            className="flex-shrink-0 rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 transition-colors hover:bg-slate-600"
          >
            Save…
          </button>
        )}
      </div>

      {naming && (
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
            autoFocus
            placeholder="Name this setup"
            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600"
          />
          <button
            type="button"
            onClick={save}
            disabled={!name.trim()}
            className="flex-shrink-0 rounded bg-violet-600 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      )}
      {naming && presets.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase()) && (
        <p className="text-[11px] text-amber-300/80">Saving over the setup already called that.</p>
      )}
    </div>
  );
}
