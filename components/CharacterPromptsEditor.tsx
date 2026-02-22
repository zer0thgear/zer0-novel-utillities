'use client';

import { useState } from 'react';
import { CharacterPromptEntry } from '@/types/novelai';

const MAX_ENABLED = 6;

interface Props {
  characters: CharacterPromptEntry[];
  onChange: (characters: CharacterPromptEntry[]) => void;
}

type ActiveTab = 'prompt' | 'uc';

export function CharacterPromptsEditor({ characters, onChange }: Props) {
  const [activeTabs, setActiveTabs] = useState<Record<string, ActiveTab>>({});

  const enabledCount = characters.filter((c) => c.enabled).length;
  const atCap = enabledCount >= MAX_ENABLED;

  const addCharacter = () => {
    const entry: CharacterPromptEntry = {
      id: crypto.randomUUID(),
      prompt: '',
      uc: '',
      center: { x: 0.5, y: 0.5 },
      // Auto-disable if already at the cap
      enabled: !atCap,
    };
    onChange([...characters, entry]);
  };

  const remove = (id: string) => {
    onChange(characters.filter((c) => c.id !== id));
    setActiveTabs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const update = (id: string, patch: Partial<CharacterPromptEntry>) =>
    onChange(characters.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const getTab = (id: string): ActiveTab => activeTabs[id] ?? 'prompt';

  const setTab = (id: string, tab: ActiveTab) =>
    setActiveTabs((prev) => ({ ...prev, [id]: tab }));

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Characters
          {characters.length > 0 && (
            <span
              className={`ml-1.5 font-normal normal-case tracking-normal ${
                atCap ? 'text-violet-400' : 'text-slate-600'
              }`}
            >
              ({enabledCount}/{MAX_ENABLED} active)
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={addCharacter}
          className="rounded px-2.5 py-1 text-xs bg-slate-700 text-slate-300 hover:bg-violet-600 hover:text-white transition-colors"
        >
          + Add
        </button>
      </div>

      {/* Character cards */}
      {characters.map((char, index) => {
        const tab = getTab(char.id);
        const canEnable = char.enabled || !atCap;

        return (
          <div
            key={char.id}
            className={`overflow-hidden rounded-lg border transition-colors ${
              char.enabled
                ? 'border-slate-700 bg-slate-800/50'
                : 'border-slate-800/60 bg-slate-900/20'
            }`}
          >
            {/* Card header */}
            <div
              className={`flex items-center justify-between border-b px-3 py-2 transition-colors ${
                char.enabled
                  ? 'border-slate-700 bg-slate-800'
                  : 'border-slate-800/60 bg-slate-900/40'
              }`}
            >
              <input
                type="text"
                value={char.label ?? ''}
                onChange={(e) => update(char.id, { label: e.target.value })}
                placeholder={`Character ${index + 1}`}
                className={`min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none placeholder-slate-600 transition-colors ${
                  char.enabled ? 'text-slate-300' : 'text-slate-600'
                }`}
              />

              <div className="flex items-center gap-3">
                {/* Enabled toggle */}
                <label
                  className={`flex items-center gap-1.5 text-xs transition-colors ${
                    canEnable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                  }`}
                  title={
                    !canEnable
                      ? `Maximum ${MAX_ENABLED} characters can be active at once`
                      : char.enabled
                      ? 'Disable this character'
                      : 'Enable this character'
                  }
                >
                  <span className={char.enabled ? 'text-violet-400' : 'text-slate-600'}>
                    {char.enabled ? 'On' : 'Off'}
                  </span>
                  <input
                    type="checkbox"
                    checked={char.enabled}
                    disabled={!canEnable}
                    onChange={(e) => update(char.id, { enabled: e.target.checked })}
                    className="h-3.5 w-3.5 accent-violet-500 disabled:cursor-not-allowed"
                  />
                </label>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => remove(char.id)}
                  title="Remove character"
                  className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Card body — dimmed when disabled */}
            <div className={`transition-opacity ${char.enabled ? 'opacity-100' : 'opacity-40'}`}>
              {/* Tab buttons */}
              <div className="flex border-b border-slate-700/60">
                {(['prompt', 'uc'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(char.id, t)}
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                      tab === t
                        ? 'border-b-2 border-violet-500 bg-violet-600/10 text-violet-300'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {t === 'prompt' ? 'Prompt' : 'Negative'}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex flex-col gap-2.5 p-3">
                <textarea
                  value={tab === 'prompt' ? char.prompt : char.uc}
                  onChange={(e) =>
                    update(char.id, { [tab === 'prompt' ? 'prompt' : 'uc']: e.target.value })
                  }
                  placeholder={
                    tab === 'prompt'
                      ? 'girl, solo, anthro, …'
                      : 'negative tags for this character…'
                  }
                  rows={3}
                  className="w-full resize-none rounded-lg bg-slate-900/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none border border-slate-700/40 focus:border-violet-500 transition-colors"
                />

                {/* Position inputs */}
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-600">Position</span>
                  {(['x', 'y'] as const).map((axis) => (
                    <label key={axis} className="flex items-center gap-1.5">
                      <span className="uppercase text-slate-600">{axis}</span>
                      <input
                        type="number"
                        value={char.center[axis]}
                        onChange={(e) =>
                          update(char.id, {
                            center: {
                              ...char.center,
                              [axis]: Math.min(1, Math.max(0, Number(e.target.value))),
                            },
                          })
                        }
                        min={0}
                        max={1}
                        step={0.01}
                        className="w-16 rounded bg-slate-900/60 px-2 py-0.5 text-slate-300 outline-none border border-slate-700/40 focus:border-violet-500 transition-colors"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {characters.length === 0 && (
        <p className="text-xs italic text-slate-600">
          Add characters to use v4 per-character prompts.
        </p>
      )}
    </div>
  );
}
