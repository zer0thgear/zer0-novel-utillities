'use client';

import { useState } from 'react';
import { CharacterPromptEntry, NovelAIModel, PromptTidbit } from '@/types/novelai';
import { createTidbit } from '@/lib/promptTidbits';
import { useSessionStore } from '@/store/sessionStore';
import { TagAutocompleteField } from '@/components/TagAutocompleteField';

interface Props {
  characters: CharacterPromptEntry[];
  onChange: (characters: CharacterPromptEntry[]) => void;
  /** Max simultaneously-enabled characters, per the selected model (6 for V4/V4.5, 22 for V5). */
  maxEnabled?: number;
  model: NovelAIModel;
}

type ActiveTab = 'prompt' | 'uc';

export function CharacterPromptsEditor({ characters, onChange, maxEnabled = 6, model }: Props) {
  const apiKey = useSessionStore((s) => s.apiKey);
  const [activeTabs, setActiveTabs] = useState<Record<string, ActiveTab>>({});

  const enabledCount = characters.filter((c) => c.enabled).length;
  const atCap = enabledCount >= maxEnabled;

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

  const addTidbit = (charId: string) => {
    const char = characters.find((c) => c.id === charId);
    if (!char) return;
    const tidbits = char.tidbits ?? [];
    update(charId, { tidbits: [...tidbits, createTidbit(`Tidbit ${tidbits.length + 1}`)] });
  };

  const updateTidbit = (charId: string, tidbitId: string, changes: Partial<PromptTidbit>) => {
    const char = characters.find((c) => c.id === charId);
    if (!char) return;
    update(charId, {
      tidbits: (char.tidbits ?? []).map((t) => (t.id === tidbitId ? { ...t, ...changes } : t)),
    });
  };

  const removeTidbit = (charId: string, tidbitId: string) => {
    const char = characters.find((c) => c.id === charId);
    if (!char) return;
    update(charId, { tidbits: (char.tidbits ?? []).filter((t) => t.id !== tidbitId) });
  };

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
              ({enabledCount}/{maxEnabled} active)
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
                      ? `Maximum ${maxEnabled} characters can be active at once`
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
                <TagAutocompleteField
                  as="textarea"
                  rows={3}
                  value={tab === 'prompt' ? char.prompt : char.uc}
                  onChange={(text) =>
                    update(char.id, { [tab === 'prompt' ? 'prompt' : 'uc']: text })
                  }
                  model={model}
                  apiKey={apiKey}
                  placeholder={
                    tab === 'prompt'
                      ? 'girl, solo, anthro, …'
                      : 'negative tags for this character…'
                  }
                  className="w-full resize-none rounded-lg bg-slate-900/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none border border-slate-700/40 focus:border-violet-500 transition-colors"
                />

                {/* Tidbits — toggleable sub-prompts appended to the prompt above when enabled */}
                {tab === 'prompt' && (
                  <div className="flex flex-col gap-1.5">
                    {(char.tidbits ?? []).map((tidbit) => (
                      <div key={tidbit.id} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={tidbit.enabled}
                          onChange={(e) => updateTidbit(char.id, tidbit.id, { enabled: e.target.checked })}
                          className="h-3.5 w-3.5 flex-shrink-0 accent-violet-500"
                        />
                        <input
                          type="text"
                          value={tidbit.label}
                          onChange={(e) => updateTidbit(char.id, tidbit.id, { label: e.target.value })}
                          placeholder="Label"
                          className="w-16 flex-shrink-0 rounded bg-slate-700/60 px-1.5 py-1 text-xs text-slate-300 outline-none border border-transparent focus:border-violet-500/60 transition-colors"
                        />
                        <TagAutocompleteField
                          as="input"
                          value={tidbit.text}
                          onChange={(text) => updateTidbit(char.id, tidbit.id, { text })}
                          model={model}
                          apiKey={apiKey}
                          placeholder="red dress, ..."
                          wrapperClassName="relative min-w-0 flex-1"
                          className="w-full rounded bg-slate-900/50 px-2 py-1 text-xs text-slate-100 outline-none border border-slate-700/40 focus:border-violet-500 transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => removeTidbit(char.id, tidbit.id)}
                          title="Remove tidbit"
                          className="flex-shrink-0 text-xs text-slate-600 hover:text-red-400 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addTidbit(char.id)}
                      className="flex items-center gap-1 self-start text-xs text-slate-600 hover:text-violet-400 transition-colors"
                    >
                      <span>+</span> Add Tidbit
                    </button>
                  </div>
                )}

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
