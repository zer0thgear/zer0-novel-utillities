'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { Preset, presetSummary, snapshotPreset } from '@/lib/presets';

/** Two-step confirm target: which preset, and for which action. */
type Pending = { id: string; action: 'load' | 'delete' } | null;

export function PresetsSection() {
  const form = useSettingsStore();
  const presets = form.presets;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [includePrompts, setIncludePrompts] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // An armed confirm quietly disarms, so a stray later click can't trigger it.
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 3000);
    return () => clearTimeout(t);
  }, [pending]);

  useEffect(() => {
    if (!loadedId) return;
    const t = setTimeout(() => setLoadedId(null), 1500);
    return () => clearTimeout(t);
  }, [loadedId]);

  const trimmed = name.trim();
  const existing = presets.find((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase());

  function save() {
    if (!trimmed) return;
    // Names match ignoring case, so updating keeps the preset's original name.
    const preset = snapshotPreset(form, existing?.name ?? trimmed, includePrompts, existing?.id);
    form.set(
      'presets',
      existing ? presets.map((p) => (p.id === existing.id ? preset : p)) : [...presets, preset],
    );
    setName('');
  }

  function load(preset: Preset) {
    // Loading prompts overwrites whatever you've written, so it takes a second
    // click; a settings-only preset is safe to apply straight away.
    if (preset.includesPrompts && !(pending?.id === preset.id && pending.action === 'load')) {
      setPending({ id: preset.id, action: 'load' });
      return;
    }
    useSettingsStore.setState(structuredClone(preset.values));
    setPending(null);
    setLoadedId(preset.id);
  }

  function remove(preset: Preset) {
    if (!(pending?.id === preset.id && pending.action === 'delete')) {
      setPending({ id: preset.id, action: 'delete' });
      return;
    }
    form.set('presets', presets.filter((p) => p.id !== preset.id));
    setPending(null);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700/40 bg-slate-800/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Presets
          {presets.length > 0 && (
            <span className="ml-1.5 normal-case font-normal text-violet-400">({presets.length})</span>
          )}
        </span>
        <span className="flex-shrink-0 text-xs text-slate-500">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-slate-700/40 p-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  // Keep Enter from submitting the whole form (i.e. generating).
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    save();
                  }
                }}
                placeholder="Preset name"
                className="min-w-0 flex-1 rounded bg-slate-900/50 px-2 py-1 text-xs text-slate-100 outline-none border border-slate-700/40 focus:border-violet-500 transition-colors"
              />
              <button
                type="button"
                onClick={save}
                disabled={!trimmed}
                title={existing ? `Overwrite "${existing.name}" with the current settings` : 'Save the current settings'}
                className="flex-shrink-0 rounded bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {existing ? 'Update' : 'Save'}
              </button>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={includePrompts}
                onChange={(e) => setIncludePrompts(e.target.checked)}
                className="h-3.5 w-3.5 accent-violet-500"
              />
              Include prompts, characters &amp; negative prompt
            </label>
            <p className="text-[11px] text-slate-600">
              Saves model, size, steps, CFG, sampler, schedule and prompt modifiers, but not the
              seed. Loading a preset replaces those.
            </p>
          </div>

          {presets.map((preset) => {
            const confirmLoad = pending?.id === preset.id && pending.action === 'load';
            const confirmDelete = pending?.id === preset.id && pending.action === 'delete';
            return (
              <div key={preset.id} className="flex items-start gap-2 rounded-md bg-slate-900/40 px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-200" title={preset.name}>
                    {preset.name}
                    {preset.includesPrompts && (
                      <span className="ml-1.5 rounded bg-violet-600/20 px-1 text-[10px] font-normal text-violet-300">
                        + prompts
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[10px] text-slate-500" title={presetSummary(preset)}>
                    {presetSummary(preset)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => load(preset)}
                  title={
                    preset.includesPrompts
                      ? 'Replaces your current settings, prompts, characters and negative prompt'
                      : 'Replaces your current settings'
                  }
                  className={`flex-shrink-0 rounded px-2 py-0.5 text-xs font-semibold transition-colors ${
                    confirmLoad
                      ? 'bg-amber-600 text-white hover:bg-amber-500'
                      : loadedId === preset.id
                        ? 'bg-emerald-700 text-white'
                        : 'bg-slate-700 text-slate-200 hover:bg-violet-600'
                  }`}
                >
                  {confirmLoad ? 'Replace prompts?' : loadedId === preset.id ? 'Loaded' : 'Load'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(preset)}
                  title="Delete preset"
                  className={`flex-shrink-0 text-xs transition-colors ${
                    confirmDelete ? 'font-semibold text-red-400' : 'text-slate-600 hover:text-red-400'
                  }`}
                >
                  {confirmDelete ? 'Delete?' : '✕'}
                </button>
              </div>
            );
          })}

          {presets.length === 0 && (
            <p className="text-xs italic text-slate-600">No presets yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
